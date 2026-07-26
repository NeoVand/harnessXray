<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { layoutDag, type EdgeIn } from '$lib/xray/layout';

	/**
	 * The compiled topology, drawn — and alive.
	 *
	 * Still not a diagram anyone drew: the nodes and edges come from
	 * `getGraphAsync({ xray: true })` on the live agent, so middleware names and
	 * conditional edges are the real ones and change when the harness does.
	 * What is new is that the drawing is wired to the event log. Every `node`
	 * event the graph publishes lights its node up: the one that committed last
	 * pulses while the run is going, visit counts accumulate per node, and
	 * clicking a node jumps the timeline to the last thing it did. The map and
	 * the territory are the same object.
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

	const graph = $derived(layoutDag(ids, edgesIn));

	/** Graph ids can be namespaced (`sub|node`); events carry the bare name. */
	const tail = (s: string) => s.split(/[|:]/).pop() ?? s;
	const short = (s: string) => tail(s).replace(/^__|__$/g, '');

	/**
	 * The live overlay, folded from the log: how often each node committed,
	 * which event that was, and which node is mid-pulse right now.
	 */
	const activity = $derived.by(() => {
		void bus.version;
		const visits: Record<string, number> = {};
		const lastEvent: Record<string, string> = {};
		let lastName = '';
		for (const e of bus.events) {
			if (e.kind !== 'node') continue;
			const name = tail(e.nodeName);
			visits[name] = (visits[name] ?? 0) + 1;
			lastEvent[name] = e.id;
			lastName = name;
		}
		return { visits, lastEvent, active: session.busy ? lastName : '' };
	});

	/** Two-line labels: `xMiddleware.before_model` reads as name over hook. */
	function labelOf(id: string): [string, string?] {
		const name = short(id);
		const dot = name.indexOf('.');
		if (dot > 0) return [name.slice(0, dot).replace(/Middleware$/, ''), name.slice(dot + 1)];
		return [name];
	}

	/** Rough ellipsis for a 9.5px mono face inside the node width. */
	function fit(text: string, w: number): string {
		const max = Math.floor((w - 14) / 6);
		return text.length > max ? text.slice(0, max - 1) + '…' : text;
	}

	function jump(id: string) {
		const eventId = activity.lastEvent[tail(id)];
		if (eventId) onjump?.(eventId);
	}

	const PAD = 12;
	/** Room kept to the right of the pipeline for loop arcs to travel in. */
	const LOOP_ROOM = 56;

	/** Loop arcs travel beside the pipeline; stagger them so they do not overlap. */
	function backPath(e: { x1: number; y1: number; x2: number; y2: number }, i: number): string {
		const reach = graph.width + 26 + (i % 3) * 12;
		return `M ${e.x1} ${e.y1} C ${reach} ${e.y1}, ${reach} ${e.y2}, ${e.x2} ${e.y2}`;
	}
</script>

<div class="px-3 py-3">
	{#if error && !loaded}
		<p class="text-xs text-muted-foreground">{error}</p>
	{:else if loaded}
		<p class="hx-eyebrow mb-2">
			{graph.nodes.length} nodes · {graph.edges.length} edges
			{#if activity.active}
				<span class="ml-2" style:color="var(--hx-model)">· running {activity.active}</span>
			{/if}
		</p>

		<div class="overflow-x-auto">
			<svg
				width={graph.width + PAD * 2 + LOOP_ROOM}
				height={graph.height + PAD * 2}
				viewBox="-{PAD} -{PAD} {graph.width + PAD * 2 + LOOP_ROOM} {graph.height + PAD * 2}"
				class="block"
				role="img"
				aria-label="Compiled graph topology"
			>
				<defs>
					<marker
						id="hx-arrow"
						viewBox="0 0 8 8"
						refX="7"
						refY="4"
						markerWidth="6"
						markerHeight="6"
						orient="auto-start-reverse"
					>
						<path d="M 0 0 L 8 4 L 0 8 z" fill="var(--muted-foreground)" opacity="0.7" />
					</marker>
				</defs>

				{#each graph.edges as e, i (`${e.from}->${e.to}-${i}`)}
					{@const mid = (e.y2 - e.y1) / 2}
					<path
						d={e.back
							? backPath(e, i)
							: `M ${e.x1} ${e.y1} C ${e.x1} ${e.y1 + mid}, ${e.x2} ${e.y2 - mid}, ${e.x2} ${e.y2}`}
						fill="none"
						stroke={e.conditional ? 'var(--hx-interrupt)' : 'var(--muted-foreground)'}
						stroke-opacity={e.conditional ? 0.75 : 0.45}
						stroke-width="1"
						stroke-dasharray={e.conditional ? '4 3' : undefined}
						marker-end="url(#hx-arrow)"
					/>
				{/each}

				{#each graph.nodes as n (n.id)}
					{@const name = tail(n.id)}
					{@const terminal = name === '__start__' || name === '__end__'}
					{@const visits = activity.visits[name] ?? 0}
					{@const active = activity.active === name}
					{@const [line1, line2] = labelOf(n.id)}
					<g
						transform="translate({n.x}, {n.y})"
						class="cursor-pointer"
						class:hx-node-active={active}
						opacity={terminal ? 0.55 : visits > 0 || !bus.length ? 1 : 0.5}
						onclick={() => jump(n.id)}
						onkeydown={(ev) => ev.key === 'Enter' && jump(n.id)}
						role="button"
						tabindex="0"
						aria-label="{short(n.id)} — jump to its last event"
					>
						<rect
							width={n.w}
							height={n.h}
							rx="4"
							fill="var(--background)"
							stroke={active ? 'var(--hx-model)' : 'var(--border)'}
							stroke-width={active ? 1.5 : 1}
						/>
						<text
							x={n.w / 2}
							y={line2 ? n.h / 2 - 4 : n.h / 2 + 3}
							text-anchor="middle"
							class="hx-graph-label"
							fill="currentColor"
						>
							{fit(line1, n.w)}
						</text>
						{#if line2}
							<text
								x={n.w / 2}
								y={n.h / 2 + 9}
								text-anchor="middle"
								class="hx-graph-label"
								fill="var(--muted-foreground)"
							>
								{fit(line2, n.w)}
							</text>
						{/if}
						{#if visits > 0 && !terminal}
							<text x={n.w - 5} y="10" text-anchor="end" class="hx-graph-count">
								×{visits}
							</text>
						{/if}
					</g>
				{/each}
			</svg>
		</div>

		<p class="mt-2 text-[10px] text-muted-foreground">
			<span style:color="var(--hx-interrupt)">⇢ dashed</span> — conditional, decided at runtime · nodes
			light up as they commit · click one to jump to its last event
		</p>
	{/if}
</div>

<style>
	.hx-graph-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
	}
	.hx-graph-count {
		font-family: var(--font-mono);
		font-size: 8px;
		fill: var(--hx-model);
	}
	.hx-node-active rect {
		animation: hx-node-pulse 1.1s ease-in-out infinite;
	}
	@keyframes hx-node-pulse {
		50% {
			stroke-opacity: 0.35;
		}
	}
</style>
