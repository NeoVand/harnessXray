<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import {
		hookOf,
		layoutDag,
		roundedPath,
		type EdgeIn,
		type LaidNode,
		type NodeKind
	} from '$lib/xray/layout';

	/**
	 * The compiled topology, drawn — and alive.
	 *
	 * Still not a diagram anyone drew: the nodes and edges come from
	 * `getGraphAsync({ xray: true })` on the live agent, so middleware names and
	 * conditional edges are the real ones and change when the harness does. The
	 * middleware onion folds into slim dot-rows between the main stations —
	 * START → model → tools → END stays readable, and a click opens any chain
	 * back out to its hooks. Every `node` event the graph publishes lights its
	 * shape up: the one that committed last pulses while the run is going,
	 * visit counts accumulate, hovering shows what a node is and what it last
	 * wrote, and clicking jumps the timeline to the last thing it did. The map
	 * and the territory are the same object.
	 */
	let {
		onjump,
		/** The tools node was clicked; the inspector should show the tools tab. */
		onopentools
	}: { onjump?: (eventId: string) => void; onopentools?: () => void } = $props();

	let ids = $state<string[]>([]);
	let edgesIn = $state<EdgeIn[]>([]);
	let error = $state('');
	let loaded = $state(false);

	async function load() {
		try {
			const agent = await session.peekAgent();
			if (!agent) {
				error = 'The agent is built on the first message — send one to see its shape.';
				return;
			}
			const { readTopology } = await import('$lib/agent/graph');
			const g = await readTopology(agent, { xray: true });
			ids = Object.keys(g.nodes);
			edgesIn = g.edges.map((e) => ({
				from: e.source,
				to: e.target,
				conditional: Boolean(e.conditional)
			}));
			loaded = true;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		void session.agentVersion;
		load();
	});

	/** Groups opened to their member rows. Layout input, so expansion re-lays. */
	let expanded = $state<string[]>([]);
	const graph = $derived(layoutDag(ids, edgesIn, { expanded }));

	/** Graph ids can be namespaced (`sub|node`); events carry the bare name. */
	const tail = (s: string) => s.split(/[|:]/).pop() ?? s;
	const short = (s: string) => tail(s).replace(/^__|__$/g, '');

	/**
	 * The live overlay, folded from the log: how often each node committed,
	 * which event that was, what channels it wrote, and which node is mid-pulse
	 * right now.
	 */
	const activity = $derived.by(() => {
		void bus.version;
		const visits: Record<string, number> = {};
		const lastEvent: Record<string, string> = {};
		const lastT: Record<string, number> = {};
		let lastName = '';
		let any = false;
		for (const e of bus.events) {
			if (e.kind !== 'node') continue;
			any = true;
			const name = tail(e.nodeName);
			visits[name] = (visits[name] ?? 0) + 1;
			lastEvent[name] = e.id;
			lastT[name] = e.t;
			lastName = name;
		}
		return { visits, lastEvent, lastT, any, active: session.busy ? lastName : '' };
	});

	const KIND_COLOR: Record<NodeKind, string> = {
		model: 'var(--hx-model)',
		tool: 'var(--hx-tool)',
		middleware: 'var(--hx-state)',
		subagent: 'var(--hx-subagent)',
		terminal: 'var(--muted-foreground)',
		plain: 'var(--muted-foreground)'
	};
	const KIND_LABEL: Record<NodeKind, string> = {
		model: 'model call',
		tool: 'tool executor',
		middleware: 'middleware hook',
		subagent: 'subagent',
		terminal: 'terminal',
		plain: 'graph node'
	};

	const visitsOf = (id: string) => activity.visits[tail(id)] ?? 0;
	const isActive = (id: string) => activity.active === tail(id);
	const groupActive = (n: LaidNode) => n.members.some((m) => isActive(m));

	/** `SkillsMiddleware.before_agent` reads as `Skills` in a 15px row. */
	const memberName = (m: string) =>
		tail(m)
			.split('.')[0]
			.replace(/Middleware$/i, '');

	/** One phase per chain in practice; `hooks` if the harness ever mixes them. */
	function phaseOf(n: LaidNode): string {
		const phases = new Set(n.members.map((m) => hookOf(m) ?? 'hook'));
		return phases.size === 1 ? [...phases][0] : 'hooks';
	}

	/** Rough ellipsis for a 9.5px mono face inside the node width. */
	function fit(text: string, w: number): string {
		const max = Math.floor(w / 5.8);
		return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text;
	}

	function jump(id: string) {
		const eventId = activity.lastEvent[tail(id)];
		if (eventId) onjump?.(eventId);
	}

	/**
	 * Every plain node jumps — except tools, which hands off to the tools tab.
	 *
	 * The box used to open here as a 236px overlay parked on the drawing, which
	 * was the largest thing ever covering the graph and still too small to show a
	 * schema's cost. It has a tab of its own now, so this node's job is to point
	 * at it: the affordance survives, the overlay does not.
	 */
	function activate(id: string) {
		if (tail(id) === 'tools') {
			hover = null;
			onopentools?.();
		} else {
			jump(id);
		}
	}

	function toggle(id: string) {
		expanded = expanded.includes(id) ? expanded.filter((g) => g !== id) : [...expanded, id];
		hover = null;
	}

	/* ── hover card ─────────────────────────────────────────────────────────
	   One card, derived — not one tooltip per node. It holds the id and lets
	   geometry re-derive from the current layout, so expanding a group cannot
	   leave a card floating over stale coordinates. */
	let hover = $state<{ id: string; member?: string } | null>(null);

	/**
	 * The edge under the pointer.
	 *
	 * Edges carry the one thing the drawing cannot say for itself: a dashed line
	 * is a *conditional* edge, decided at runtime by a router rather than
	 * compiled in. That used to be a sentence permanently parked under the
	 * graph. Making the edge itself answerable moves the explanation to the
	 * thing it explains, and takes the sentence off the page.
	 */
	let edge = $state<{ from: string; to: string; conditional: boolean } | null>(null);
	const edgeKey = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

	// Relative time drifts while the pointer rests; a 1s tick only exists
	// while the card does.
	let tick = $state(0);
	$effect(() => {
		if (!hover) return;
		const iv = setInterval(() => tick++, 1000);
		return () => clearInterval(iv);
	});

	function ago(dt: number): string {
		if (dt < 1500) return 'just now';
		if (dt < 60_000) return `${Math.round(dt / 1000)}s ago`;
		return `${Math.floor(dt / 60_000)}m ${Math.round((dt % 60_000) / 1000)}s ago`;
	}

	/* Three lines, no more: name, species, count. The earlier card also listed
	   channels, chain members and a usage hint — enough height that hovering a
	   low node grew the scroll box, which moved the graph under the pointer.
	   Anything deeper lives one click away in the timeline. */
	const card = $derived.by(() => {
		const h = hover;
		if (!h) return null;
		void tick;
		const n = graph.nodes.find((x) => x.id === h.id);
		if (!n) return null;
		const group = !h.member && n.members.length > 0;
		const name = h.member ? tail(h.member) : group ? `middleware · ${phaseOf(n)}` : short(n.id);
		const kind: NodeKind = h.member ? 'middleware' : n.kind;
		const key = tail(h.member ?? n.id);
		const visits = group
			? n.members.reduce((s, m) => s + (activity.visits[tail(m)] ?? 0), 0)
			: (activity.visits[key] ?? 0);
		const t = group
			? Math.max(...n.members.map((m) => activity.lastT[tail(m)] ?? -1))
			: (activity.lastT[key] ?? -1);
		return {
			node: n,
			name,
			color: KIND_COLOR[kind],
			kindLabel: group ? `${n.members.length} middleware hooks` : KIND_LABEL[kind],
			visits,
			seen: t >= 0 ? ago(bus.now() - t) : ''
		};
	});

	/* ── the toolbox ────────────────────────────────────────────────────────
	   Clicking the tools node opens the one list the app never showed anywhere
	   outside the book: what is actually in the box. Read off the LAST request
	   on the wire — not off our own registry — because the wire is the only
	   account the model itself sees. Call counts fold from tool_start events,
	   and a row jumps to that tool's most recent call. */
	/* ── fill the pane ──────────────────────────────────────────────────────
	   The drawing is ~240px of natural size, and this pane gets projected in
	   classrooms — so the svg scales UP to whichever of the pane's dimensions
	   binds first, not just down. Vector text at 3× is a readable slide, not
	   a blur. Two guards: a 4× ceiling (beyond it a six-node column is a
	   billboard), and a 1:1 floor when only HEIGHT is tight — an expanded
	   middleware chain should scroll at natural size, never shrink its 8px
	   rows to fit. Width stays binding always, because a horizontal scrollbar
	   on a graph is worse than a smaller graph. */
	const PAD = 10;
	const MAX_SCALE = 4;
	let paneW = $state(0);
	let paneH = $state(0);
	const viewW = $derived(graph.width + PAD * 2);
	const viewH = $derived(graph.height + PAD * 2);
	const scale = $derived.by(() => {
		if (paneW <= 0 || paneH <= 0 || viewW <= 0 || viewH <= 0) return 1;
		const ideal = Math.min(paneW / viewW, paneH / viewH);
		return ideal >= 1 ? Math.min(MAX_SCALE, ideal) : Math.min(1, paneW / viewW);
	});
	const svgW = $derived(viewW * scale);
	const svgH = $derived(viewH * scale);
