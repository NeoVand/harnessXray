import type { Graph } from '@langchain/core/runnables/graph';

/**
 * Read the compiled topology of a graph.
 *
 * This is the data source for the X-ray's graph view: it returns the *actual*
 * compiled Pregel graph — real middleware node names, real conditional edges —
 * rather than a diagram we drew by hand.
 *
 * `xray: true` expands subgraphs inline (each subagent becomes a
 * `subgraph … end` block) instead of collapsing them to a single node.
 *
 * ── Why the cast ────────────────────────────────────────────────────────────
 * Upstream typing gap, not a runtime one. `CompiledGraph.getGraphAsync` declares
 * `config?: RunnableConfig & { xray?: boolean | number }`
 * (@langchain/langgraph/dist/graph/graph.d.ts:167), but the `Pregel` overload
 * that `createDeepAgent()` actually returns declares only
 * `config: RunnableConfig` (dist/pregel/index.d.ts:330). Both are backed by the
 * same implementation. Verified in-browser against deepagents@1.11.1: passing
 * `xray` yields 7 nodes / 8 edges with subgraphs expanded; omitting it collapses
 * them. Confined to this one function so the assertion is auditable.
 */
export interface GraphSource {
	getGraphAsync(config?: Record<string, unknown>): Promise<Graph>;
}

export async function readTopology(
	agent: unknown,
	{ xray = true }: { xray?: boolean | number } = {}
): Promise<Graph> {
	return (agent as GraphSource).getGraphAsync({ xray });
}

/** The compiled topology as mermaid source, ready to render. */
export async function topologyToMermaid(
	agent: unknown,
	opts?: { xray?: boolean | number }
): Promise<string> {
	return (await readTopology(agent, opts)).drawMermaid();
}
