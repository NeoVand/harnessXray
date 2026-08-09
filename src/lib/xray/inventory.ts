import { session } from '$lib/agent/session.svelte';
import { SUBAGENTS } from '$lib/agent/subagents';
import * as z from 'zod';

/**
 * What is in the harness, counted off the harness.
 *
 * For the empty state, which needs something true to say before anything has
 * happened. Every number here is read from the compiled agent rather than typed
 * out, because a hardcoded inventory is precisely the thing that goes quietly
 * wrong: deepagents 1.12 removed a middleware and nothing noticed for a week.
 * If an upgrade takes a tool away, this says a smaller number the same day.
 *
 * The agent it reads is `peekAgent`'s keyless stand-in — the same one the graph
 * tab draws, cached after the first call, and it needs no API key because
 * composing a graph never calls a model.
 */

export interface Inventory {
	/** Tools the model will actually be offered, ours and the harness's. */
	tools: number;
	/** How many of those we wrote. The rest came with the harness. */
	ours: number;
	subagents: number;
	skills: number;
	middleware: number;
	/** Nodes in the compiled graph — the drawing on the right. */
	nodes: number;
}

interface AgentOptions {
	tools?: { name?: string }[];
	middleware?: { name: string; tools?: { name?: string }[] }[];
}

/**
 * Every tool the model sees, with its schema, before a single message is sent.
 *
 * Middleware carry tools of their own — the filesystem's seven, the subagent
 * spawner's `task`, the plan channel's `write_todos` — and they are not on
 * `options.tools`, which is only the list we passed in. Counting one and not
 * the other is how "how many tools does this agent have" gets answered wrong
 * by half.
 */
export function toolsOf(agent: unknown): { name: string; ours: boolean; schema: unknown }[] {
	const o = (agent as { options?: AgentOptions })?.options;
	if (!o) return [];
	const out: { name: string; ours: boolean; schema: unknown }[] = [];
	const seen = new Set<string>();
	const add = (t: { name?: string }, ours: boolean) => {
		if (!t?.name || seen.has(t.name)) return;
		seen.add(t.name);
		out.push({ name: t.name, ours, schema: t });
	};
	for (const t of o.tools ?? []) add(t, true);
	for (const m of o.middleware ?? []) for (const t of m.tools ?? []) add(t, false);
	// `execute` is declared on the filesystem middleware and never offered to the
	// model here: it runs a command in a sandbox, and this app's backend is a
	// LangGraph state channel with nothing to run it in. Verified by diffing this
	// list against the first real request — 18 declared, 17 sent, and this was
	// the one missing. Counting it would make the forecast overstate the box.
	return out.filter((t) => t.name !== 'execute');
}

export async function inventory(): Promise<Inventory | null> {
	const agent = await session.peekAgent();
	if (!agent) return null;
	const o = (agent as { options?: AgentOptions }).options;
	const tools = toolsOf(agent);

	let nodes = 0;
	try {
		const { readTopology } = await import('$lib/agent/graph');
		nodes = Object.keys((await readTopology(agent, { xray: true })).nodes).length;
	} catch {
		/* the drawing is a nicety here, not a reason to have no counts */
	}

	const { skills } = await import('$lib/agent/skills.svelte');
	return {
		tools: tools.length,
		ours: tools.filter((t) => t.ours).length,
		subagents: SUBAGENTS.length,
		skills: skills.active.length,
		middleware: (o?.middleware ?? []).length,
		nodes
	};
}

/**
 * The tools shaped as the request will carry them.
 *
 * `name`, `description`, `parameters` — the three fields the provider is sent,
 * so the char counts the panel shows are the ones that will actually be billed
 * rather than a guess at them. The JSON Schema comes from the tool's own zod
 * schema via `z.toJSONSchema`; a tool whose schema will not convert still
 * appears, with its description, because a tool missing from the list would
 * understate the bill.
 */
export function toolSchemas(agent: unknown): unknown[] {
	return toolsOf(agent).map(({ name, schema }) => {
		const t = schema as { description?: string; schema?: unknown };
		let parameters: unknown = {};
		try {
			if (t.schema) {
				const j = z.toJSONSchema(t.schema as z.ZodType) as Record<string, unknown>;
				// The dialect declaration is ours, not the provider's — dropping it
				// keeps the estimate from carrying ~55 characters per tool that will
				// never be sent.
				delete j.$schema;
				parameters = j;
			}
		} catch {
			/* an unconvertible schema still counts for its description */
		}
		return { name, description: t.description ?? '', parameters };
	});
}
