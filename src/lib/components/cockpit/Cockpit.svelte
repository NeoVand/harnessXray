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

	import ThreadList from '$lib/components/chat/ThreadList.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';

	import { session } from '$lib/agent/session.svelte';

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
	 *    click away, live, in the place they always are. New chat and history
	 *    live on the conversation here, for the same reason: a mode you can
	 *    enter and not get back out of is a trap however good it looks.
	 *
	 * 4. NO GRID. This is the third attempt at the arrangement and the first that
	 *    is not one. Version two removed the borders; version three bowed the
	 *    flanks and staggered the deck. Both still read as a form, because a grid
	 *    is legible from ALIGNMENT — shared edges announce themselves however
	 *    little chrome sits on them, and eleven things on a common baseline are a
	 *    table no matter how they are drawn.
	 *
	 * So nothing is tiled. Every instrument is placed at a percentage anchor at
	 * whatever size its reading earns, and some of them overlap on purpose. The
	 * composition has one anchor — the context dial, large, low and left, with
	 * the tool burst crowding its shoulder so the two read as a single assembly —
	 * and the event ribbon stretched the full width behind everything as a
	 * horizon, dimmed to scenery. The conversation floats in the middle with no
	 * container at all: no panel, no border, no shadow, just the glow behind it.
	 */
	interface Props {
		onopensettings: () => void;
		onread: (path: string) => void;
	}
	let { onopensettings, onread }: Props = $props();

	let selectedId = $state<string | null>(null);
	let openPath = $state<string | null>(null);
	let composerH = $state(64);
	let historyOpen = $state(false);

	/** The preview's text, or nothing. Reading `session.files` keeps it live. */
	const preview = $derived(openPath ? (session.files?.[openPath] ?? '') : '');

	const busy = $derived(session.status !== 'idle');
	// No event count any more: the ribbon is the horizon now, unlabelled by
	// design, and a number floating over scenery is chrome the layout is trying
	// to be rid of. The count is still on the events panel in the working layout.
</script>

