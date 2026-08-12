<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { toolsOf } from '$lib/xray/inventory';
	import { tip } from '$lib/hooks/tip';

	/**
	 * Every tool on the wire, as one dial.
	 *
	 * The tools panel is a scrolling list of seventeen rows, which is the right
	 * shape for reading a schema and the wrong shape for answering the only
	 * question a cockpit is asked: what is this agent reaching for? A list makes
	 * you scroll to find out, and scrolling is how the first cockpit hid
	 * everything it claimed to show.
	 *
	 * So: one spoke per tool, arranged around a circle, length carrying call
	 * count. Unused tools stay as stubs — present, dim, obviously idle — which
	 * means the shape of the dial IS the answer. A run that leans on `read_file`
	 * looks nothing like one that leans on `search_papers`, from across a room.
	 *
	 * Length is `sqrt(calls)` rather than linear. One tool called forty times
	 * next to five called twice is a realistic distribution, and linear scaling
	 * turns that into one spike and a flat circle; the square root keeps the
	 * small counts legible without lying about which is biggest. Ordering is the
	 * agent's own tool order, so the dial does not reshuffle as counts change —
	 * a gauge whose needles swap places is not a gauge.
	 */
	interface Props {
		onjump?: (eventId: string) => void;
	}
	let { onjump }: Props = $props();

	let roster = $state<{ name: string; ours: boolean }[]>([]);
	$effect(() => {
		void session.model;
		let live = true;
		void (async () => {
			const tools = toolsOf(await session.peekAgent());
			if (live) roster = tools.map((t) => ({ name: t.name, ours: t.ours }));
		})();
		return () => {
			live = false;
		};
	});

	/** Calls per tool across every lane, plus the last event id for jumping. */
	const calls = $derived.by(() => {
		void bus.version;
		const out: Record<string, { n: number; last: string }> = {};
		for (const e of bus.events) {
			if (e.kind !== 'tool_start') continue;
			const c = (out[e.name] ??= { n: 0, last: '' });
			c.n++;
			c.last = e.id;
		}
		return out;
	});

	/** The tool that started most recently and has not ended — the live one. */
	const active = $derived.by(() => {
		void bus.version;
		// Scratch, not state: built from nothing on every derivation and thrown
		// away. Reactivity comes from `bus.version` above, so a SvelteSet would
		// add a proxy nobody ever reads through.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const open = new Set<string>();
		for (const e of bus.events) {
			if (e.kind === 'tool_start') open.add(e.name);
			else if (e.kind === 'tool_end') open.delete(e.name);
		}
		return open;
	});

	const R0 = 15;
	const R1 = 46;
	const used = $derived(roster.filter((t) => calls[t.name]).length);
	const peak = $derived(Math.max(1, ...Object.values(calls).map((c) => c.n)));

	const spokes = $derived(
		roster.map((t, i) => {
			const a = (i / Math.max(1, roster.length)) * Math.PI * 2 - Math.PI / 2;
			const n = calls[t.name]?.n ?? 0;
			const len = n ? R0 + (R1 - R0) * Math.sqrt(n / peak) : R0 + 3;
			return {
				...t,
				n,
				last: calls[t.name]?.last,
				live: active.has(t.name),
				x1: Math.cos(a) * R0,
				y1: Math.sin(a) * R0,
				x2: Math.cos(a) * len,
				y2: Math.sin(a) * len
			};
		})
	);
</script>

<div class="hx-dial">
	<svg viewBox="-56 -56 112 112" role="img" aria-label="{roster.length} tools, {used} used">
		<circle r={R0} class="hx-ring" />
		{#each spokes as s (s.name)}
			<g
				class="hx-spoke"
				class:hx-used={s.n > 0}
				class:hx-live={s.live}
				style:--c={s.ours ? 'var(--hx-tool)' : 'var(--hx-state)'}
				{@attach tip(
					`${s.name} — ${s.n || 'not called'}${s.n ? ` call${s.n > 1 ? 's' : ''}` : ''}`
				)}
				role="button"
				tabindex="0"
				onclick={() => s.last && onjump?.(s.last)}
				onkeydown={(e) => e.key === 'Enter' && s.last && onjump?.(s.last)}
			>
				<line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
				{#if s.n}<circle cx={s.x2} cy={s.y2} r={s.live ? 2.6 : 1.7} />{/if}
			</g>
		{/each}
		<text class="hx-big" y="1">{used}</text>
		<text class="hx-sub" y="9">of {roster.length}</text>
	</svg>
</div>

<style>
	.hx-dial {
		height: 100%;
		display: grid;
		place-items: center;
	}
	svg {
		height: 100%;
		max-height: 100%;
		width: 100%;
	}

	.hx-ring {
		fill: none;
		stroke: color-mix(in oklab, var(--foreground) 12%, transparent);
		stroke-width: 0.6;
	}

	.hx-spoke {
		cursor: default;
		--c: var(--hx-tool);
	}
	.hx-spoke line {
		stroke: color-mix(in oklab, var(--c) 22%, transparent);
		stroke-width: 1.6;
		stroke-linecap: round;
		transition:
			stroke 200ms ease,
			d 300ms ease;
	}
	.hx-spoke circle {
		fill: var(--c);
	}
	.hx-used line {
		stroke: var(--c);
	}
	.hx-used:hover line {
		stroke-width: 2.6;
	}

	/* The one thing on the dial allowed to move. */
	.hx-live circle {
		animation: hx-dial-pulse 1.1s ease-in-out infinite;
		filter: drop-shadow(0 0 4px var(--c));
	}
	@keyframes hx-dial-pulse {
		50% {
			opacity: 0.35;
		}
	}

	text {
		text-anchor: middle;
		font-family: var(--font-mono);
		fill: var(--foreground);
	}
	.hx-big {
		font-size: 11px;
		font-weight: 600;
	}
	.hx-sub {
		font-size: 5px;
		fill: var(--muted-foreground);
		letter-spacing: 0.08em;
	}
</style>
