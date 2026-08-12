<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';
	import Bay from './Bay.svelte';

	import Conversation from '$lib/components/chat/Conversation.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import GraphView from '$lib/components/xray/GraphView.svelte';
	import EventTimeline from '$lib/components/xray/EventTimeline.svelte';
	import ContextPanel from '$lib/components/xray/ContextPanel.svelte';
	import FilesPanel from '$lib/components/xray/FilesPanel.svelte';
	import MemoryPanel from '$lib/components/xray/MemoryPanel.svelte';
	import ToolsPanel from '$lib/components/xray/ToolsPanel.svelte';
	import SubagentsPanel from '$lib/components/xray/SubagentsPanel.svelte';
	import SkillsPanel from '$lib/components/xray/SkillsPanel.svelte';
	import PlanPanel from '$lib/components/xray/PlanPanel.svelte';
	import RunPanel from '$lib/components/xray/RunPanel.svelte';

	import { cockpit } from '$lib/state/cockpit.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { runTotals, money, compact } from '$lib/xray/usage';

	/** Opening the settings sheet belongs to the page — it owns the sheet. */
	let { onopensettings }: { onopensettings: () => void } = $props();

	/**
	 * The cockpit.
	 *
	 * Eleven instruments and a conversation, all live, none hidden. The layout is
	 * a five-row grid: a status rail across the top, three rows of bays flanking
	 * a chat column that spans all of them, and a deck along the bottom for the
	 * things that change slowly enough to read in a strip.
	 *
	 * What goes where is decided by rate of change, not by category. The left
	 * flank is the run happening — topology, events, the context being assembled
	 * for the next call. The right flank is what the run has produced — the file
	 * tree, whatever is open, what was committed to memory. The deck holds the
	 * standing state: the plan, the tools on the wire, the subagents, the skills
	 * in context, and the ledger. Fast things sit closest to the conversation,
	 * because those are the ones you watch while it talks.
	 *
	 * Every panel here is the SAME component the working layout uses, given a
	 * different box. That is deliberate and it is the reason this is a mode
	 * rather than a fork: a cockpit built from reimplemented panels would drift
	 * from the app it claims to X-ray within a week, and the drift would be
	 * invisible precisely because nobody would have both on screen at once.
	 */

	let selectedId = $state<string | null>(null);
	let openPath = $state<string | null>(null);
	let composerH = $state(64);
	const noneHidden = new SvelteSet<string>();

	const totals = $derived(runTotals(bus, session.model));
	const fileCount = $derived(Object.keys(session.files ?? {}).length);

	/**
	 * The wrap angle, in degrees. Off by default — see the long note in Bay.svelte
	 * for what measuring it showed. `[` and `]` reach it.
	 */
	let wrap = $state(0);

	// Escape is handled by the page, which owns the one window listener — see the
	// note there about it outranking `session.stop()`.
	function onkeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement | null;
		if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;
		// The wrap is worth being able to argue with while looking at it.
		if (e.key === '[') wrap = Math.max(0, wrap - 1);
		if (e.key === ']') wrap = Math.min(8, wrap + 1);
	}
</script>

<svelte:window {onkeydown} />

