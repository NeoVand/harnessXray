<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { KIND_COLOR } from '$lib/xray/format';
	import type { DisplayKind } from '$lib/xray/events';
	import { fold } from '$lib/xray/ribbon';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The whole run as one strip.
	 *
	 * The timeline is a scrolling list, and a scrolling list of a few hundred
	 * events answers "what happened at 3:56" while refusing to answer "what did
	 * this run look like" — the question you ask when watching rather than
	 * debugging. You cannot see the shape of something you can only see a page of.
	 *
	 * The first version drew one flex child per event with a 1px gap, which was
	 * wrong twice over. At 196 events in a 309px strip the gaps alone take 196px:
	 * the ticks end up 0.58px wide and the ribbon is mostly background, so a
	 * longer run looked like LESS information rather than more. And it put one DOM
	 * node per event on screen, which at a few thousand events is a real cost for
	 * marks nobody can see or click.
	 *
	 * So the strip buckets. Columns are ~3px — wide enough to see and to hit —
	 * and events are distributed across however many fit, which caps the node
	 * count at the strip's width no matter how long the run gets.
	 *
	 * Each column takes the colour of the most SIGNIFICANT event in its bucket
	 * rather than the most common one. Averaging or taking the mode would bury
	 * exactly what you are scanning for: one interrupt among twenty bookkeeping
	 * events is the thing worth seeing, and it is a minority by construction.
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

	let stripW = $state(0);
	const COL = 3;

	const cols = $derived(fold(rows, Math.floor(stripW / COL), selectedId));

	/** Kind counts, for the legend under the strip. */
	const tally = $derived.by(() => {
		// Scratch — rebuilt per derivation, never mutated afterwards.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const out = new Map<string, number>();
		for (const e of rows) out.set(e.displayKind, (out.get(e.displayKind) ?? 0) + 1);
		return [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
	});
</script>

<div class="hx-ribbon-wrap">
	<div class="hx-ribbon" bind:clientWidth={stripW} role="group" aria-label="{rows.length} events">
		{#each cols as c, i (i)}
			<button
				class="hx-tick"
				class:hx-sel={c.hasSelected}
				style:background={KIND_COLOR[c.kind as DisplayKind]}
				onclick={() => onselect?.(c.id)}
				aria-label={c.kind}
				{@attach tip(c.n > 1 ? `${c.n} events · loudest: ${c.kind}` : c.kind)}
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
		/* No gap. At any interesting density the gaps become the picture. */
		border-radius: 3px;
		overflow: hidden;
		background: color-mix(in oklab, var(--foreground) 5%, transparent);
	}

	.hx-tick {
		flex: 1 1 0;
		min-width: 0;
		border: 0;
		padding: 0;
		opacity: 0.85;
		transition: opacity 120ms ease;
		/* Separation without gaps: a hairline of the page colour drawn inside the
		   mark, which disappears on its own once columns get near 1px. */
		box-shadow: inset -1px 0 0 color-mix(in oklab, var(--background) 55%, transparent);
	}
	.hx-tick:hover {
		opacity: 1;
		box-shadow: none;
	}
	.hx-sel {
		opacity: 1;
		box-shadow: none;
		filter: brightness(1.4);
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
