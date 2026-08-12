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
		<div class="relative h-full min-h-0">
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
	/* Ratios rather than equal thirds: the graph and the treemap earn area, the
	   ring and the lanes are legible small. */
	.hx-left > :global(:nth-child(1)) {
		flex: 1.15;
	}
	.hx-left > :global(:nth-child(2)) {
		flex: 0.85;
	}
	.hx-left > :global(:nth-child(3)) {
		flex: 0.9;
	}
	.hx-right > :global(:nth-child(1)) {
		flex: 0.9;
	}
	.hx-right > :global(:nth-child(2)) {
		flex: 1.5;
	}
	.hx-right > :global(:nth-child(3)) {
		flex: 0.7;
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

	.hx-deck {
		grid-area: deck;
		display: grid;
		grid-template-columns: 1.1fr 0.85fr 1.15fr 1.15fr 1fr;
		gap: 22px;
		min-width: 0;
		min-height: 0;
	}
	.hx-deck > :global(*) {
		min-width: 0;
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
