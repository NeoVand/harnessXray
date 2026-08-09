<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import type { IconValue } from '$lib/icons';

	/**
	 * A panel with nothing in it yet, with character.
	 *
	 * Every instrument used to say its empty state in prose — two lines
	 * explaining what a filesystem channel is, before anything had been written
	 * to it. Four panels of grey paragraphs is what the app looked like on
	 * arrival, and the graph was the only thing with any life in it, because the
	 * graph draws something TRUE before a run instead of describing what it will
	 * draw later.
	 *
	 * So: the panel's own glyph, large and nearly transparent, in the colour that
	 * panel means everywhere else — and one short line. The icon carries the
	 * identity, the colour carries the legend, and the sentence gets to be a
	 * sentence rather than a paragraph. Anything genuinely worth teaching moves
	 * to a `tip` on the thing it describes, where it is read on purpose.
	 *
	 * `hint` is for the one detail worth a second clause; it sits under the line
	 * at a lower weight and most callers leave it out.
	 */
	interface Props {
		icon: IconValue;
		/** The panel's legend colour, e.g. `var(--hx-fs)`. */
		color: string;
		line: string;
		hint?: string;
	}
	let { icon, color, line, hint }: Props = $props();
</script>

<!--
	Centred in whatever space it is given, with the glyph optically above centre —
	a block of art and text reads as centred when its mass sits slightly high.
-->
<div class="flex h-full min-h-[8rem] flex-col items-center justify-center gap-3 px-6 py-10">
	<span class="empty-glyph" style:color>
		<HugeiconsIcon {icon} size={44} strokeWidth={1.2} />
	</span>
	<p class="max-w-[34ch] text-center text-[11px] leading-relaxed text-muted-foreground">
		{line}
		{#if hint}
			<span class="mt-1 block text-muted-foreground/55">{hint}</span>
		{/if}
	</p>
</div>

<style>
	/*
		Faint enough to be texture rather than content — it must not compete with
		the first real row that lands on top of it. The glow is a single soft
		shadow in the same colour, which is what stops a 1.2-weight line at 12%
		reading as a rendering mistake on a dark canvas.
	*/
	.empty-glyph {
		opacity: 0.16;
		filter: drop-shadow(0 0 18px currentColor);
	}
	:global(.dark) .empty-glyph {
		opacity: 0.2;
	}
</style>
