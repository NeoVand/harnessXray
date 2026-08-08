/**
 * Which subagent a subgraph namespace belongs to.
 *
 * LangGraph names a subagent's namespace with a hash — `tools:9a22cf28-…` —
 * and publishes nothing that says which `task` call produced it. So the only
 * route back to a name is the order: the Nth namespace to appear is the Nth
 * dispatch on the transcript. That holds in practice, including for parallel
 * fan-out, because the calls and the namespaces are created in the same order.
 *
 * The failure is what happens when the two lists stop starting together. This
 * was indexed off the size of the pairing map, which is page-session state,
 * against a transcript restored from storage that still holds every dispatch
 * the thread ever made. Continue a restored thread and the first new lane
 * paired with `task` call number one: a report-writer arrived on screen
 * labelled `paper-reader`, which is worse than an unlabelled lane, because the
 * timeline, the file log and the plan tab all repeat it confidently.
 *
 * Sealing fixes the alignment at its root. A dispatch that is already on the
 * transcript when a page session begins can never be matched to a namespace
 * this session observes, so it is claimed up front and never offered again.
 *
 * Kept out of `session.svelte.ts` so the rule is testable without a browser, a
 * model, or a graph.
 */

/** The shape this needs from a tool call; `ChatMessage['toolCalls']` satisfies it. */
export interface Dispatch {
	id: string;
	name: string;
	args: unknown;
}

/** Namespace → subagent name, plus the dispatches already spoken for. */
export interface Lanes {
	byNamespace: Map<string, string>;
	claimed: Set<string>;
}

export const emptyLanes = (): Lanes => ({ byNamespace: new Map(), claimed: new Set() });

/**
 * Forget every pairing and write off the dispatches already on the transcript.
 *
 * Call after anything that replaces or truncates the message history —
 * restoring a thread, switching threads, rewinding a turn.
 */
export function sealLanes(lanes: Lanes, dispatches: Iterable<Dispatch>): void {
	lanes.byNamespace.clear();
	lanes.claimed.clear();
	for (const d of dispatches) if (d.name === 'task') lanes.claimed.add(d.id);
}

/**
 * The subagent behind a namespace, pairing it with the oldest unclaimed
 * dispatch the first time it is seen.
 *
 * Returns undefined when there is nothing to pair with — an unnamed lane is
 * the honest outcome, and every caller already treats it as optional.
 */
export function laneName(
	lanes: Lanes,
	namespace: string,
	dispatches: Iterable<Dispatch>
): string | undefined {
	const known = lanes.byNamespace.get(namespace);
	if (known) return known;

	for (const d of dispatches) {
		if (d.name !== 'task' || lanes.claimed.has(d.id)) continue;
		const type = (d.args as { subagent_type?: string } | null)?.subagent_type;
		// Arguments stream in after the call is announced. Claiming one whose
		// type has not landed yet would spend the pairing on a blank and shift
		// every lane after it by one — so wait, and take it on the next event
		// from this namespace.
		if (typeof type !== 'string' || !type) return undefined;
		lanes.claimed.add(d.id);
		lanes.byNamespace.set(namespace, type);
		return type;
	}
	return undefined;
}
