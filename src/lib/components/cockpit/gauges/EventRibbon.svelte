<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { KIND_COLOR } from '$lib/xray/format';
	import type { DisplayKind } from '$lib/xray/events';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The whole run as one strip.
	 *
	 * The timeline is a scrolling list, and a scrolling list of four hundred
	 * events answers "what happened at 3:56" while refusing to answer "what did
	 * this run look like" — which is the question you ask when you are watching
	 * rather than debugging. You cannot see the shape of something you can only
	 * see a page of.
	 *
	 * One column per event, coloured by kind, laid left to right. At a few dozen
	 * events it reads as ticks; at several hundred it fuses into a barcode where
	 * the run's phases are just visible — the ochre stretch where it hammered
	 * tools, the amber bar where it stopped at a gate, the blue bands of model
	 * turns between. Nothing scrolls, because the strip is always exactly as wide
	 * as the space it was given.
	 *
	 * Columns are drawn as flex children rather than SVG rects so the browser
	 * does the sub-pixel distribution. With more events than pixels the columns
	 * land under a pixel wide and the compositor blends them, which is the
	 * correct answer visually — the density IS the information — and one that
	 * hand-rolled bucketing gets wrong by picking a winner per bucket.
	 */
	interface Props {
		selectedId?: string | null;
		onselect?: (id: string) => void;
	}
	let { selectedId = null, onselect }: Props = $props();

	const rows = $derived.by(() => {
		void bus.version;
		return bus.events.filter((e) => e.kind !== 'http_sse_frame');
	});

	/** Kind counts, for the legend under the strip. */
	const tally = $derived.by(() => {
		// Scratch — rebuilt per derivation, never mutated afterwards. See ToolDial.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Map<string, number>();
		for (const e of rows) out.set(e.displayKind, (out.get(e.displayKind) ?? 0) + 1);
		return [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
	});
</script>

<div class="hx-ribbon-wrap">
	<div class="hx-ribbon" role="group" aria-label="{rows.length} events">
		{#each rows as e (e.id)}
			<button
				class="hx-tick"
				class:hx-sel={e.id === selectedId}
				style:background={KIND_COLOR[e.displayKind as DisplayKind]}
				onclick={() => onselect?.(e.id)}
				aria-label={e.displayKind}
				{@attach tip(`${e.displayKind} · ${e.kind}`)}
			></button>
		{/each}
		{#if !rows.length}
			<span class="hx-idle">no events yet</span>
		{/if}
	</div>

	<div class="hx-legend">
		{#each tally as [kind, n] (kind)}
			<span>
				<i style:background={KIND_COLOR[kind as DisplayKind]}></i>{kind}
				<b class="hx-num">{n}</b>
			</span>
		{/each}
	</div>
</div>

<style>
	.hx-ribbon-wrap {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 0;
	}

	.hx-ribbon {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: stretch;
		gap: 1px;
		border-radius: 3px;
		overflow: hidden;
		background: color-mix(in oklab, var(--foreground) 5%, transparent);
	}

	.hx-tick {
		flex: 1 1 0;
		min-width: 0;
		/* Never vanish entirely, however many events there are. */
		min-height: 100%;
		opacity: 0.72;
		border: 0;
		padding: 0;
		transition: opacity 140ms ease;
	}
	.hx-tick:hover {
		opacity: 1;
	}
	.hx-sel {
		opacity: 1;
		box-shadow: 0 0 0 1px var(--background) inset;
		filter: brightness(1.35);
	}

	.hx-idle {
		margin: auto;
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		opacity: 0.55;
	}

	.hx-legend {
		flex: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.05rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 8px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.hx-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.hx-legend i {
		width: 5px;
		height: 5px;
		border-radius: 1px;
	}
	.hx-legend b {
		font-weight: 500;
		opacity: 0.7;
	}
</style>
