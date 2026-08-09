<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { inventory, type Inventory } from '$lib/xray/inventory';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The empty chat, as a title card.
	 *
	 * What was here was an eyebrow and a paragraph, and the paragraph did the
	 * thing this app is otherwise careful not to do: it described the instruments
	 * instead of showing anything. Meanwhile the graph tab — the only panel with
	 * any life in it before a run — earns that by drawing something TRUE with no
	 * data at all.
	 *
	 * So the same move here. The subject of the whole app is one equation, and it
	 * is the equation the field settled on in 2026:
	 *
	 *     Agent = Model + Harness
	 *
	 * Set as the hero, coloured from the legend the rest of the app already uses
	 * — `--hx-model` for the part you bring, `--hx-accent` for the part this
	 * dissects — so the two operands are already teaching the palette before a
	 * single event exists. Under it, the harness's actual contents, counted off
	 * the compiled agent. Not decoration: every number is read from the thing it
	 * describes, and each one opens the panel that shows it, which is also how
	 * someone learns the layout without a tour.
	 */
	interface Props {
		/** Open an inspector tab by name — the counts are navigation. */
		onopen?: (tab: string) => void;
	}
	let { onopen }: Props = $props();

	let inv = $state<Inventory | null>(null);
	$effect(() => {
		let live = true;
		void inventory().then((i) => {
			if (live) inv = i;
		});
		return () => {
			live = false;
		};
	});

	/**
	 * The parts, in the order they act on a turn.
	 *
	 * Prompt and schemas go in, middleware runs, the model is called, tools fire,
	 * subagents get dispatched, a plan gets written. Reading left to right is
	 * reading the loop, which is the same order the graph draws top to bottom.
	 */
	const parts = $derived(
		inv
			? [
					{
						n: inv.tools,
						label: inv.tools === 1 ? 'tool' : 'tools',
						icon: ICON.tool,
						tab: 'tools',
						color: 'var(--hx-tool)',
						why: `${inv.ours} ours, ${inv.tools - inv.ours} the harness's — every one on the wire in full`
					},
					{
						n: inv.middleware,
						label: 'middleware',
						icon: ICON.state,
						tab: 'graph',
						color: 'var(--hx-state)',
						// The number and the drawing disagree on purpose, so say why. A
						// middleware only becomes a node if it owns a hook; the rest
						// contribute tools or state and work without appearing.
						why: `wrapped around the model call — ${inv.hooks} own a hook and draw a node on the graph, the other ${inv.middleware - inv.hooks} work without appearing`
					},
					{
						n: inv.subagents,
						label: 'subagents',
						icon: ICON.subagent,
						tab: 'subagents',
						color: 'var(--hx-subagent)',
						why: 'each with its own context window, its own bill, and its own lane'
					},
					{
						n: inv.skills,
						label: inv.skills === 1 ? 'skill' : 'skills',
						icon: ICON.skill,
						tab: 'skills',
						color: 'var(--hx-fs)',
						why: 'markdown the agent reads when it decides the task needs it'
					}
				]
			: []
	);
</script>

<div class="hx-eq-box flex w-full flex-col items-center text-center">
	<!--
		The app's own glyph, at the size the empty panels use and with the same
		wash. It is the wordmark's icon, so the identity is one thing in three
		places — header, title card, and every panel waiting for data.
	-->
	<span class="hx-mark" style:color="var(--hx-accent)">
		<HugeiconsIcon icon={ICON.agent} size={40} strokeWidth={1.2} />
	</span>

	<!--
		The equation. Mono, because it is a formula and the app's numeric voice is
		mono everywhere else; and sized to be the largest thing on an empty screen
		without becoming a splash page.
	-->
	<p class="hx-eq mt-4 w-full">
		<span class="whitespace-nowrap">Agent <span class="hx-eq-op">=</span></span>
		<span class="whitespace-nowrap">
			<span style:color="var(--hx-model)">Model</span>
			<span class="hx-eq-op">+</span>
			<span style:color="var(--hx-accent)">Harness</span>
		</span>
	</p>

	<p class="mt-3 w-full max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground">
		The model is the part you bring. The <span style:color="var(--hx-accent)">harness</span> is everything
		else — what it is told, what it may do, what it remembers, when it is stopped. This runs a real one
		and takes it apart while it works.
	</p>

	<!--
		The inventory. A hairline strip rather than cards: this is an instrument's
		idle readout, and the numbers are the content.
	-->
	{#if parts.length}
		<div
			class="hx-rule mt-6 flex w-full max-w-[46ch] flex-wrap justify-center gap-x-5 gap-y-2
			       border-t pt-3"
		>
			{#each parts as p (p.label)}
				<button
					class="group flex items-baseline gap-1.5 text-left transition-opacity hover:opacity-100"
					class:opacity-70={true}
					onclick={() => onopen?.(p.tab)}
					{@attach tip(p.why)}
				>
					<span class="translate-y-[2px]" style:color={p.color}>
						<HugeiconsIcon icon={p.icon} size={12} strokeWidth={1.5} />
					</span>
					<span class="hx-num text-[13px] tabular-nums" style:color={p.color}>{p.n}</span>
					<span class="hx-eyebrow group-hover:text-foreground">{p.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	/*
		Large, tight and mono. `clamp` because the chat column is resizable down to
		~26% of the window and a fixed 30px equation wraps into three lines there —
		which is the one thing a hero must not do.
	*/
	/*
		Sized against the COLUMN, not the window: this pane is resizable from about
		a quarter of the screen to most of it, and `vw` cannot see that — it kept a
		30px equation in a 250px column, which broke the line in the middle of
		`Model + Harness`. Container units track the thing that actually constrains
		it.

		Where it breaks is chosen rather than left to chance. `Agent =` and
		`Model + Harness` are each unbreakable, so a narrow column gets two lines of
		an equation instead of a fragment and an orphan.
	*/
	.hx-eq {
		font-family: var(--font-mono);
		font-size: clamp(1.05rem, 5.4cqw, 1.7rem);
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}
	.hx-eq-box {
		container-type: inline-size;
	}
	/* The same 0.16/0.2 wash the empty panels use, so the mark reads as one
	   family with them rather than as a logo dropped on top. */
	.hx-mark {
		display: block;
		opacity: 0.5;
		filter: drop-shadow(0 0 22px currentColor);
	}
	.hx-eq-op {
		color: var(--muted-foreground);
		opacity: 0.5;
		font-weight: 400;
	}
</style>