<div class="hx-cockpit" style:--hx-wrap="{wrap}deg">
	<!-- ── Status rail ─────────────────────────────────────────────────── -->
	<div class="hx-rail">
		<span class="flex items-center gap-2">
			<HugeiconsIcon icon={ICON.agent} size={15} strokeWidth={1.5} />
			<span class="hx-wordmark text-[13px] font-semibold tracking-tight">
				harness<span style:color="var(--hx-accent)">Xray</span>
			</span>
		</span>

		<span class="flex items-center gap-1.5">
			<span
				class="hx-dot"
				style:background={session.status === 'idle'
					? 'var(--muted-foreground)'
					: 'var(--hx-accent)'}
				class:hx-live={session.status !== 'idle'}
			></span>
			<span class="hx-eyebrow">{session.status}</span>
		</span>

		<span class="hx-rail-sep"></span>

		{#each [{ k: 'spent', v: money(totals.costUsd), tone: 'var(--hx-accent)' }, { k: 'context', v: compact(totals.lastInput), tone: 'var(--hx-tok-new)' }, { k: 'out', v: compact(totals.output), tone: 'var(--hx-tok-out)' }, { k: 'calls', v: String(totals.calls), tone: 'var(--hx-model)' }, { k: 'files', v: String(fileCount), tone: 'var(--hx-fs)' }] as m (m.k)}
			<span class="flex items-baseline gap-1.5">
				<span class="hx-eyebrow text-muted-foreground">{m.k}</span>
				<span class="hx-num text-[11px]" style:color={m.tone}>{m.v}</span>
			</span>
		{/each}

		<span class="ml-auto flex items-center gap-3">
			<span class="hx-eyebrow text-muted-foreground/60">esc to leave · [ ] wrap</span>
			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => cockpit.close()}
				aria-label="Leave the cockpit"
				{@attach tip('Back to the working layout')}
			>
				<HugeiconsIcon icon={ICON.close} size={14} strokeWidth={1.5} />
			</button>
		</span>
	</div>

	<!-- ── Left flank: the run happening ───────────────────────────────── -->
	<div class="hx-slot" style:grid-area="l1">
		<Bay label="graph" icon={ICON.graph} tone="--hx-state" face="left">
			<GraphView onjump={(id: string) => (selectedId = id)} />
		</Bay>
	</div>

	<div class="hx-slot" style:grid-area="l2">
		<Bay label="events" icon={ICON.events} tone="--hx-model" face="left" badge={bus.events.length}>
			<EventTimeline {selectedId} onselect={(id) => (selectedId = id)} hidden={noneHidden} />
		</Bay>
	</div>

	<div class="hx-slot" style:grid-area="l3">
		<Bay label="context" icon={ICON.context} tone="--hx-tok-new" face="left">
			<ContextPanel view="pieces" />
		</Bay>
	</div>

	<!-- ── The conversation ────────────────────────────────────────────── -->
	<div class="hx-chat">
		<div class="relative h-full min-h-0">
			<Conversation
				{onopensettings}
				onread={(p) => (openPath = p)}
				onpreview={(p) => (openPath = p)}
				topPad="14px"
				bottomPad="{composerH + 8}px"
			/>
			<div class="absolute inset-x-0 bottom-0 z-30" bind:clientHeight={composerH}>
				<Composer />
			</div>
		</div>
	</div>

	<!-- ── Right flank: what the run produced ──────────────────────────── -->
	<!-- `FilesPanel` is the tree AND the preview, split by a handle the reader can
	     drag — so this is one instrument, not two, and it gets two rows to be it
	     in. Splitting them into separate bays would mean rebuilding the wiring
	     between them for no gain. -->
	<div class="hx-slot" style:grid-area="r1">
		<Bay label="files" icon={ICON.files} tone="--hx-fs" face="right" badge={fileCount}>
			<FilesPanel bind:openPath topPad="0px" view="tree" />
		</Bay>
	</div>

	<div class="hx-slot" style:grid-area="r3">
		<Bay label="memory" icon={ICON.memory} tone="--hx-memory" face="right">
			<MemoryPanel />
		</Bay>
	</div>

	<!-- ── Deck: the standing state ────────────────────────────────────── -->
	<div class="hx-deck">
		<Bay label="plan" icon={ICON.todo} tone="--hx-state" bare>
			<PlanPanel onjump={(id: string) => (selectedId = id)} />
		</Bay>
		<Bay label="tools" icon={ICON.tool} tone="--hx-tool">
			<ToolsPanel onjump={(id: string) => (selectedId = id)} />
		</Bay>
		<Bay label="subagents" icon={ICON.subagent} tone="--hx-subagent">
			<SubagentsPanel onjump={(id: string) => (selectedId = id)} />
		</Bay>
		<Bay label="skills" icon={ICON.skill} tone="--hx-accent">
			<SkillsPanel />
		</Bay>
		<Bay label="ledger" icon={ICON.tokens} tone="--hx-tok-out">
			<RunPanel />
		</Bay>
	</div>