</script>

<div class="flex h-full min-h-0 flex-col px-3 py-2.5">
	{#if error && !loaded}
		<p class="text-xs text-muted-foreground">{error}</p>
	{:else if loaded}
		<!-- Node and edge counts used to live here. Nobody can act on either
		     number, and neither answers a question the drawing does not already
		     answer better by being looked at. What is worth a line above the graph
		     is the one thing the drawing cannot show: which node is running now. -->
		{#if activity.active}
			<p class="hx-eyebrow mb-2 shrink-0" style:color="var(--hx-model)">
				running {activity.active}
			</p>
		{/if}

		<!-- The measured box is the flexible middle: everything the eyebrow and
		     legend do not need belongs to the drawing. Auto margins centre the
		     svg when it is smaller than the box and yield to scrolling when an
		     expanded chain makes it taller. The overlays anchor to the OUTER
		     box, past the scroller, so they can never feed back into it. -->
		<div class="relative min-h-0 flex-1">
			<div
				class="h-full overflow-x-hidden overflow-y-auto"
				bind:clientWidth={paneW}
				bind:clientHeight={paneH}
			>
				<div class="flex min-h-full w-full">
					<svg
						width={svgW}
						height={svgH}
						viewBox="-{PAD} -{PAD} {viewW} {viewH}"
						class="m-auto block"
						role="img"
						aria-label="Compiled graph topology"
						onpointerleave={() => {
							hover = null;
							edge = null;
						}}
					>
						<defs>
							<marker
								id="hx-arrow"
								viewBox="0 0 8 8"
								refX="7"
								refY="4"
								markerWidth="5.5"
								markerHeight="5.5"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 8 4 L 0 8 z" fill="var(--muted-foreground)" opacity="0.75" />
							</marker>
							<marker
								id="hx-arrow-cond"
								viewBox="0 0 8 8"
								refX="7"
								refY="4"
								markerWidth="5.5"
								markerHeight="5.5"
								orient="auto-start-reverse"
							>
								<path d="M 0 0 L 8 4 L 0 8 z" fill="var(--hx-interrupt)" opacity="0.85" />
							</marker>
						</defs>

						{#each graph.edges as e (edgeKey(e))}
							{@const on = edge ? edgeKey(edge) === edgeKey(e) : false}
							<path
								d={roundedPath(e.points, 6)}
								fill="none"
								stroke={e.conditional ? 'var(--hx-interrupt)' : 'var(--muted-foreground)'}
								stroke-opacity={on ? 1 : e.conditional ? 0.7 : e.back ? 0.55 : 0.5}
								stroke-width={on ? 2 : 1.1}
								stroke-dasharray={e.conditional ? '4 3' : undefined}
								marker-end={e.conditional ? 'url(#hx-arrow-cond)' : 'url(#hx-arrow)'}
								class="hx-edge"
							/>
							<!-- A 1px line is not a hover target. The fat transparent twin is,
							     and it is drawn under the nodes so a node always wins the
							     pointer where the two overlap. -->
							<path
								d={roundedPath(e.points, 6)}
								fill="none"
								stroke="transparent"
								stroke-width="9"
								pointer-events="stroke"
								class="cursor-help"
								role="presentation"
								onpointerenter={() =>
									(edge = { from: e.from, to: e.to, conditional: !!e.conditional })}
								onpointerleave={() => (edge = null)}
							/>
						{/each}

						{#each graph.nodes as n (n.id)}
							{@const color = KIND_COLOR[n.kind]}
							{@const dim =
								activity.any && !n.members.length && n.kind !== 'terminal' && visitsOf(n.id) === 0}
							{#if n.kind === 'terminal'}
								<g transform="translate({n.x}, {n.y})" opacity="0.65">
									<rect
										width={n.w}
										height={n.h}
										rx={n.h / 2}
										fill="var(--muted)"
										stroke="var(--border)"
										stroke-width="1"
									/>
									<text
										x={n.w / 2}
										y={n.h / 2 + 2.8}
										text-anchor="middle"
										class="hx-g-pill"
										fill="var(--muted-foreground)"
									>
										{short(n.id)}
									</text>
								</g>
							{:else if n.members.length && !expanded.includes(n.id)}
								<g
									transform="translate({n.x}, {n.y})"
									class="cursor-pointer"
									class:hx-node-active={groupActive(n)}
									role="button"
									tabindex="0"
									aria-label="{n.members.length} middleware hooks ({phaseOf(n)}) — open the chain"
									onclick={() => toggle(n.id)}
									onkeydown={(ev) => ev.key === 'Enter' && toggle(n.id)}
									onpointerenter={() => (hover = { id: n.id })}
									onfocus={() => (hover = { id: n.id })}
									onblur={() => (hover = null)}
								>
									<rect
										width={n.w}
										height={n.h}
										rx="9"
										fill="var(--background)"
										stroke={groupActive(n) ? 'var(--hx-state)' : 'var(--border)'}
										stroke-width="1.5"
									/>
									<text x="10" y={n.h / 2 + 2.5} class="hx-g-phase" fill="var(--muted-foreground)">
										{phaseOf(n)}
									</text>
									{#each n.members as m, i (m)}
										<circle
											cx={n.w - 9 - (n.members.length - 1 - i) * 9}
											cy={n.h / 2}
											r="2"
											fill="var(--hx-state)"
											opacity={isActive(m) ? 1 : visitsOf(m) > 0 ? 0.85 : 0.3}
										/>
									{/each}
								</g>
							{:else if n.members.length}
								<g transform="translate({n.x}, {n.y})" class:hx-node-active={groupActive(n)}>
									<rect
										width={n.w}
										height={n.h}
										rx="6"
										fill="var(--background)"
										stroke={groupActive(n) ? 'var(--hx-state)' : 'var(--border)'}
										stroke-width="1.5"
									/>
									<g
										class="cursor-pointer"
										role="button"
										tabindex="0"
										aria-label="Collapse the middleware chain"
										onclick={() => toggle(n.id)}
										onkeydown={(ev) => ev.key === 'Enter' && toggle(n.id)}
										onpointerenter={() => (hover = { id: n.id })}
										onfocus={() => (hover = { id: n.id })}
										onblur={() => (hover = null)}
									>
										<rect width={n.w} height="18" fill="transparent" />
										<text x="10" y="12" class="hx-g-phase" fill="var(--muted-foreground)">
											{phaseOf(n)}
										</text>
										{#each n.members as m, i (m)}
											<circle
												cx={n.w - 9 - (n.members.length - 1 - i) * 9}
												cy="9"
												r="2"
												fill="var(--hx-state)"
												opacity={isActive(m) ? 1 : visitsOf(m) > 0 ? 0.85 : 0.3}
											/>
										{/each}
									</g>
									{#each n.members as m, i (m)}
										{@const mv = visitsOf(m)}
										<g
											transform="translate(0, {20 + i * 15})"
											class="cursor-pointer"
											role="button"
											tabindex="0"
											aria-label="{memberName(m)} — jump to its last event"
											onclick={(ev) => {
												ev.stopPropagation();
												jump(m);
											}}
											onkeydown={(ev) => ev.key === 'Enter' && jump(m)}
											onpointerenter={() => (hover = { id: n.id, member: m })}
											onfocus={() => (hover = { id: n.id, member: m })}
											onblur={() => (hover = null)}
										>
											<rect x="5" width={n.w - 10} height="14" fill="transparent" />
											<circle
												cx="13"
												cy="7"
												r="2"
												fill="var(--hx-state)"
												opacity={isActive(m) ? 1 : mv > 0 ? 0.85 : 0.3}
											/>
											<text
												x="21"
												y="10"
												class="hx-g-row"
												fill="currentColor"
												opacity={mv ? 1 : 0.55}
											>
												{fit(memberName(m), n.w - 52)}
											</text>
											{#if mv}
												<text
													x={n.w - 8}
													y="10"
													text-anchor="end"
													class="hx-g-count"
													fill="var(--hx-state)"
												>
													×{mv}
												</text>
											{/if}
										</g>
									{/each}
								</g>
							{:else}
								{@const visits = visitsOf(n.id)}
								{@const active = isActive(n.id)}
								<g
									transform="translate({n.x}, {n.y})"
									class="cursor-pointer"
									class:hx-node-active={active}
									opacity={dim ? 0.55 : 1}
									role="button"
									tabindex="0"
									aria-label={tail(n.id) === 'tools'
										? 'tools — open the toolbox'
										: `${short(n.id)} — jump to its last event`}
									onclick={() => activate(n.id)}
									onkeydown={(ev) => ev.key === 'Enter' && activate(n.id)}
									onpointerenter={() => (hover = { id: n.id })}
									onfocus={() => (hover = { id: n.id })}
									onblur={() => (hover = null)}
								>
									<rect
										width={n.w}
										height={n.h}
										rx="6"
										fill="var(--background)"
										stroke={active ? color : 'var(--border)'}
										stroke-width="1.5"
									/>
									<circle cx="10" cy={n.h / 2} r="2.5" fill={color} opacity="0.9" />
									<text x="17" y={n.h / 2 + 3.4} class="hx-g-label" fill="currentColor">
										{fit(short(n.id), n.w - (visits ? 46 : 26))}
									</text>
									{#if visits}
										<text
											x={n.w - 7}
											y={n.h / 2 + 3}
											text-anchor="end"
											class="hx-g-count"
											fill={color}
										>
											×{visits}
										</text>
									{/if}
								</g>
							{/if}
						{/each}
					</svg>
				</div>
			</div>
		</div>

		<!-- The readout, not a card.
		     A floating panel over a drawing is the wrong shape however small you
		     make it: the thing you want to read is always next to the thing you are
		     pointing at, so it covers a neighbour, an edge, or the node itself. So
		     it lives down here instead — and at a FIXED height, because a line that
		     grows and shrinks as the pointer crosses the graph moves the graph
		     under the pointer, which is the same fault by another route. The
		     resting text is short enough to fit the same two lines every hover
		     needs, now that the dashed edges explain themselves when you touch
		     them. -->
		<p
			class="mt-1.5 h-[2.4em] overflow-hidden text-[10px] leading-snug text-muted-foreground"
			aria-live="polite"
		>
			{#if card}
				<span class="inline-flex items-baseline gap-1.5">
					<span
						class="inline-block size-1.5 translate-y-[-1px] rounded-full"
						style:background={card.color}
					></span>
					<span class="font-mono text-[10.5px] text-foreground">{card.name}</span>
				</span>
				<span class="hx-num">
					· {card.kindLabel}
					{#if card.visits > 0}
						· ×{card.visits}{#if card.seen}&nbsp;· {card.seen}{/if}
					{:else}
						· unvisited
					{/if}
				</span>
			{:else if edge}
				<span class="font-mono text-[10.5px] text-foreground">
					{short(edge.from)} → {short(edge.to)}
				</span>
				{#if edge.conditional}
					<span style:color="var(--hx-interrupt)">· conditional</span>
					<span>— a router decides this one at runtime, every time it is reached</span>
				{:else}
					<span>· always — compiled into the graph, taken whenever the source finishes</span>
				{/if}
			{:else}
				click a node to jump the timeline · click a chain to open the onion · hover an edge for its
				rule
			{/if}
		</p>
	{/if}
</div>

<style>
	.hx-g-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
	}
	.hx-g-row {
		font-family: var(--font-mono);
		font-size: 8.5px;
	}
	.hx-g-count {
		font-family: var(--font-mono);
		font-size: 8px;
	}
	.hx-g-pill {
		font-family: var(--font-mono);
		font-size: 8px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}
	.hx-g-phase {
		font-family: var(--font-mono);
		font-size: 7.5px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	/*
		Focus, quietly.

		Clicking a node focuses it (they are keyboard-actionable), and on a dark
		canvas the engine's default ring — and even the app's 2px ring — reads
		as a fat white halo around the rounded rect. A click needs no indicator
		at all: the hover card and the timeline jump ARE the response. Keyboard
		focus keeps one, but as a hairline in the accent, offset so it reads as
		an aura rather than a frame.
	*/
	svg g[role='button']:focus {
		outline: none;
	}
	svg g[role='button']:focus-visible {
		outline: 1px solid color-mix(in oklab, var(--hx-accent, var(--hx-model)) 60%, transparent);
		outline-offset: 3px;
	}

	/* The visible line must never eat the pointer — its fat transparent twin is
	   the target, and the two are stacked exactly on top of each other. */
	.hx-edge {
		pointer-events: none;
	}

	.hx-node-active > rect {
		animation: hx-node-pulse 1.1s ease-in-out infinite;
	}
	@keyframes hx-node-pulse {
		50% {
			stroke-opacity: 0.35;
		}
	}
</style>
