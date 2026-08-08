<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { toolMeta } from '$lib/agent/tool-meta';
	import { crew } from '$lib/xray/crew';
	import { tip } from '$lib/hooks/tip';
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
	let { onjump }: { onjump?: (eventId: string) => void } = $props();

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

	/** Every plain node jumps — except tools, which discloses its box. */
	function activate(id: string) {
		if (tail(id) === 'tools') {
			toolboxOpen = !toolboxOpen;
			hover = null;
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
	let toolboxOpen = $state(false);
	const toolsNode = $derived(graph.nodes.find((n) => tail(n.id) === 'tools' && !n.members.length));
	const toolbox = $derived.by(() => {
		void bus.version;
		let names: string[] = [];
		for (let i = bus.events.length - 1; i >= 0; i--) {
			const e = bus.events[i];
			if (e.kind === 'http_request' && e.url.includes('/responses')) {
				const raw = (e.body as { tools?: unknown } | null)?.tools;
				if (Array.isArray(raw)) {
					names = raw
						.map((t) => {
							const o = t as { name?: string; function?: { name?: string } };
							return o.name ?? o.function?.name ?? '';
						})
						.filter(Boolean);
					break;
				}
			}
		}
		const calls: Record<string, { n: number; last: string }> = {};
		for (const e of bus.events) {
			if (e.kind !== 'tool_start') continue;
			const c = (calls[e.name] ??= { n: 0, last: '' });
			c.n++;
			c.last = e.id;
		}
		return { names, calls };
	});

	/* The crew, nested under the one tool that dispatches it. `task` is the only
	   row in the box that is really a door to five more things, and the roster
	   behind it is not the one this app declared — the harness appends a
	   general-purpose clone carrying every tool the main agent has. Open by
	   default: the whole point is that nobody knew it was there. */
	let crewOpen = $state(true);
	const roster = $derived.by(() => {
		void bus.version;
		return crew(bus);
	});

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
	/** Where auto-margins actually put the svg, so the card lands beside it. */
	const ox = $derived(Math.max(0, (paneW - svgW) / 2));
	const oy = $derived(Math.max(0, (paneH - svgH) / 2));
	/** The scroller's position, so overlays track content in the 1:1 case. */
	let scrollY = $state(0);

	/* Overlays live OUTSIDE the scroll box and are clamped to the pane, so a
	   card on the lowest node can never grow the scrollable height — that grew
	   a scrollbar, which shrank the pane, which rescaled the graph under the
	   pointer. Hover must never move the thing being hovered. */
	const CARD_W = 224;
	function cardPos(n: LaidNode, estH = 84): { left: number; top: number } {
		const right = ox + (n.x + n.w + PAD) * scale + 8;
		const left =
			right + CARD_W <= paneW ? right : Math.max(4, ox + (n.x + PAD) * scale - CARD_W - 8);
		const top = Math.max(
			4,
			Math.min(oy + (n.y + PAD) * scale - scrollY, Math.max(4, paneH - estH))
		);
		return { left, top };
	}
</script>

<div class="flex h-full min-h-0 flex-col px-3 py-2.5">
	{#if error && !loaded}
		<p class="text-xs text-muted-foreground">{error}</p>
	{:else if loaded}
		<p class="hx-eyebrow mb-2 shrink-0">
			{ids.length} nodes · {edgesIn.length} edges
			{#if activity.active}
				<span class="ml-1.5" style:color="var(--hx-model)">· running {activity.active}</span>
			{/if}
		</p>

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
				onscroll={(e) => (scrollY = e.currentTarget.scrollTop)}
			>
				<div class="flex min-h-full w-full">
					<svg
						width={svgW}
						height={svgH}
						viewBox="-{PAD} -{PAD} {viewW} {viewH}"
						class="m-auto block"
						role="img"
						aria-label="Compiled graph topology"
						onpointerleave={() => (hover = null)}
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

						{#each graph.edges as e (`${e.from}->${e.to}`)}
							<path
								d={roundedPath(e.points, 6)}
								fill="none"
								stroke={e.conditional ? 'var(--hx-interrupt)' : 'var(--muted-foreground)'}
								stroke-opacity={e.conditional ? 0.7 : e.back ? 0.55 : 0.5}
								stroke-width="1.1"
								stroke-dasharray={e.conditional ? '4 3' : undefined}
								marker-end={e.conditional ? 'url(#hx-arrow-cond)' : 'url(#hx-arrow)'}
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

			{#if card && !toolboxOpen}
				{@const pos = cardPos(card.node)}
				<div
					class="hx-rule pointer-events-none absolute z-10 border bg-background px-2.5 py-2"
					style:width="{CARD_W}px"
					style:left="{pos.left}px"
					style:top="{pos.top}px"
				>
					<p class="truncate font-mono text-[11px] leading-tight">{card.name}</p>
					<p class="hx-eyebrow mt-1 flex items-center gap-1.5">
						<span class="inline-block size-1.5 rounded-full" style:background={card.color}></span>
						{card.kindLabel}
					</p>
					<p class="hx-num mt-1.5 text-[10px] text-muted-foreground">
						{#if card.visits > 0}
							×{card.visits}
							{card.visits === 1 ? 'visit' : 'visits'}
							{#if card.seen}· {card.seen}{/if}
						{:else}
							not visited this session
						{/if}
					</p>
				</div>
			{/if}

			{#if toolboxOpen && toolsNode}
				{@const pos = cardPos(toolsNode, 300)}
				<div
					class="hx-rule absolute z-20 border bg-background"
					style:width="236px"
					style:left="{pos.left}px"
					style:top="{pos.top}px"
				>
					<p class="hx-eyebrow flex items-baseline justify-between px-2.5 pt-2">
						the toolbox
						<span class="hx-num text-[9px] text-muted-foreground">
							{toolbox.names.length || ''}
						</span>
					</p>
					{#if toolbox.names.length === 0}
						<p class="max-w-[24ch] px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground">
							Read off the wire, so it needs a wire: after the first message, the full tool list of
							the latest request appears here.
						</p>
					{:else}
						<div class="mt-1.5 max-h-52 overflow-y-auto pb-1">
							{#each toolbox.names as name (name)}
								{@const meta = toolMeta(name)}
								{@const c = toolbox.calls[name]}
								{@const isTask = name === 'task' && roster.length > 0}
								<button
									class="flex w-full items-baseline gap-2 px-2.5 py-1 text-left transition-colors
									       hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
									disabled={!c && !isTask}
									onclick={() => (isTask ? (crewOpen = !crewOpen) : c && onjump?.(c.last))}
									{@attach tip(isTask ? 'the crew it can dispatch — click to fold' : meta.blurb)}
								>
									<span
										class="inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-full"
										style:background={meta.origin === 'ours'
											? 'var(--hx-tool)'
											: 'var(--muted-foreground)'}
										style:opacity={c ? 1 : 0.45}
									></span>
									<span
										class="min-w-0 flex-1 truncate font-mono text-[10.5px]"
										class:text-muted-foreground={!c}
									>
										{name}
									</span>
									{#if isTask}
										<span class="hx-num shrink-0 text-[9px] text-muted-foreground">
											{roster.length}{crewOpen ? ' ▾' : ' ▸'}
										</span>
									{/if}
									{#if c}
										<span class="hx-num shrink-0 text-[9px]" style:color="var(--hx-tool)">
											×{c.n}
										</span>
									{/if}
								</button>

								{#if isTask && crewOpen}
									<!-- The roster, indented under the tool that dispatches it.
									     Read off the task schema on the wire, so it lists what the
									     MODEL may choose rather than what this app declared — which is
									     how the general-purpose clone becomes visible at all. -->
									{#each roster as m (m.name)}
										<button
											class="flex w-full items-baseline gap-2 py-[3px] pr-2.5 pl-6 text-left
											       transition-colors hover:bg-muted/60 disabled:cursor-default
											       disabled:hover:bg-transparent"
											disabled={!m.calls.n}
											onclick={() => m.calls.n && onjump?.(m.calls.last)}
											{@attach tip(
												m.origin === 'harness'
													? `${m.description || 'appended by the harness'} — you never declared this one: createDeepAgent adds it unless generalPurposeSubagent is disabled, and hands it the main agent's whole tool set.`
													: m.description
											)}
										>
											<span
												class="inline-block size-1 shrink-0 translate-y-[-1px] rounded-full"
												style:background={m.origin === 'ours'
													? 'var(--hx-subagent)'
													: 'var(--hx-interrupt)'}
												style:opacity={m.calls.n ? 1 : 0.45}
											></span>
											<span
												class="min-w-0 flex-1 truncate font-mono text-[10px]"
												class:text-muted-foreground={!m.calls.n}
											>
												{m.name}
											</span>
											{#if m.tools.known}
												<span class="hx-num shrink-0 text-[9px] text-muted-foreground/60">
													{m.tools.count}t
												</span>
											{/if}
											{#if m.calls.n}
												<span class="hx-num shrink-0 text-[9px]" style:color="var(--hx-subagent)">
													×{m.calls.n}
												</span>
											{/if}
										</button>
									{/each}
								{/if}
							{/each}
						</div>
						<p
							class="hx-rule border-t px-2.5 py-1.5 text-[9px] leading-relaxed text-muted-foreground/70"
						>
							ochre — written for this agent · grey — the harness's · a row jumps to its last call{#if roster.some((m) => m.origin === 'harness')}
								· <span style:color="var(--hx-interrupt)">amber</span> — a subagent the harness added,
								not this app{/if}
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<p class="mt-1.5 text-[10px] text-muted-foreground">
			<span style:color="var(--hx-interrupt)">⇢ dashed</span> — conditional, decided at runtime · loops
			return on the right rail · dot-rows are the middleware onion, click to open · click a node to jump
			the timeline · click tools for the toolbox
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

	.hx-node-active > rect {
		animation: hx-node-pulse 1.1s ease-in-out infinite;
	}
	@keyframes hx-node-pulse {
		50% {
			stroke-opacity: 0.35;
		}
	}
</style>
