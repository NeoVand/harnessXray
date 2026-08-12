<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import type { IconValue } from '$lib/icons';
	import type { Snippet } from 'svelte';

	/**
	 * One instrument in the cockpit: a labelled, tinted frame around a panel.
	 *
	 * The tint is the point. Measuring the Aurora theme turned up the reason this
	 * app reads as a terminal rather than an instrument — only ~15% of its text
	 * area carries a legend colour, and the other 85% is the same near-white in
	 * every theme and every panel. Colour was doing all its work inside the
	 * panels and none between them, so three columns of dense text read as three
	 * identical dark rectangles.
	 *
	 * A bay takes its subsystem's own colour from the legend — sage for the
	 * filesystem, ochre for tools, clay for memory — and spends it on the frame:
	 * the eyebrow, the hairline, and a wash that fades out under the content.
	 * Nothing new is asserted, because these are the colours those subsystems
	 * already use; they simply become visible at arm's length. The result is that
	 * the cockpit reads as eleven different materials rather than eleven windows.
	 *
	 * The wash stops before the content starts. A tint behind body text is a
	 * legibility cost paid on every word, and the frame has already said which
	 * instrument this is.
	 */
	interface Props {
		label: string;
		icon: IconValue;
		/** A `--hx-*` custom property name — the subsystem's own colour. */
		tone: string;
		/** Optional readout on the right of the eyebrow, e.g. a live count. */
		badge?: string | number;
		/** Which way the bay faces, for the cockpit's wrap. */
		face?: 'left' | 'right' | 'flat';
		/**
		 * For panels that already draw their own header. `PlanPanel` owns its
		 * revision stepper and titles itself, so a bay header above it reads
		 * "PLAN / PLAN" — the frame keeps its tone as a top edge instead, which
		 * says the same thing in the same colour without saying it twice.
		 */
		bare?: boolean;
		children: Snippet;
	}
	let { label, icon, tone, badge, face = 'flat', bare = false, children }: Props = $props();
</script>

<section class="hx-bay hx-bay-{face}" class:hx-bay-bare={bare} style:--tone="var({tone})">
	{#if !bare}
		<header class="hx-bay-head">
			<HugeiconsIcon {icon} size={11} strokeWidth={1.5} />
			<span class="hx-eyebrow">{label}</span>
			{#if badge !== undefined && badge !== ''}
				<span class="hx-num hx-bay-badge">{badge}</span>
			{/if}
		</header>
	{/if}
	<div class="hx-bay-body">
		{@render children()}
	</div>
</section>

<style>
	.hx-bay {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		border: 1px solid color-mix(in oklab, var(--tone) 26%, transparent);
		border-radius: var(--radius-md);
		background: var(--background);
		overflow: hidden;
		/* Backface and flat rendering are cheap here and stop the tilted bays from
		   resampling their text through a 3D layer on every repaint. */
		backface-visibility: hidden;
	}

	/* The tone as a top edge, for bays whose panel draws its own header. */
	.hx-bay-bare {
		border-top: 2px solid color-mix(in oklab, var(--tone) 55%, transparent);
	}

	/*
		The wrap, and why it defaults to off.

		Each side rotates about its INNER edge so the outer edge swings toward the
		viewer — the shape of a cockpit closing around a seat rather than a wall of
		screens photographed off-axis. It is the obvious way to get the Iron Man
		read, and measured against a flat layout it loses badly.

		A rotateY resamples everything inside it, and the first casualty is exactly
		what this app is made of: 10px uppercase mono at 0.09em tracking. At 3° —
		barely enough tilt to notice — the flank eyebrows are visibly soft and the
		whole side of the screen reads as slightly out of focus. There is no angle
		that buys depth before it costs legibility, because the type is small
		enough that it costs legibility immediately.

		So depth here comes from tone instead (see the cockpit's shadow on the chat
		bay): things in front are brighter and cast, things behind sit back. Costs
		nothing to render and nothing to read. The knob stays, on `[` and `]`,
		because being able to reproduce the bad version is how the good one stays
		argued for — but it starts at zero.
	*/
	.hx-bay-left {
		transform-origin: right center;
		transform: perspective(1800px) rotateY(calc(-1 * var(--hx-wrap, 0deg)));
	}
	.hx-bay-right {
		transform-origin: left center;
		transform: perspective(1800px) rotateY(var(--hx-wrap, 0deg));
	}

	.hx-bay-head {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0 0.5rem;
		height: 22px;
		flex: none;
		color: var(--tone);
		border-bottom: 1px solid color-mix(in oklab, var(--tone) 18%, transparent);
		/* The wash lives in the header only — see the note above about tinting
		   behind body text. */
		background: color-mix(in oklab, var(--tone) 9%, var(--background));
	}

	.hx-bay-badge {
		margin-left: auto;
		font-size: 9px;
		opacity: 0.75;
	}

	.hx-bay-body {
		position: relative;
		flex: 1;
		min-height: 0;
		min-width: 0;
		overflow: hidden;
	}
</style>
