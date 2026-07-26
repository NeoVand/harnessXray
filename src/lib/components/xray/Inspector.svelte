<script lang="ts">
	import * as Resizable from '$lib/components/ui/resizable';
	import { bus } from '$lib/xray/bus.svelte';
	import { detailOf, stamp, bytes } from '$lib/xray/format';
	import JsonView from './JsonView.svelte';
	import RawView from './RawView.svelte';
	import GraphView from './GraphView.svelte';
	import TodoPanel from './TodoPanel.svelte';
	import FilesPanel from './FilesPanel.svelte';
	import MemoryPanel from './MemoryPanel.svelte';
	import SkillsPanel from './SkillsPanel.svelte';
	import { skills } from '$lib/agent/skills.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON, type IconValue } from '$lib/icons';
	import { explanations, explain } from '$lib/lab/sidecar.svelte';

	interface Props {
		selectedId: string | null;
		/**
		 * Which tabs are showing. Owned by the page, not by this component,
		 * because opening a document unmounts the whole inspector — local state
		 * would reset to `detail` every time you closed a file, which is not what
		 * "close" should mean.
		 */
		top?: Top;
		bottom?: Bottom;
		/** A figure clicked in the timeline; focuses the files tab on it. */
		openPath?: string | null;
		/** Open a path in the full-screen reader. */
		onread?: (path: string) => void;
		/** The graph wants to move the timeline selection. */
		onjump?: (eventId: string) => void;
		/** Open the skill library. */
		onmanageskills?: () => void;
	}
	let {
		selectedId,
		openPath = $bindable<string | null>(null),
		top = $bindable<Top>('detail'),
		bottom = $bindable<Bottom>('plan'),
		onread,
		onjump,
		onmanageskills
	}: Props = $props();

	/**
	 * Two regions, because the panels are not the same size of thing.
	 *
	 * `detail` / `raw` / `files` are documents — they want the room. `plan`,
	 * `skills` and `graph` are dashboards: mostly short, and far more useful
	 * *while* you are reading something else. Stacking them means you can watch
	 * the plan tick over as a file is written, instead of tabbing away from one
	 * to see the other.
	 *
	 * There used to be a `prompt` tab here. It has gone: the Context tab shows
	 * the same system prompt in its assembled bands, next to everything else in
	 * the window, and two places claiming to show one string is worse than one.
	 */
	type Top = 'detail' | 'raw' | 'files' | 'memory';
	type Bottom = 'plan' | 'skills' | 'graph';

	// Opening a figure should also switch to the tab that can show it.
	$effect(() => {
		if (openPath) top = 'files';
	});

	const event = $derived.by(() => {
		void bus.version;
		return selectedId ? bus.byId(selectedId) : undefined;
	});

	const frames = $derived.by(() => {
		void bus.version;
		if (!event) return [];
		const httpId =
			event.kind === 'http_request'
				? event.id
				: 'httpId' in event
					? (event.httpId as string | undefined)
					: undefined;
		return httpId ? bus.framesOf(httpId) : [];
	});

	const TOP_TABS: { id: Top; label: string; icon: IconValue }[] = [
		{ id: 'detail', label: 'detail', icon: ICON.state },
		{ id: 'raw', label: 'raw', icon: ICON.code },
		{ id: 'files', label: 'files', icon: ICON.files },
		{ id: 'memory', label: 'memory', icon: ICON.memory }
	];

	const BOTTOM_TABS: { id: Bottom; label: string; icon: IconValue }[] = [
		{ id: 'plan', label: 'plan', icon: ICON.todo },
		{ id: 'skills', label: 'skills', icon: ICON.skill },
		{ id: 'graph', label: 'graph', icon: ICON.graph }
	];

	const counts = $derived({
		todos: session.todos.length,
		files: session.fileList.length,
		memories: session.memories.length,
		skills: skills.active.length
	});
</script>

<!-- v2, split 62/38: the same default as the timeline column beside us, so the
     two bottom panels share a rule out of the box. A saved layout under the old
     id would keep the misaligned split forever. -->