<div class="hx-cockpit">
	<div class="hx-glow" aria-hidden="true"></div>

	<!--
		The horizon: the event ribbon, edge to edge, BEHIND everything.

		It is the one instrument whose natural shape is the width of the screen —
		a run is a line of time — and boxing it into a flank was the single thing
		most responsible for the whole surface reading as cells. Out here it is
		scenery: dimmed, unlabelled, running under the dial and the chat, so the
		shape of the run is always in peripheral vision and never competing.
	-->
	<div class="hx-horizon">
		<EventRibbon {selectedId} onselect={(id) => (selectedId = id)} />
	</div>

	<!-- ── The instruments, placed rather than tiled ───────────────────── -->
	<div class="hx-at hx-graph">
		<Instrument label="graph" tone="--hx-state" live={busy}>
			<GraphView onjump={(id: string) => (selectedId = id)} />
		</Instrument>
	</div>

	<!-- The dial is the anchor of the composition: twice the size of anything
	     else, in the corner, with the tool burst crowding its shoulder. Two
	     round things overlapping read as one assembly rather than two cells,
	     which is most of what stops this looking like a form. -->
	<div class="hx-at hx-dial">
		<Instrument label="context" tone="--hx-tok-new">
			<ContextRing />
		</Instrument>
	</div>

	<div class="hx-at hx-tools">
		<Instrument label="tools" tone="--hx-tool">
			<ToolDial onjump={(id) => (selectedId = id)} />
		</Instrument>
	</div>

	<!-- ── The conversation ────────────────────────────────────────────── -->
	<div class="hx-chat">
		<!--
			New chat and history, restored.

			The cockpit has no chat-column header, and losing it took these two with
			it. That mattered more than it looks: history is how you get BACK to a
			conversation, so a mode without it is one you can enter and then be
			stranded in — the same charge as covering the app header, one level down.
			They float over the transcript here rather than sitting in a bar, because
			a bar is the thing this layout is trying not to have.
		-->
		<div class="hx-chat-controls">
			<button
				class="transition-colors hover:text-foreground"
				onclick={session.newThread.bind(session)}
				aria-label="New chat"
				{@attach tip('New chat  ⌘N')}
			>
				<HugeiconsIcon icon={ICON.newChat} size={14} strokeWidth={1.5} />
			</button>
			<button
				class="transition-colors hover:text-foreground"
				style:color={historyOpen ? 'var(--hx-accent)' : undefined}
				onclick={() => (historyOpen = !historyOpen)}
				aria-label="History"
				{@attach tip(historyOpen ? 'Hide saved chats' : 'Saved chats on this device')}
			>
				<HugeiconsIcon icon={ICON.history} size={14} strokeWidth={1.5} />
			</button>
		</div>

		{#if historyOpen}
			<div class="hx-history hx-frost hx-rule">
				<ThreadList onclose={() => (historyOpen = false)} />
			</div>
		{/if}

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

	<div class="hx-at hx-files">
		<Instrument
			label="filesystem"
			tone="--hx-fs"
			readout={String(Object.keys(session.files ?? {}).length)}
		>
			<FileField selected={openPath} onopen={(p) => (openPath = p)} />
		</Instrument>
	</div>

	<div class="hx-at hx-doc">
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
	</div>

	<div class="hx-at hx-crew">
		<Instrument label="subagents" tone="--hx-subagent">
			<CrewLanes onjump={(id) => (selectedId = id)} />
		</Instrument>
	</div>

	<div class="hx-at hx-plan">
		<Instrument label="plan" tone="--hx-state">
			<PlanTrack />
		</Instrument>
	</div>

	<div class="hx-at hx-skills">
		<Instrument label="skills" tone="--hx-accent">
			<SkillChips />
		</Instrument>
	</div>

	<div class="hx-at hx-memory">
		<Instrument label="memory" tone="--hx-memory">
			<MemoryCells />
		</Instrument>
	</div>

	<div class="hx-at hx-ledger">
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
	/*
		No grid.

		Two versions tried to make a grid stop looking like one — first by removing
		the borders, then by bowing the flanks and staggering the deck. Neither
		worked, and in hindsight neither could: a grid is legible from the ALIGNMENT,
		and shared edges keep announcing themselves however much chrome you take off
		or however many pixels you nudge. Eleven things on a shared baseline read as
		a form no matter how they are drawn.

		So nothing is tiled. Every instrument is placed by hand at a percentage
		anchor, at whatever size its reading deserves, and several of them overlap on
		purpose. The composition has one anchor — the context dial, big, low and
		left — with the tool burst crowding its shoulder so the two read as one
		assembly, and the event ribbon running the full width behind everything as a
		horizon.

		Percentages rather than pixels so the arrangement breathes with the window,
		and `clamp()` on the sizes so nothing collapses or runs away. Below 1180px it
		gives up and stacks, because a placed composition needs room to be one.
	*/
	.hx-cockpit {
		position: fixed;
		inset: 40px 0 0;
		z-index: 30;
		background: var(--background);
		overflow: hidden;
	}

	/* Everything placed is absolute; only the label + drawing inside is flow. */
	.hx-at {
		position: absolute;
		display: flex;
		min-width: 0;
		min-height: 0;
		/* Above the horizon, which claims z-1 so it sits behind everything placed.
		   Without this the ribbon paints over the low readouts, because a z-index
		   of 1 beats `auto` regardless of DOM order. */
		z-index: 2;
	}
	.hx-at > :global(*) {
		flex: 1;
		min-width: 0;
		min-height: 0;
	}

	.hx-graph {
		left: 1.6%;
		top: 2%;
		width: clamp(190px, 20%, 320px);
		height: clamp(150px, 30%, 300px);
	}

	/* The anchor. Twice anything else, and the only instrument allowed a corner. */
	.hx-dial {
		left: 1.2%;
		bottom: 2.5%;
		width: clamp(200px, 21%, 330px);
		height: clamp(150px, 30%, 260px);
		z-index: 3;
	}

	/* Crowding the dial's shoulder — deliberately overlapping it, so the pair
	   reads as one instrument cluster rather than two neighbours. */
	.hx-tools {
		left: 14%;
		bottom: 15%;
		width: clamp(140px, 14%, 230px);
		height: clamp(120px, 24%, 210px);
		z-index: 4;
	}

	.hx-files {
		right: 1.6%;
		top: 2%;
		width: clamp(190px, 21%, 340px);
		height: clamp(130px, 26%, 260px);
	}
	.hx-doc {
		right: 2.4%;
		top: 31%;
		width: clamp(180px, 19.5%, 320px);
		height: clamp(160px, 34%, 340px);
	}
	.hx-memory {
		right: 1.6%;
		bottom: 3%;
		width: clamp(160px, 17%, 280px);
		height: clamp(70px, 14%, 130px);
	}

	/*
		The small standing readouts, along the bottom under the conversation.

		Deliberately on four different baselines. Placing them at one height would
		rebuild the deck this layout exists to get rid of — the stagger is what
		keeps four things in a row from reading as a row. Their tops stay clear of
		the chat's lower edge (24%) and their right end stops short of the memory
		cell in the corner.
	*/
	.hx-crew {
		left: 30.5%;
		bottom: 1.5%;
		width: clamp(126px, 13%, 205px);
		height: clamp(74px, 13%, 120px);
	}
	.hx-plan {
		left: 45%;
		bottom: 7%;
		width: clamp(104px, 10.5%, 170px);
		height: clamp(58px, 11%, 105px);
	}
	.hx-skills {
		left: 56.5%;
		bottom: 1%;
		width: clamp(110px, 11%, 180px);
		height: clamp(70px, 13%, 120px);
	}
	.hx-ledger {
		left: 68%;
		bottom: 6.5%;
		width: clamp(120px, 12%, 190px);
		height: clamp(64px, 12%, 112px);
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

	/*
		The horizon. Full width, low, behind everything, and dimmed hard.

		At full strength a 900-column ribbon across the whole screen is the loudest
		object in the room and drags the eye off the conversation; at 30% it is
		scenery you read without looking at, which is what a horizon is for. It
		keeps its pointer events, so it is still the fastest way into any moment of
		the run — you just have to aim at it.
	*/
	.hx-horizon {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 20%;
		height: clamp(52px, 9%, 96px);
		z-index: 1;
		opacity: 0.3;
		mask-image: linear-gradient(to right, transparent, #000 12%, #000 88%, transparent);
	}
	.hx-horizon:hover {
		opacity: 0.62;
	}
	/*
		The conversation: no container at all.

		No background, no border, no shadow — the transcript sits directly on the
		field with only the glow behind it, which is the last box on the screen and
		the one that mattered most. What keeps it legible over the horizon is the
		glow plus the ribbon being masked to 30%, not a panel.
	*/
	.hx-chat {
		position: absolute;
		left: 30%;
		right: 26%;
		top: 1.5%;
		/* Stops above the low readouts rather than running to the floor. They are
		   placed, not tiled, so the conversation has to leave them their band —
		   overlapping instruments is the point, overlapping TEXT is a collision. */
		bottom: 24%;
		z-index: 5;
		min-width: 0;
		min-height: 0;
	}

	.hx-chat-controls {
		position: absolute;
		top: 4px;
		right: 2px;
		z-index: 40;
		display: flex;
		gap: 0.6rem;
		color: var(--muted-foreground);
	}

	.hx-history {
		position: absolute;
		inset-inline: 0;
		top: 26px;
		z-index: 45;
		display: flex;
		max-height: 52%;
		flex-direction: column;
		border-bottom-width: 1px;
		border-radius: var(--radius-md);
		box-shadow: 0 10px 30px -18px rgb(0 0 0 / 0.55);
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

	/*
		Narrow: the composition gives up honestly.

		A placed layout needs room to be one — overlapping a dial and a burst in
		400px is a pile, not a composition — so below 1180px everything reverts to
		static flow and stacks. Not a degraded cockpit; a different, simpler one.
	*/
	@media (max-width: 1180px) {
		.hx-cockpit {
			display: flex;
			flex-direction: column;
			gap: 14px;
			padding: 12px;
			overflow-y: auto;
		}
		.hx-at,
		.hx-chat,
		.hx-horizon {
			position: static;
			width: auto;
			height: auto;
			min-height: 150px;
			inset: auto;
			opacity: 1;
			mask-image: none;
		}
		.hx-chat {
			min-height: 340px;
			order: -1;
		}
		.hx-horizon {
			min-height: 70px;
		}
	}
</style>
