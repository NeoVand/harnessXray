<script lang="ts">
	import Instrument from './Instrument.svelte';
	import ToolDial from './gauges/ToolDial.svelte';
	import EventRibbon from './gauges/EventRibbon.svelte';
	import ContextRing from './gauges/ContextRing.svelte';
	import FileField from './gauges/FileField.svelte';
	import CrewLanes from './gauges/CrewLanes.svelte';
	import PlanTrack from './gauges/PlanTrack.svelte';
	import SpendBars from './gauges/SpendBars.svelte';

	import Conversation from '$lib/components/chat/Conversation.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import SkillChips from './gauges/SkillChips.svelte';
	import MemoryCells from './gauges/MemoryCells.svelte';
	import GraphView from '$lib/components/xray/GraphView.svelte';
	import Markdown from '$lib/components/Markdown.svelte';

	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';

	/**
	 * The cockpit.
	 *
	 * Version one of this was a bento box: eleven bordered rectangles in a grid,
	 * each holding a full-fidelity panel squeezed into a fraction of the room it
	 * was built for, so every one of them scrolled. That is the exact failure the
	 * mode exists to fix — the working layout already hides things behind tabs,
	 * and hiding them behind scrollbars instead is not an improvement. It also
	 * covered the app's own header, taking the way out with it.
	 *
	 * Three rules came out of that:
	 *
	 * 1. NOTHING SCROLLS except a document. Every instrument is drawn to fit
	 *    whatever box it is given — a dial, a ribbon, a ring, a treemap — so the
	 *    space it has is the space it needs. The one scroller left is the file
	 *    preview, which is a document, and documents are allowed to be long.
	 * 2. NO BORDERS. Separation comes from space and from each subsystem's own
	 *    colour. A drawn instrument does not need a line around it to be a
	 *    distinct object, and eleven such lines are what made it read as a form.
	 * 3. THE APP'S HEADER STAYS. The cockpit starts below it rather than over it,
	 *    so the book, the theme, settings and the way back are all still one
	 *    click away, live, in the place they always are.
	 *
	 * The layout is a field, not a form: fast-moving instruments down the left
	 * where the eye goes during a run, the artefacts down the right, the standing
	 * state along the bottom, and the conversation through the middle with the
	 * only glow on the screen behind it.
	 */
	interface Props {
		onopensettings: () => void;
		onread: (path: string) => void;
	}
	let { onopensettings, onread }: Props = $props();

	let selectedId = $state<string | null>(null);
	let openPath = $state<string | null>(null);
	let composerH = $state(64);

	/** The preview's text, or nothing. Reading `session.files` keeps it live. */
	const preview = $derived(openPath ? (session.files?.[openPath] ?? '') : '');

	const busy = $derived(session.status !== 'idle');
	const eventCount = $derived.by(() => {
		void bus.version;
		return bus.events.length;
	});
</script>