<Resizable.PaneGroup direction="vertical" autoSaveId="hx:inspector-v2" class="h-full">
	<!-- Documents -->
	<Resizable.Pane defaultSize={62} minSize={30}>
		<div class="relative h-full min-h-0">
			<header
				class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-9 items-center gap-3.5
				       border-b px-3"
			>
				{#each TOP_TABS as t (t.id)}
					<button
						class="hx-eyebrow flex h-full items-center gap-1.5 transition-colors
						       hover:text-foreground"
						style:color={top === t.id ? 'var(--hx-accent)' : undefined}
						onclick={() => (top = t.id)}
					>
						<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
						{t.label}
						{#if t.id === 'files' && counts.files}
							<span class="hx-num text-[9px] opacity-60">{counts.files}</span>
						{:else if t.id === 'memory' && counts.memories}
							<span class="hx-num text-[9px] opacity-60">{counts.memories}</span>
						{/if}
					</button>
				{/each}

				{#if event && top !== 'files' && top !== 'memory'}
					{#if top === 'detail'}
						<button
							class="hx-eyebrow ml-auto flex shrink-0 items-center gap-1 transition-colors
							       hover:text-foreground"
							onclick={() => event && explain(event)}
							title="Have the lab explain this event — one small luna call, outside the agent"
						>
							<HugeiconsIcon icon={ICON.sparkle} size={11} strokeWidth={1.5} />
							explain
						</button>
					{/if}
					<span
						class="hx-num shrink-0 text-[10px] text-muted-foreground/70"
						class:ml-auto={top !== 'detail'}
					>
						{stamp(event.t)}
						{#if event.kind === 'http_request'}· {bytes(event.bytes)}{/if}
						{#if event.kind === 'http_response'}· {Math.round(event.ms)}ms{/if}
					</span>
				{/if}
			</header>

			<!--
				One rule for clearing the floating header, applied here rather than
				in each branch.

				`pt-9` on the *scrolling* element is the trick: the padding is inside
				the scroll box, so content starts below the header and still slides
				under it as you scroll. Setting it per-branch is how the raw view
				ended up with none — its first lines sat permanently behind the tab
				bar, and since the content was shorter than the pane there was no
				scroll available to recover them.
			-->
			<div
				class="h-full pt-9"
				class:overflow-auto={top !== 'files' && top !== 'memory'}
				class:overflow-hidden={top === 'files' || top === 'memory'}
			>
				{#if top === 'files'}
					<FilesPanel bind:openPath {onread} />
				{:else if top === 'memory'}
					<MemoryPanel />
				{:else if !event}
					<p class="px-4 py-6 text-xs text-muted-foreground">
						Select an event in the timeline to dissect it.
					</p>
				{:else if top === 'detail'}
					{@const ex = explanations.get(event.id)}
					{#if ex}
						<div class="hx-rule border-b px-3 py-3">
							<p class="hx-eyebrow mb-1.5 flex items-center gap-1.5" style:color="var(--hx-state)">
								<HugeiconsIcon icon={ICON.sparkle} size={11} strokeWidth={1.5} />
								{ex.status === 'thinking' ? 'explaining…' : 'explained'}
								<span class="text-muted-foreground/60">— the lab speaking, not the agent</span>
							</p>
							{#if ex.status === 'thinking'}
								<p class="text-xs text-muted-foreground">Reading the payload…</p>
							{:else}
								<p
									class="max-w-[64ch] text-xs leading-relaxed whitespace-pre-wrap"
									class:text-muted-foreground={ex.status === 'error'}
								>
									{ex.text}
								</p>
							{/if}
						</div>
					{/if}
					<div class="px-3 py-3">
						<JsonView value={detailOf(event)} openTo={3} root />
					</div>
					{#if frames.length}
						<div class="hx-rule border-t px-3 py-3">
							<p class="hx-eyebrow mb-2">{frames.length} stream frames</p>
							<JsonView
								value={frames.map((f) => (f.kind === 'http_sse_frame' ? f.parsed : null))}
								openTo={1}
								root
							/>
						</div>
					{/if}
				{:else}
					<RawView {event} {frames} />
				{/if}
			</div>
		</div>
	</Resizable.Pane>

	<Resizable.Handle />

	<!-- Dashboards -->
	<Resizable.Pane defaultSize={38} minSize={12} collapsible collapsedSize={6}>
		<div class="relative h-full min-h-0">
			<header
				class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-8 items-center gap-3.5
				       border-y px-3"
			>
				{#each BOTTOM_TABS as t (t.id)}
					<button
						class="hx-eyebrow flex h-full items-center gap-1.5 transition-colors
						       hover:text-foreground"
						style:color={bottom === t.id ? 'var(--hx-accent)' : undefined}
						onclick={() => (bottom = t.id)}
					>
						<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
						{t.label}
						{#if t.id === 'plan' && counts.todos}
							<span class="hx-num text-[9px] opacity-60">{counts.todos}</span>
						{:else if t.id === 'skills' && counts.skills}
							<span class="hx-num text-[9px] opacity-60">{counts.skills}</span>
						{/if}
					</button>
				{/each}
			</header>

			<div class="h-full overflow-auto pt-8">
				{#if bottom === 'plan'}
					<TodoPanel />
				{:else if bottom === 'skills'}
					<SkillsPanel onmanage={onmanageskills} />
				{:else}
					<GraphView {onjump} />
				{/if}
			</div>
		</div>
	</Resizable.Pane>
</Resizable.PaneGroup>
