<script lang="ts">
	import { session } from '$lib/agent/session.svelte';

	/**
	 * The compiled topology.
	 *
	 * Not a diagram anyone drew — this is `getGraphAsync({ xray: true })` on the
	 * live agent, so the node names are the real middleware names and the dotted
	 * edges are the real conditional ones. When the harness changes, this changes.
	 */
	let nodes = $state<string[]>([]);
	let edges = $state<{ from: string; to: string; conditional: boolean }[]>([]);
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
			nodes = Object.keys(g.nodes);
			edges = g.edges.map((e) => ({
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

	function short(n: string) {
		return n.replace(/^__|__$/g, '');
	}
</script>

<div class="px-3 py-3">
	{#if error && !loaded}
		<p class="text-xs text-muted-foreground">{error}</p>
	{:else}
		<p class="hx-eyebrow mb-3">{nodes.length} nodes · {edges.length} edges</p>

		<ul class="space-y-px">
			{#each nodes as n (n)}
				{@const entry = n === '__start__'}
				{@const exit = n === '__end__'}
				<li
					class="flex items-baseline gap-2 py-1 font-mono text-[11px]"
					class:text-muted-foreground={entry || exit}
				>
					<span
						class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
						style:background={entry || exit ? 'var(--muted-foreground)' : 'var(--hx-model)'}
					></span>
					{short(n)}
				</li>
			{/each}
		</ul>

		<p class="hx-eyebrow mt-5 mb-2">edges</p>
		<ul class="space-y-px">
			{#each edges as e, i (i)}
				<li class="flex items-baseline gap-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
					<span class="text-foreground/70">{short(e.from)}</span>
					<span style:color={e.conditional ? 'var(--hx-interrupt)' : undefined}>
						{e.conditional ? '⇢' : '→'}
					</span>
					<span class="text-foreground/70">{short(e.to)}</span>
				</li>
			{/each}
		</ul>

		{#if edges.some((e) => e.conditional)}
			<p class="mt-4 text-[10px] text-muted-foreground">
				<span style:color="var(--hx-interrupt)">⇢</span> conditional — the route is decided at
				runtime, by the graph, not by the edge.
			</p>
		{/if}
	{/if}
</div>
