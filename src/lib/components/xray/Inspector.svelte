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
	import PromptPanel from './PromptPanel.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON, type IconValue } from '$lib/icons';

	interface Props {
		selectedId: string | null;
	}
	let { selectedId }: Props = $props();

	/**
	 * Two regions, because the panels are not the same size of thing.
	 *
	 * `detail` / `raw` / `files` are documents — they want the room. `plan`,
	 * `prompt` and `graph` are dashboards: mostly short, and far more useful
	 * *while* you are reading something else. Stacking them means you can watch
	 * the plan tick over as a file is written, instead of tabbing away from one
	 * to see the other.
	 */
	type Top = 'detail' | 'raw' | 'files' | 'memory';
	type Bottom = 'plan' | 'prompt' | 'graph';

	let top = $state<Top>('detail');
	let bottom = $state<Bottom>('plan');

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
		{ id: 'prompt', label: 'prompt', icon: ICON.prompt },
		{ id: 'graph', label: 'graph', icon: ICON.graph }
	];

	const counts = $derived({
		todos: session.todos.length,
		files: session.fileList.length,
		memories: session.memories.length
	});
</script>

<Resizable.PaneGroup direction="vertical" autoSaveId="hx:inspector" class="h-full">
	<!-- Documents -->
	<Resizable.Pane defaultSize={66} minSize={30}>
		<div class="flex h-full min-h-0 flex-col">
			<header class="hx-rule flex items-center gap-3.5 border-b px-3">
				{#each TOP_TABS as t (t.id)}
					<button
						class="hx-eyebrow relative flex items-center gap-1.5 py-2.5 transition-colors
						       hover:text-foreground"
						class:text-foreground={top === t.id}
						onclick={() => (top = t.id)}
					>
						<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
						{t.label}
						{#if t.id === 'files' && counts.files}
							<span class="hx-num text-[9px] opacity-60">{counts.files}</span>
						{:else if t.id === 'memory' && counts.memories}
							<span class="hx-num text-[9px] opacity-60">{counts.memories}</span>
						{/if}
						{#if top === t.id}
							<span class="absolute inset-x-0 -bottom-px h-px bg-foreground"></span>
						{/if}
					</button>
				{/each}

				{#if event && top !== 'files' && top !== 'memory'}
					<span class="hx-num ml-auto shrink-0 text-[10px] text-muted-foreground/70">
						{stamp(event.t)}
						{#if event.kind === 'http_request'}· {bytes(event.bytes)}{/if}
						{#if event.kind === 'http_response'}· {Math.round(event.ms)}ms{/if}
					</span>
				{/if}
			</header>

			<div
				class="min-h-0 flex-1"
				class:overflow-auto={top !== 'files' && top !== 'memory'}
				class:overflow-hidden={top === 'files' || top === 'memory'}
			>
				{#if top === 'files'}
					<FilesPanel />
				{:else if top === 'memory'}
					<MemoryPanel />
				{:else if !event}
					<p class="px-4 py-6 text-xs text-muted-foreground">
						Select an event in the timeline to dissect it.
					</p>
				{:else if top === 'detail'}
					<div class="px-3 py-3">
						<JsonView value={detailOf(event)} openTo={3} />
					</div>
					{#if frames.length}
						<div class="hx-rule border-t px-3 py-3">
							<p class="hx-eyebrow mb-2">{frames.length} stream frames</p>
							<JsonView
								value={frames.map((f) => (f.kind === 'http_sse_frame' ? f.parsed : null))}
								openTo={1}
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
	<Resizable.Pane defaultSize={34} minSize={12} collapsible collapsedSize={6}>
		<div class="flex h-full min-h-0 flex-col">
			<header class="hx-rule flex items-center gap-3.5 border-y px-3">
				{#each BOTTOM_TABS as t (t.id)}
					<button
						class="hx-eyebrow relative flex items-center gap-1.5 py-2 transition-colors
						       hover:text-foreground"
						class:text-foreground={bottom === t.id}
						onclick={() => (bottom = t.id)}
					>
						<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
						{t.label}
						{#if t.id === 'plan' && counts.todos}
							<span class="hx-num text-[9px] opacity-60">{counts.todos}</span>
						{/if}
						{#if bottom === t.id}
							<span class="absolute inset-x-0 -bottom-px h-px bg-foreground"></span>
						{/if}
					</button>
				{/each}
			</header>

			<div class="min-h-0 flex-1 overflow-auto">
				{#if bottom === 'plan'}
					<TodoPanel />
				{:else if bottom === 'prompt'}
					<PromptPanel />
				{:else}
					<GraphView />
				{/if}
			</div>
		</div>
	</Resizable.Pane>
</Resizable.PaneGroup>
