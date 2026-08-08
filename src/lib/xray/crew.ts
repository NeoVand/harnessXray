import type { EventBus } from './bus.svelte';
import { SUBAGENTS } from '$lib/agent/subagents';

/**
 * The crew: every subagent the model is allowed to dispatch.
 *
 * Read off the wire, like the toolbox, and for a sharper reason than symmetry.
 * The app declares four subagents — but `createDeepAgent` appends a fifth,
 * `general-purpose`, unless you pass `generalPurposeSubagent: {enabled: false}`,
 * and gives it the main agent's *entire* tool set. So the roster the model sees
 * has never been the roster this app wrote, and until now nothing on screen
 * said so. Reading the `task` schema instead of our own registry is what makes
 * that discoverable rather than something you have to already know.
 *
 * The parse targets two strings the harness builds, both verified against
 * deepagents@1.11.1:
 *
 *   description:  "Available agent types and the tools they have access to:"
 *                 followed by one `- <name>: <description>` line per subagent.
 *   subagent_type: "Name of the agent to use. Available: a, b, c"
 *
 * The heading is upstream's, and it overpromises: those lines carry each
 * subagent's *description*, not its tools. Tool counts therefore come from our
 * own specs — except general-purpose, whose count is the main agent's, because
 * that is literally what it was handed. Every number here says where it came
 * from.
 */

export interface CrewMember {
	name: string;
	/** The description the model reads when choosing. */
	description: string;
	/** Declared in this app, or appended by the harness. */
	origin: 'ours' | 'harness';
	/** How many tools it carries, and whether we can vouch for the number. */
	tools: { count: number; known: boolean };
	/** Dispatches so far this run, and the last one, for jumping the timeline. */
	calls: { n: number; last: string };
}

// Widened to plain strings on purpose: the roster is whatever the wire says,
// and a literal union inferred from our own specs would refuse to be asked
// about a name we did not declare — which is precisely the case this exists for.
/** Names of the subagents this app actually declares. */
const OURS: ReadonlySet<string> = new Set<string>(SUBAGENTS.map((s) => s.name));
const OUR_TOOL_COUNT: ReadonlyMap<string, number> = new Map<string, number>(
	SUBAGENTS.map((s) => [s.name, s.tools.length])
);

/** `- name: description`, one per line, indented by the template literal. */
const ROSTER_LINE = /^\s*-\s+([a-z0-9][a-z0-9._-]*)\s*:\s*(.*)$/i;

interface WireTool {
	name?: string;
	description?: string;
	function?: { name?: string; description?: string; parameters?: unknown };
	parameters?: unknown;
}

/**
 * Pull the last request off the bus and read the task tool out of it.
 *
 * Newest-first, and only `/responses` calls: an image request carries no tools
 * and would otherwise blank the roster the moment a picture was generated.
 */
function lastTools(bus: EventBus): WireTool[] {
	for (let i = bus.events.length - 1; i >= 0; i--) {
		const e = bus.events[i];
		if (e.kind !== 'http_request' || !e.url.includes('/responses')) continue;
		const raw = (e.body as { tools?: unknown } | null)?.tools;
		if (Array.isArray(raw)) return raw as WireTool[];
	}
	return [];
}

const nameOf = (t: WireTool) => t.name ?? t.function?.name ?? '';
const descOf = (t: WireTool) => t.description ?? t.function?.description ?? '';

/**
 * Names from `subagent_type`'s own description — the authoritative enum, since
 * it is generated from the keys of the graph map the tool dispatches through.
 * Used as a fallback when the roster lines cannot be parsed, and as the source
 * of truth for *which* names exist when the two disagree.
 */
function namesFromSchema(task: WireTool): string[] {
	const params = (task.parameters ?? task.function?.parameters) as
		{ properties?: Record<string, { description?: string }> } | undefined;
	const d = params?.properties?.subagent_type?.description ?? '';
	const at = d.indexOf('Available:');
	if (at < 0) return [];
	return d
		.slice(at + 'Available:'.length)
		.split(',')
		.map((s) => s.trim().replace(/^`|`$/g, ''))
		.filter(Boolean);
}

export function crew(bus: EventBus): CrewMember[] {
	const task = lastTools(bus).find((t) => nameOf(t) === 'task');
	if (!task) return [];

	const described = new Map<string, string>();
	for (const line of descOf(task).split('\n')) {
		const m = ROSTER_LINE.exec(line);
		if (m) described.set(m[1], m[2].trim());
	}

	// The enum decides membership; the roster lines only supply prose. A name in
	// one and not the other is upstream drift, and trusting the enum means the
	// list can never claim a subagent the tool would refuse to dispatch.
	const names = namesFromSchema(task);
	const roster = names.length ? names : [...described.keys()];

	const calls: Record<string, { n: number; last: string }> = {};
	for (const e of bus.events) {
		if (e.kind !== 'tool_start' || e.name !== 'task') continue;
		const type = (e.args as { subagent_type?: unknown } | null)?.subagent_type;
		if (typeof type !== 'string') continue;
		const c = (calls[type] ??= { n: 0, last: '' });
		c.n++;
		c.last = e.id;
	}

	// general-purpose was handed `defaultTools` — the main agent's whole set — so
	// its count is the wire's tool count, which is the honest number rather than
	// a guess. Everything else we declared ourselves.
	const mainToolCount = lastTools(bus).length;

	return roster.map((name) => {
		const ours = OURS.has(name);
		const declared = OUR_TOOL_COUNT.get(name);
		return {
			name,
			description: described.get(name) ?? '',
			origin: ours ? 'ours' : 'harness',
			tools: ours
				? { count: declared ?? 0, known: declared !== undefined }
				: { count: mainToolCount, known: mainToolCount > 0 },
			calls: calls[name] ?? { n: 0, last: '' }
		};
	});
}