<div class="hx-cockpit">
	<div class="hx-glow" aria-hidden="true"></div>

	<!-- ── Left: the run happening ─────────────────────────────────────── -->
	<div class="hx-col hx-left">
		<Instrument label="graph" tone="--hx-state" live={busy}>
			<GraphView onjump={(id: string) => (selectedId = id)} />
		</Instrument>

		<Instrument label="events" tone="--hx-model" readout={String(eventCount)} live={busy}>
			<EventRibbon {selectedId} onselect={(id) => (selectedId = id)} />
		</Instrument>

		<Instrument label="context" tone="--hx-tok-new">
			<ContextRing />
		</Instrument>
	</div>

	<!-- ── The conversation ────────────────────────────────────────────── -->
	<div class="hx-chat">
		<!--
			`flex flex-col`, and it is load-bearing.

			`Conversation`'s own root element IS the scroller, and it is declared
			`min-h-0 flex-1 overflow-y-auto` — i.e. it expects to be a flex child that
			gets its height from the column it sits in. Given a plain block parent,
			`flex-1` is inert, the scroller sizes to its CONTENT, and `overflow-y:
			auto` never triggers because nothing overflows the scroller — it overflows
			the box around it, which clips it.

			The symptom was that a long turn simply ended at the bottom edge with no
			way to reach it: an approval card's buttons were below the fold and there
			was nothing to scroll. Measured 834px of scroller inside a 706px box.
		-->
		<div class="relative flex h-full min-h-0 flex-col">
			<Conversation
				{onopensettings}
				{onread}
				onpreview={(p) => (openPath = p)}
				topPad="10px"
				bottomPad="{composerH + 8}px"
			/>
			<div class="absolute inset-x-0 bottom-0 z-30" bind:clientHeight={composerH}>
				<Composer />
			</div>
		</div>
	</div>

	<!-- ── Right: what the run produced ────────────────────────────────── -->
	<div class="hx-col hx-right">
		<Instrument
			label="filesystem"
			tone="--hx-fs"
			readout={String(Object.keys(session.files ?? {}).length)}
		>
			<FileField selected={openPath} onopen={(p) => (openPath = p)} />
		</Instrument>

		<Instrument
			label={openPath ? (openPath.split('/').pop() ?? 'preview') : 'preview'}
			tone="--hx-file-doc"
		>
			<!-- The one scroller in here, and the only thing that should be. -->
			<div class="hx-preview">
				{#if openPath && preview}
					<Markdown source={preview} onopen={(p) => (openPath = p)} />
				{:else}
					<span class="hx-idle">pick a file</span>
				{/if}
			</div>
		</Instrument>

		<Instrument label="memory" tone="--hx-memory">
			<MemoryCells />
		</Instrument>
	</div>

	<!-- ── Deck: standing state ────────────────────────────────────────── -->
	<div class="hx-deck">
		<Instrument label="plan" tone="--hx-state">
			<PlanTrack />
		</Instrument>
		<Instrument label="tools" tone="--hx-tool">
			<ToolDial onjump={(id) => (selectedId = id)} />
		</Instrument>
		<Instrument label="subagents" tone="--hx-subagent">
			<CrewLanes onjump={(id) => (selectedId = id)} />
		</Instrument>
		<Instrument label="skills" tone="--hx-accent">
			<SkillChips />
		</Instrument>
		<Instrument label="ledger" tone="--hx-tok-out">
			<SpendBars />
		</Instrument>
	</div>
</div>

<style>
	/*
		Starts below the app header (h-10 = 40px), never over it. The header is the
		way back, the theme, the book and settings; covering it was the single
		worst thing about the first version, because it made a view you could enter
		and not leave by any route you already knew.
	*/
	.hx-cockpit {
		position: fixed;
		inset: 40px 0 0;
		z-index: 30;
		display: grid;
		grid-template-columns: minmax(190px, 0.82fr) minmax(340px, 1.5fr) minmax(200px, 0.9fr);
		/* The deck holds gauges that are legible at ~90px; giving it more just
		   parks them in a field of air, since each one centres in its own box. */
		grid-template-rows: minmax(0, 1fr) minmax(104px, 0.26fr);
		grid-template-areas:
			'left chat right'
			'deck deck deck';
		gap: 18px 22px;
		padding: 14px 18px 16px;
		background: var(--background);
		overflow: hidden;
	}

	/*
		The only light in the room, sitting behind the conversation.

		Depth was the point of the wrap that got cut for wrecking the type; this
		does the same job by lighting the middle instead of tilting the sides.
		Nothing is resampled, so every instrument stays exactly as sharp as it is
		anywhere else in the app.
	*/
	.hx-glow {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: radial-gradient(
			62% 55% at 50% 42%,
			color-mix(in oklab, var(--hx-accent) 7%, transparent),
			transparent 70%
		);
	}

	.hx-col {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		gap: 16px;
	}
	.hx-left {
		grid-area: left;
	}
	.hx-right {
		grid-area: right;
	}
	/*
		The arc, and why the flanks are not columns.

		Three instruments stacked with matching left edges is a column, and three
		columns is a grid however little chrome each one has — the alignment does
		the same job a border would, and the eye finds it just as fast. Removing
		borders was not enough on its own.

		So each flank bows: the middle instrument sits furthest out and the ends
		tuck in, which is the shape of a console closing around a seat. It is done
		with margins, not rotation — the earlier wrap was cut for resampling the
		type into mush, and nothing here is transformed, so every instrument stays
		exactly as sharp as it is in the working layout.

		Sizes are deliberately unequal for the same reason. Near-equal thirds read
		as cells; a graph at twice the height of the ring beneath it reads as a
		panel that was laid out rather than divided.
	*/
	.hx-left > :global(:nth-child(1)) {
		flex: 1.45;
		margin-left: 22px;
	}
	.hx-left > :global(:nth-child(2)) {
		flex: 0.72;
		margin-left: 2px;
	}
	.hx-left > :global(:nth-child(3)) {
		flex: 0.83;
		margin-left: 26px;
	}
	.hx-right > :global(:nth-child(1)) {
		flex: 0.85;
		margin-right: 26px;
	}
	.hx-right > :global(:nth-child(2)) {
		flex: 1.6;
		margin-right: 2px;
	}
	.hx-right > :global(:nth-child(3)) {
		flex: 0.6;
		margin-right: 22px;
	}
	.hx-col > :global(*) {
		min-height: 0;
	}

	.hx-chat {
		grid-area: chat;
		position: relative;
		min-width: 0;
		min-height: 0;
		border-radius: var(--radius-lg);
		overflow: hidden;
		/* No border. The conversation is defined by the light behind it and by the
		   space around it, which is how everything else in here is defined too. */
		background: color-mix(in oklab, var(--background) 88%, var(--hx-user) 3%);
		box-shadow: 0 24px 70px -34px oklch(0 0 0 / 0.7);
	}

	/* The deck bows too, the other way: the ends ride up, the middle sits low.
	   Five labels on one baseline is the most grid-like line on the screen, and
	   a few pixels of stagger is enough to break it without anything looking
	   misaligned. Widths are uneven for the same reason. */
	.hx-deck {
		grid-area: deck;
		display: grid;
		grid-template-columns: 1.05fr 0.78fr 1.25fr 1.1fr 0.95fr;
		gap: 26px;
		min-width: 0;
		min-height: 0;
	}
	.hx-deck > :global(*) {
		min-width: 0;
	}
	.hx-deck > :global(:nth-child(1)) {
		padding-top: 0;
	}
	.hx-deck > :global(:nth-child(2)) {
		padding-top: 9px;
	}
	.hx-deck > :global(:nth-child(3)) {
		padding-top: 15px;
	}
	.hx-deck > :global(:nth-child(4)) {
		padding-top: 9px;
	}
	.hx-deck > :global(:nth-child(5)) {
		padding-top: 0;
	}

	.hx-preview {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		padding-right: 6px;
		font-size: 12px;
		scrollbar-gutter: stable;
	}

	.hx-idle {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		opacity: 0.5;
	}

	/* Narrow: one column, stacked, scrolling. The deck folds to two across. */
	@media (max-width: 1180px) {
		.hx-cockpit {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto auto;
			grid-template-areas:
				'chat'
				'left'
				'right'
				'deck';
			overflow-y: auto;
		}
		.hx-chat {
			min-height: 340px;
		}
		.hx-col > :global(*) {
			min-height: 190px;
		}
		.hx-deck {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-auto-rows: minmax(120px, auto);
		}
	}
</style>