</div>

<style>
	.hx-cockpit {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		grid-template-columns: minmax(210px, 0.9fr) minmax(360px, 1.45fr) minmax(210px, 0.9fr);
		grid-template-rows: 30px repeat(3, minmax(0, 1fr)) minmax(130px, 0.75fr);
		grid-template-areas:
			'rail rail rail'
			'l1   chat r1'
			'l2   chat r1'
			'l3   chat r3'
			'deck deck deck';
		gap: 8px;
		padding: 8px;
		background: var(--background);
	}

	.hx-rail {
		grid-area: rail;
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 0 0.5rem;
		min-width: 0;
		overflow: hidden;
	}
	.hx-rail-sep {
		width: 1px;
		height: 12px;
		background: var(--border);
	}
	.hx-dot {
		width: 5px;
		height: 5px;
		border-radius: 999px;
		flex: none;
	}
	.hx-live {
		animation: hx-cockpit-pulse 1.6s ease-in-out infinite;
	}
	@keyframes hx-cockpit-pulse {
		50% {
			opacity: 0.3;
		}
	}

	/* The slots exist so the grid can size a cell while the bay inside it is free
	   to be transformed. Rotating a grid ITEM works, but it also means the
	   transform participates in nothing predictable when the row is fractional —
	   this way the box is laid out flat and only its contents lean. */
	.hx-slot {
		min-width: 0;
		min-height: 0;
		display: flex;
	}
	.hx-slot > :global(*) {
		flex: 1;
		min-width: 0;
	}

	/*
		The conversation sits forward, and that is the only depth cue in here.

		Rotating the flanks was the obvious way to get a cockpit and it wrecked the
		type (Bay.svelte carries the measurement). Tone does the same job for free:
		one soft ambient cast under the chat bay, tinted with the colour that
		already means "you" everywhere else in the app. Nothing is resampled, so
		every instrument stays exactly as sharp as it is in the working layout.
	*/
	.hx-chat {
		grid-area: chat;
		min-width: 0;
		min-height: 0;
		border: 1px solid color-mix(in oklab, var(--hx-user) 30%, transparent);
		border-radius: var(--radius-lg);
		background: var(--background);
		overflow: hidden;
		box-shadow:
			0 0 34px -6px color-mix(in oklab, var(--hx-user) 20%, transparent),
			0 18px 50px -24px oklch(0 0 0 / 0.55);
	}

	.hx-deck {
		grid-area: deck;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 8px;
		min-width: 0;
		min-height: 0;
	}

	/* Below this the wrap is noise and the flanks are too narrow to read. The
	   cockpit is a wide-screen mode and says so by leaving rather than by
	   degrading into a worse version of the working layout. */
	/*
		Narrow: one column, everything stacked, the page scrolls.

		The row list must have exactly as many entries as the area map has rows —
		eight here. It had six, and the two rows past the end fell through to
		implicit `auto` sizing, which for a flex child with `min-height: 0` means
		nine pixels. The bays were all still there, all still live, and all
		invisible. Sizes are floors rather than fractions because a fraction of a
		scrolling container is not a length.
	*/
	@media (max-width: 1100px) {
		.hx-cockpit {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows:
				30px
				minmax(340px, auto)
				repeat(5, minmax(220px, auto))
				minmax(300px, auto);
			grid-template-areas:
				'rail'
				'chat'
				'l1'
				'l2'
				'l3'
				'r1'
				'r3'
				'deck';
			overflow-y: auto;
		}
		.hx-deck {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-auto-rows: minmax(150px, auto);
		}
	}
</style>
