<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { runTotals, money, compact, TOKEN_COLOR, TOKEN_LABEL } from '$lib/xray/usage';
	import { tip } from '$lib/hooks/tip';

	/**
	 * Where the money went, as one bar.
	 *
	 * The ledger panel is a table, and a table is the correct way to audit a
	 * bill. Watching a run, the question is narrower and constant: which kind of
	 * token is this costing, right now. One stacked bar answers it, and the
	 * segments are already colour-coded everywhere else in the app.
	 *
	 * Segments are sized by TOKENS but the readout is MONEY, because those two
	 * disagree by an order of magnitude — cached input is billed at a tenth, and
	 * output at several times input — and the disagreement is the lesson. A bar
	 * mostly grey with cache while the dollar figure barely moves is the single
	 * clearest picture of why caching matters.
	 */
	const t = $derived.by(() => {
		void bus.version;
		return runTotals(bus, session.model);
	});

	const segs = $derived(
		(
			[
				['cacheWrite', t.cacheWrite],
				['fresh', t.input - t.cached - t.cacheWrite],
				['cached', t.cached],
				['output', t.output - t.reasoning],
				['reasoning', t.reasoning],
				['image', t.imageIn + t.imageOut]
			] as const
		)
			.map(([k, v]) => ({ k, v: Math.max(0, v) }))
			.filter((s) => s.v > 0)
	);

	const sum = $derived(segs.reduce((n, s) => n + s.v, 0));
</script>

<div class="hx-spend">
	<div class="hx-head">
		<span class="hx-money">{money(t.costUsd)}</span>
		<span class="hx-num hx-meta">{compact(sum)} tok · {t.calls} calls</span>
	</div>

	<div class="hx-bar">
		{#each segs as s (s.k)}
			<span
				style:flex="{s.v} 0 0"
				style:background={TOKEN_COLOR[s.k]}
				{@attach tip(`${TOKEN_LABEL[s.k]} — ${compact(s.v)} tokens`)}
			></span>
		{/each}
		{#if !segs.length}<span class="hx-void"></span>{/if}
	</div>

	<ul class="hx-key">
		{#each segs.slice(0, 4) as s (s.k)}
			<li><i style:background={TOKEN_COLOR[s.k]}></i>{TOKEN_LABEL[s.k]}</li>
		{/each}
	</ul>
</div>

<style>
	.hx-spend {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.4rem;
		min-height: 0;
	}
	.hx-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.hx-money {
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 600;
		color: var(--hx-tok-out);
	}
	.hx-meta {
		margin-left: auto;
		font-size: 8px;
		color: var(--muted-foreground);
	}

	.hx-bar {
		display: flex;
		height: 9px;
		border-radius: 2px;
		overflow: hidden;
		background: color-mix(in oklab, var(--foreground) 5%, transparent);
	}
	.hx-bar span {
		min-width: 1px;
	}
	.hx-void {
		flex: 1;
	}

	.hx-key {
		display: flex;
		flex-wrap: wrap;
		gap: 0.05rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 7.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.hx-key li {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.hx-key i {
		width: 5px;
		height: 5px;
		border-radius: 1px;
	}
</style>
