<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * One instrument. No border, no card, no box.
	 *
	 * The first cockpit drew a bordered frame around every panel, which produced
	 * eleven rectangles in a grid — a bento box, not a cockpit. Borders are how
	 * you say "these things are separate" when the things themselves cannot say
	 * it; a dial, a ribbon and a treemap are already obviously three different
	 * objects, and drawing a line around each one only adds eleven more lines to
	 * a screen that is trying to look like an instrument panel.
	 *
	 * So separation comes from space and from tone. Each instrument is a small
	 * label in its subsystem's colour and a drawing beneath it, sitting directly
	 * on the field. The label is the only chrome.
	 */
	interface Props {
		label: string;
		/** A `--hx-*` custom property name — the subsystem's own colour. */
		tone: string;
		/** A short readout beside the label. Numbers, not sentences. */
		readout?: string;
		/** Lifts the label when the instrument is doing something right now. */
		live?: boolean;
		children: Snippet;
	}
	let { label, tone, readout, live = false, children }: Props = $props();
</script>

<section class="hx-inst" style:--tone="var({tone})" class:hx-inst-live={live}>
	<header>
		<span class="hx-eyebrow">{label}</span>
		{#if readout}<span class="hx-num">{readout}</span>{/if}
	</header>
	<div class="hx-inst-body">{@render children()}</div>
</section>

<style>
	.hx-inst {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		gap: 0.3rem;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex: none;
		padding-left: 1px;
		/* Resting at 55% so a screen of eleven labels reads as texture rather than
		   as eleven competing headings. The instrument is the content. */
		color: color-mix(in oklab, var(--tone) 55%, transparent);
		transition: color 240ms ease;
	}
	.hx-inst-live header {
		color: var(--tone);
	}
	header .hx-num {
		margin-left: auto;
		font-size: 9px;
		opacity: 0.85;
	}

	.hx-inst-body {
		position: relative;
		flex: 1;
		min-height: 0;
		min-width: 0;
	}
</style>
