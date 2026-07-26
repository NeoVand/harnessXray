<script lang="ts">
	/**
	 * The anatomy of the harness, drawn.
	 *
	 * One idea only: the loop. A context window is assembled on the left, sent
	 * whole to the model in the middle, the model calls tools or subagents on the
	 * right, and the results run back along the bottom into the same context —
	 * where they will be paid for again next turn.
	 *
	 * Every colour is an `--hx-*` token, so the diagram inherits light and dark
	 * without a second copy and stays keyed to the timeline: a memory box here is
	 * the same clay as a memory event there. Highlight strength is tuned per
	 * scheme, because a tint that reads on white goes muddy on near-black.
	 *
	 * Deliberately almost wordless. The legend cards under it carry the sentences;
	 * a diagram that needs a paragraph is a diagram that failed.
	 */
	let { active = $bindable<string | null>(null) }: { active?: string | null } = $props();

	/** What stacks up inside the context window, in assembly order. */
	const ROWS = [
		{ id: 'prompt', label: 'system prompt', color: 'var(--hx-model)', y: 66 },
		{ id: 'skills', label: 'skills', color: 'var(--hx-tool)', y: 101 },
		{ id: 'memory', label: 'memory', color: 'var(--hx-memory)', y: 136 },
		{ id: 'files', label: 'files', color: 'var(--hx-fs)', y: 171 },
		{ id: 'todos', label: 'plan', color: 'var(--hx-state)', y: 206 },
		{ id: 'tools', label: 'tools', color: 'var(--hx-tool)', y: 241 },
		{ id: 'messages', label: 'messages', color: 'var(--hx-user)', y: 276 }
	];
</script>

<svg
	viewBox="0 0 800 420"
	class="w-full"
	role="img"
	aria-label="The agent loop: a context window is assembled, sent to the model, the model calls tools and subagents, and the results rejoin the context"
