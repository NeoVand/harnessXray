<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { shotStubs, shotAt, groupTotals } from '$lib/xray/context';
	import { compact } from '$lib/xray/usage';
	import { INPUT_LIMIT } from '$lib/agent/models';
	import { tip } from '$lib/hooks/tip';

	/**
	 * What the model is about to be sent, as a ring.
	 *
	 * The context panel is the best instrument in the app and the worst one to
	 * glance at: it is a scrolling ledger of every piece, which is exactly right
	 * when you are asking why a request costs what it does, and useless when you
	 * want to know — while the thing is running — how full the window is and what
	 * is filling it.
	 *
	 * Three arcs on one ring: the system prompt, the tool schemas, the
	 * conversation. Swept in that order because that is the order they occupy the
	 * request, so the ring is a picture of the actual payload rather than a
	 * sorted chart. The gap between the arcs' end and the top of the ring is the
	 * headroom left, drawn as the empty part of the circle — which means "how
	 * close am I to the limit" is answered by a shape, not by reading a
	 * percentage.
	 *
	 * The arcs sweep the *limit*, not the used total. Normalising to the total
	 * would make a 2%-full request look identical to a 98%-full one, which is the
	 * one comparison this instrument exists to make.
	 */
	const shot = $derived.by(() => {
		void bus.version;
		const stubs = shotStubs(bus);
		const last = stubs.at(-1);
		return last ? shotAt(bus, last.id) : undefined;
	});

	const totals = $derived(shot ? groupTotals(shot) : { system: 0, tools: 0, messages: 0 });
	const limit = $derived(shot?.limit ?? INPUT_LIMIT);
	const used = $derived(totals.system + totals.tools + totals.messages);
	const pct = $derived(limit ? used / limit : 0);

	const R = 40;
	const C = 2 * Math.PI * R;

	/** Arcs in payload order, each carrying where it starts on the circle. */
	const arcs = $derived.by(() => {
		const parts = [
			{ k: 'system prompt', v: totals.system, c: 'var(--hx-state)' },
			{ k: 'tool schemas', v: totals.tools, c: 'var(--hx-tool)' },
			{ k: 'messages', v: totals.messages, c: 'var(--hx-model)' }
		];
		let at = 0;
		return parts.map((p) => {
			const frac = limit ? p.v / limit : 0;
			const seg = { ...p, frac, offset: at };
			at += frac;
			return seg;
		});
	});
</script>

<div class="hx-ring-wrap">
	<svg viewBox="-50 -50 100 100" role="img" aria-label="{compact(used)} of {compact(limit)} tokens">
		<!--
			Only the arcs rotate, not the whole SVG.

			Rotating the <svg> is the one-line way to start the sweep at twelve
			o'clock, and it takes the text with it — counter-rotating each label then
			fights `text-anchor` and `transform-box` and lands the numbers off centre
			and overlapping. Rotating a group that contains nothing but circles has
			no such problem: circles are rotationally symmetric, so the transform is
			free, and the text below stays in an untouched coordinate system.
		-->
		<g transform="rotate(-90)">
			<!-- The track is the limit. Everything unpainted is headroom. -->
			<circle class="hx-track" r={R} />
			{#each arcs as a (a.k)}
				{#if a.frac > 0}
					<circle
						class="hx-arc"
						r={R}
						stroke={a.c}
						stroke-dasharray="{a.frac * C} {C}"
						stroke-dashoffset={-a.offset * C}
						{@attach tip(`${a.k} — ${compact(a.v)} tokens`)}
					/>
				{/if}
			{/each}
		</g>
		<text class="hx-big" y="0">{compact(used)}</text>
		<text class="hx-sub" y="9">{(pct * 100).toFixed(1)}% of {compact(limit)}</text>
	</svg>

	<ul class="hx-key">
		{#each arcs as a (a.k)}
			<li>
				<i style:background={a.c}></i>{a.k}
				<b class="hx-num">{compact(a.v)}</b>
			</li>
		{/each}
	</ul>
</div>

<style>
	.hx-ring-wrap {
		height: 100%;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 0;
	}
	svg {
		height: 100%;
		flex: 0 1 auto;
		min-width: 0;
	}
	text {
		text-anchor: middle;
		dominant-baseline: middle;
		font-family: var(--font-mono);
	}
	.hx-big {
		font-size: 13px;
		font-weight: 600;
		fill: var(--foreground);
	}
	.hx-sub {
		font-size: 5.5px;
		fill: var(--muted-foreground);
		letter-spacing: 0.06em;
	}

	.hx-track {
		fill: none;
		stroke: color-mix(in oklab, var(--foreground) 8%, transparent);
		stroke-width: 9;
	}
	.hx-arc {
		fill: none;
		stroke-width: 9;
		transition: stroke-dasharray 420ms ease;
	}
	.hx-arc:hover {
		stroke-width: 11;
	}

	.hx-key {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-family: var(--font-mono);
		font-size: 8.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.hx-key li {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}
	.hx-key i {
		width: 5px;
		height: 5px;
		border-radius: 1px;
		flex: none;
	}
	.hx-key b {
		margin-left: auto;
		font-weight: 500;
		color: var(--foreground);
		opacity: 0.75;
	}
</style>
