<script lang="ts">
	import * as Resizable from '$lib/components/ui/resizable';
	import GraphView from './GraphView.svelte';
	import FilesPanel from './FilesPanel.svelte';
	import MemoryPanel from './MemoryPanel.svelte';
	import SkillsPanel from './SkillsPanel.svelte';
	import ToolsPanel from './ToolsPanel.svelte';
	import SubagentsPanel from './SubagentsPanel.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON, type IconValue } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';

	interface Props {
		/** A figure clicked in the timeline; the files pane focuses on it. */
		openPath?: string | null;
		/** Which dashboard is showing. Owned by the page so it survives the
		 * whole inspector unmounting when a document opens. */
		bottom?: Bottom;
		/** Open a path in the full-screen reader. */
		onread?: (path: string) => void;
		/** The graph wants to move the timeline selection. */
		onjump?: (eventId: string) => void;
		/** Open the skill library. */
		onmanageskills?: () => void;
	}
	/**
	 * Which reading of the filesystem the top pane shows.
	 *
	 * Owned here because the switch lives in this header, one boundary above the
	 * panel it drives — the same arrangement as the context pane's pieces/raw.
	 */
	let files = $state<'tree' | 'log'>('tree');

	let {
		openPath = $bindable<string | null>(null),
		bottom = $bindable<Bottom>('graph'),
		onread,
		onjump,
		onmanageskills
	}: Props = $props();

	/**
	 * One document, one row of dashboards.
	 *
	 * The filesystem is the only panel left that behaves like a document — it
	 * wants the room, and it is the agent's actual work product, so it earned
	 * the permanent slot. Event payloads moved into the timeline itself: the
	 * detail now expands under the row that names it, where the click already
	 * was. Below, the dashboards — graph first, because the default view
	 * should be the one that is alive while a run is going.
	 */
	// The ledger moved to the events column, where it shares a switch with the
	// timeline: both answer "what did this run do", one in events and one in
	// money, and they were never wanted at the same moment as the graph.
	type Bottom = 'graph' | 'tools' | 'subagents' | 'skills' | 'memory';

	// The hint is what the tab *shows*, not what it is called — the label
	// already says that, and a tooltip repeating the word under the pointer
	// teaches nobody anything.
	const BOTTOM_TABS: { id: Bottom; label: string; icon: IconValue; hint: string }[] = [
		{
			id: 'graph',
			label: 'graph',
			icon: ICON.graph,
			hint: 'The assembled machine — nodes and edges read from the running graph'
		},
		{
			id: 'tools',
			label: 'tools',
			icon: ICON.tool,
			hint: 'Every tool the model was offered, and what each schema costs on every request'
		},
		{
			id: 'subagents',
			label: 'subagents',
			icon: ICON.subagent,
			hint: 'Every subagent the model may dispatch, what each carries, and what it spent'
		},
		{
			id: 'skills',
			label: 'skills',
			icon: ICON.skill,
			hint: 'The markdown manuals the agent can open, and what each one costs'
		},
		{
			id: 'memory',
			label: 'memory',
			icon: ICON.memory,
			hint: 'The store that outlives this chat — everything under /memories/'
		}
	];

	/**
	 * A tool the subagents tab asked the toolbox to open.
	 *
	 * A fresh object per request, deliberately: clicking the same chip twice
	 * should land twice, and identity is what the toolbox's effect keys on.
	 */
	let toolFocus = $state<{ carrier: string; tool: string } | null>(null);
	function openTool(carrier: string, tool: string) {
		toolFocus = { carrier, tool };
		bottom = 'tools';
	}

	const counts = $derived({
		files: session.fileList.length,
		memories: session.memories.length
	});
</script>

<Resizable.PaneGroup direction="vertical" autoSaveId="hx:inspector-v3" class="h-full">
	<!-- The document -->
	<Resizable.Pane defaultSize={62} minSize={30}>
		<div class="relative h-full min-h-0">
			<header
				class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-9 items-center gap-3.5
				       border-b px-3"
			>
				{#each [{ id: 'tree', label: 'files', icon: ICON.files, hint: 'The filesystem as the agent organised it' }, { id: 'log', label: 'log', icon: ICON.ordered, hint: 'Every write in order, newest first — and which agent made it' }] as v (v.id)}
					<button
						class="hx-eyebrow flex h-full items-center gap-1.5 transition-colors
						       hover:text-foreground"
						style:color={files === v.id ? 'var(--hx-accent)' : undefined}
						onclick={() => (files = v.id as 'tree' | 'log')}
						{@attach tip(v.hint)}
					>
						<HugeiconsIcon icon={v.icon} size={12} strokeWidth={1.5} />
						{v.label}
						{#if v.id === 'tree' && counts.files}
							<span class="hx-num text-[9px] opacity-60">{counts.files}</span>
						{/if}
					</button>
				{/each}
			</header>

			<!-- No wrapper padding: the tree carries it inside its own scroller,
			     so file rows slide under the frosted bar instead of clipping. -->
			<div class="h-full overflow-hidden">
				<FilesPanel bind:openPath {onread} topPad="36px" view={files} />
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
						onclick={() => {
							// Reaching the toolbox by its own tab is a fresh visit, not a
							// replay of the last chip someone clicked three panels ago.
							toolFocus = null;
							bottom = t.id;
						}}
						{@attach tip(t.hint)}
					>
						<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
						{t.label}
						<!-- No count on `skills`: the library is a fixed three and a number
						     that never changes is furniture. `memories` earns one because it
						     grows during a run. -->
						{#if t.id === 'memory' && counts.memories}
							<span class="hx-num text-[9px] opacity-60">{counts.memories}</span>
						{/if}
					</button>
				{/each}
			</header>

			<div
				class="h-full pt-8"
				class:overflow-auto={bottom !== 'memory'}
				class:overflow-hidden={bottom === 'memory'}
			>
				{#if bottom === 'skills'}
					<SkillsPanel onmanage={onmanageskills} />
				{:else if bottom === 'tools'}
					<ToolsPanel {onjump} focus={toolFocus} />
				{:else if bottom === 'subagents'}
					<SubagentsPanel {onjump} onopentool={openTool} />
				{:else if bottom === 'memory'}
					<MemoryPanel />
				{:else}
					<!-- The graph's tools node points here rather than opening its own
					     overlay: same affordance, no panel parked on the drawing. -->
					<GraphView {onjump} onopentools={() => (bottom = 'tools')} />
				{/if}
			</div>
		</div>
	</Resizable.Pane>
</Resizable.PaneGroup>