>
	<defs>
		<marker
			id="hx-tip"
			viewBox="0 0 10 10"
			refX="9"
			refY="5"
			markerWidth="5.5"
			markerHeight="5.5"
			orient="auto"
		>
			<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
		</marker>
	</defs>

	<!-- ── the context window: a tray that fills from the top ──────────────── -->
	<text class="cap" x="24" y="40">CONTEXT WINDOW</text>
	<rect class="tray" x="24" y="52" width="232" height="300" rx="3" />

	{#each ROWS as row (row.id)}
		<g
			class="cell"
			role="presentation"
			class:on={active === row.id}
			style="--c: {row.color}"
			onmouseenter={() => (active = row.id)}
			onmouseleave={() => (active = null)}
		>
			<rect class="bg" x="38" y={row.y} width="204" height="28" rx="2" />
			<rect class="bar" x="38" y={row.y} width="3" height="28" />
			<text class="lbl" x="53" y={row.y + 18.5}>{row.label}</text>
		</g>
	{/each}

	<rect class="ghost" x="38" y="311" width="204" height="27" rx="2" />
	<text class="sm mid" x="140" y="328">free space</text>

	<!-- ── all of it, every turn ───────────────────────────────────────────── -->
	<path class="wire w-model" d="M256,202 H334" marker-end="url(#hx-tip)" />
	<text class="edge" x="295" y="194">every turn</text>

	<!-- ── the model ───────────────────────────────────────────────────────── -->
	<rect class="core-box" x="336" y="158" width="124" height="88" rx="3" />
	<rect class="core-bezel" x="341" y="163" width="114" height="78" rx="2" />
	<text class="core" x="398" y="198">model</text>
	<text class="sm mid" x="398" y="214">one call</text>

	<!-- ── what it can call: the fork is symmetric about the model's axis ──── -->
	<path
		class="wire w-tool"
		d="M460,202 H496 a10,10 0 0 0 10,-10 V168 a10,10 0 0 1 10,-10 H542"
		marker-end="url(#hx-tip)"
	/>
	<path
		class="wire w-sub"
		d="M460,202 H496 a10,10 0 0 1 10,10 V236 a10,10 0 0 0 10,10 H542"
		marker-end="url(#hx-tip)"
	/>
	<text class="edge" x="478" y="190">calls</text>

	<g
		class="cell"
		role="presentation"
		class:on={active === 'tools'}
		style="--c: var(--hx-tool)"
		onmouseenter={() => (active = 'tools')}
		onmouseleave={() => (active = null)}
	>
		<rect class="bg" x="544" y="134" width="172" height="48" rx="3" />
		<rect class="bar" x="544" y="134" width="3" height="48" />
		<text class="lbl" x="559" y="162.5">tools</text>
		<rect class="chip" x="648" y="151" width="7" height="14" opacity="0.7" />
		<rect class="chip" x="661" y="151" width="7" height="14" opacity="0.58" />
		<rect class="chip" x="674" y="151" width="7" height="14" opacity="0.46" />
		<rect class="chip" x="687" y="151" width="7" height="14" opacity="0.34" />
		<rect class="chip" x="700" y="151" width="7" height="14" opacity="0.22" />
	</g>

	<g
		class="cell"
		role="presentation"
		class:on={active === 'subagents'}
		style="--c: var(--hx-subagent)"
		onmouseenter={() => (active = 'subagents')}
		onmouseleave={() => (active = null)}
	>
		<rect class="bg" x="544" y="206" width="172" height="80" rx="3" />
		<rect class="bar" x="544" y="206" width="3" height="80" />
		<text class="lbl" x="559" y="250">subagents</text>
		<!-- A context window of its own, drawn small — same tray, same stack, same
		     headroom. The rhyme with the big one on the left is the whole point. -->
		<rect class="mini" x="650" y="216" width="56" height="60" rx="3" />
		<rect class="mrow" x="656" y="224" width="44" height="4" fill="var(--hx-model)" />
		<rect class="mrow" x="656" y="232" width="44" height="4" fill="var(--hx-tool)" />
		<rect class="mrow" x="656" y="240" width="44" height="4" fill="var(--hx-memory)" />
		<rect class="mrow" x="656" y="248" width="44" height="4" fill="var(--hx-fs)" />
	</g>
	<text class="sm mid" x="630" y="300">own context · summary back</text>

	<!-- ── and back round ──────────────────────────────────────────────────── -->
	<path class="wire w-back" d="M716,158 H742 a10,10 0 0 1 10,10 V256" />
	<path
		class="wire w-back"
		d="M716,246 H742 a10,10 0 0 1 10,10 V376 a10,10 0 0 1 -10,10 H150 a10,10 0 0 1 -10,-10 V354"
		marker-end="url(#hx-tip)"
	/>
	<text class="edge" x="430" y="377">results rejoin the context</text>
</svg>

<style>
	svg {
		/* Structural hairline. --border is 9% white in dark and all but invisible
		   against a tinted tray, so lines key off the muted foreground instead. */
		--line: color-mix(in oklab, var(--muted-foreground) 40%, transparent);
		display: block;
	}

	text {
		font-family: var(--font-mono);
		fill: var(--foreground);
	}
	.cap {
		font-size: 9.5px;
		letter-spacing: 0.09em;
		fill: var(--muted-foreground);
	}
	.lbl {
		font-size: 11px;
	}
	.sm {
		font-size: 8.5px;
		fill: var(--muted-foreground);
	}
	.edge {
		font-size: 9px;
		fill: var(--muted-foreground);
		text-anchor: middle;
	}
	.core {
		font-size: 13px;
		text-anchor: middle;
	}
	.mid {
		text-anchor: middle;
	}

	.tray {
		fill: color-mix(in oklab, var(--muted) 32%, transparent);
		stroke: var(--line);
	}
	.ghost {
		fill: none;
		stroke: var(--line);
		stroke-dasharray: 3 3;
	}
	.core-box {
		fill: color-mix(in oklab, var(--hx-model) 9%, var(--background));
		stroke: color-mix(in oklab, var(--hx-model) 55%, transparent);
	}
	.core-bezel {
		fill: none;
		stroke: color-mix(in oklab, var(--hx-model) 22%, transparent);
	}

	/* Wires. Forward legs take the colour of what they carry, the return leg is
	   neutral — so the loop reads as out-and-back rather than as four categories. */
	.wire {
		fill: none;
		stroke-width: 1.25;
		pointer-events: none;
	}
	.w-model {
		stroke: color-mix(in oklab, var(--hx-model) 72%, var(--background));
		color: color-mix(in oklab, var(--hx-model) 72%, var(--background));
	}
	.w-tool {
		stroke: color-mix(in oklab, var(--hx-tool) 72%, var(--background));
		color: color-mix(in oklab, var(--hx-tool) 72%, var(--background));
	}
	.w-sub {
		stroke: color-mix(in oklab, var(--hx-subagent) 72%, var(--background));
		color: color-mix(in oklab, var(--hx-subagent) 72%, var(--background));
	}
	.w-back {
		stroke: color-mix(in oklab, var(--muted-foreground) 55%, var(--background));
		color: color-mix(in oklab, var(--muted-foreground) 55%, var(--background));
	}

	/* A named piece. Hover only — nothing here is focusable, because the legend
	   cards below carry the semantics and a focus ring on a <g> is a bounding-box
	   rectangle the browser draws wherever it likes. */
	.cell {
		cursor: default;
	}
	.cell .bg {
		fill: color-mix(in oklab, var(--c) 9%, var(--background));
		transition: fill 0.15s ease;
	}
	.cell .bar {
		fill: var(--c);
		opacity: 0.75;
		transition: opacity 0.15s ease;
	}
	.cell text {
		fill: color-mix(in oklab, var(--foreground) 82%, var(--background));
		transition: fill 0.15s ease;
	}
	/* Same fill and hairline as the big tray, so it reads as a window and not as
	   a page of text. */
	.cell .mini {
		fill: color-mix(in oklab, var(--muted) 32%, transparent);
		stroke: var(--line);
	}
	.cell .chip {
		fill: var(--c);
	}
	/* Rows of the miniature: the same token colours as the big stack, which is
	   what stops the little box reading as a document icon. Fill comes from the
	   markup, so no rule may set it here. */
	.cell .mrow {
		opacity: 0.6;
	}
	.cell.on .bg {
		fill: color-mix(in oklab, var(--c) 20%, var(--background));
	}
	.cell.on .bar {
		opacity: 1;
	}
	.cell.on text {
		fill: var(--foreground);
	}

	/* Dark needs more tint to register at all, and more again when lit. */
	:global(.dark) .cell .bg {
		fill: color-mix(in oklab, var(--c) 12%, var(--background));
	}
	:global(.dark) .cell.on .bg {
		fill: color-mix(in oklab, var(--c) 26%, var(--background));
	}
</style>
