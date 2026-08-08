import type { EventBus } from './bus.svelte';
import type { Todo } from './events';

/**
 * The plan, as a history rather than a snapshot.
 *
 * The panel used to render `session.todos` — the current list, and nothing
 * else. That is the one view of a planning channel that hides everything
 * interesting about it, because `todos` is **last-write-wins**: every
 * `write_todos` call replaces the whole list, so an item can be dropped, or
 * silently reworded, or quietly demoted from in_progress back to pending, and
 * the snapshot shows none of it. What you get instead is a tidy list that has
 * always been tidy, which is exactly the impression a harness demo should not
 * leave.
 *
 * So: every `write_todos` is a revision, diffed against the one it replaced.
 * Items that vanish while still unfinished are called out, because that is the
 * failure the channel's semantics make easy and nothing else in the app would
 * catch.
 *
 * Two further facts fall out of doing it per namespace. `todos` is in
 * deepagents' EXCLUDED_STATE_KEYS, so a subagent does NOT inherit the parent's
 * plan — it gets an empty channel of its own, plans into it, and takes that
 * plan to the grave when its window closes. And the harness hands `write_todos`
 * to every subagent whether its job needs planning or not, so those private
 * plans really do get written. One track per namespace shows both.
 */

export type PlanStatus = Todo['status'];

export interface Revision {
	/** The `todo_update` event that wrote it — the timeline row to jump to. */
	id: string;
	/** 1-based, within this track. */
	n: number;
	t: number;
	items: Todo[];
	added: string[];
	/** Gone from the list while still unfinished. Last-write-wins, made visible. */
	dropped: string[];
	/** Gone after completing — ordinary tidying, worth separating from the above. */
	retired: string[];
	changed: { content: string; from: PlanStatus; to: PlanStatus }[];
}

export interface Track {
	/** `main`, or the subagent's name. */
	agent: string;
	/** The stream namespace the writes came from. */
	scope: string;
	revisions: Revision[];
	/** Everything ever dropped unfinished, in the order it happened. */
	dropped: {
		content: string;
		at: number;
		status: PlanStatus;
		/**
		 * It came back in a later write.
		 *
		 * Which is not the same event as losing it, and reads very differently: a
		 * plan that drops an item and reinstates it is a plan being rewritten,
		 * while one that drops an item and never mentions it again is work that
		 * quietly stopped existing. Both are worth seeing; conflating them is not.
		 */
		returned: boolean;
	}[];
}

const nameOf = (scope: string, lane?: string) =>
	scope === 'main' ? 'main' : (lane ?? scope.slice(4).split(':')[0]);

/** One track per namespace that ever wrote a plan, in first-write order. */
export function plans(bus: EventBus): Track[] {
	const byScope = new Map<string, Track>();

	for (const e of bus.events) {
		if (e.kind !== 'todo_update') continue;
		let track = byScope.get(e.scope);
		if (!track) {
			track = { agent: nameOf(e.scope, e.lane), scope: e.scope, revisions: [], dropped: [] };
			byScope.set(e.scope, track);
		}
		// A lane label can arrive after the first write in that namespace, since
		// the name comes from the `task` call that dispatched it.
		if (track.agent !== 'main' && e.lane) track.agent = e.lane;

		const prev = track.revisions.at(-1)?.items ?? [];
		const before = new Map(prev.map((t) => [t.content, t.status]));
		const now = new Set(e.todos.map((t) => t.content));

		const gone = prev.filter((t) => !now.has(t.content));
		const rev: Revision = {
			id: e.id,
			n: track.revisions.length + 1,
			t: e.t,
			items: e.todos,
			added: e.todos.filter((t) => !before.has(t.content)).map((t) => t.content),
			dropped: gone.filter((t) => t.status !== 'completed').map((t) => t.content),
			retired: gone.filter((t) => t.status === 'completed').map((t) => t.content),
			changed: e.todos
				.filter((t) => before.has(t.content) && before.get(t.content) !== t.status)
				.map((t) => ({ content: t.content, from: before.get(t.content)!, to: t.status }))
		};
		track.revisions.push(rev);
		for (const t of gone) {
			if (t.status !== 'completed')
				track.dropped.push({ content: t.content, at: rev.n, status: t.status, returned: false });
		}
	}

	// Marked at the end, because "did it come back" is a question about the
	// revisions that follow the one that lost it.
	for (const track of byScope.values()) {
		for (const d of track.dropped) {
			d.returned = track.revisions
				.slice(d.at)
				.some((r) => r.items.some((t) => t.content === d.content));
		}
	}

	return [...byScope.values()];
}

export interface Caused {
	/** Revision numbers the window spans. */
	from: number;
	to: number;
	/** Still the open item — the window ends at the last event, not at a revision. */
	open: boolean;
	ms: number;
	/** Tool calls made in this track's namespace while the item was live. */
	tools: { name: string; n: number; last: string }[];
	/** Paths written in the same window. */
	files: string[];
	/** Subagents dispatched under this item. */
	delegated: string[];
	/** Model tokens billed in the window — input and output, everything included. */
	tokens: number;
	/** The first event inside the window, for jumping the timeline. */
	at: string;
}

/**
 * What an item actually caused.
 *
 * The window is between the revision that set the item working and the revision
 * that marked it done — which is as precise as this can honestly be, since the
 * only times a plan channel publishes are the moments it is written. An agent
 * that never sets `in_progress` (many do not) still gets a window: the revision
 * immediately before the completion, which is the step the completion is
 * reporting on.
 *
 * Tools and files are filtered to the track's own namespace, because LangGraph
 * genuinely knows which lane they happened in. Tokens are not: the model is
 * built once with scope `main`, so every request on the wire is main-scoped
 * however deep it originated. Everything billed inside the window is counted,
 * which for a parent item means the work it delegated is included — that is the
 * honest reading of "what did this item cost", and `delegated` names who spent it.
 */
export function caused(bus: EventBus, track: Track, content: string): Caused | null {
	const revs = track.revisions;
	const startedAt = revs.findIndex((r) =>
		r.changed.some((c) => c.content === content && c.to === 'in_progress')
	);
	const doneAt = revs.findIndex((r) =>
		r.changed.some((c) => c.content === content && c.to === 'completed')
	);
	// Appeared already completed — a plan written after the fact.
	const bornDone = revs.findIndex(
		(r) =>
			r.added.includes(content) &&
			r.items.find((t) => t.content === content)?.status === 'completed'
	);

	let start = startedAt;
	if (start < 0) {
		if (doneAt > 0) start = doneAt - 1;
		else if (bornDone > 0) start = bornDone - 1;
		else return null;
	}
	const end = doneAt >= 0 ? doneAt : bornDone >= 0 ? bornDone : -1;
	if (end >= 0 && end < start) return null;

	const openFrom = revs[start].t;
	const openTo = end >= 0 ? revs[end].t : (bus.events.at(-1)?.t ?? openFrom);

	const tools: Record<string, { n: number; last: string }> = {};
	const files: string[] = [];
	const delegated: string[] = [];
	let tokens = 0;
	let at = end >= 0 ? revs[end].id : revs[start].id;
	let first = true;

	for (const e of bus.events) {
		if (e.t <= openFrom || e.t > openTo) continue;
		if (e.kind === 'http_response' && e.rawUsage) {
			const u = e.rawUsage as { input_tokens?: number; output_tokens?: number };
			tokens += (u.input_tokens ?? 0) + (u.output_tokens ?? 0);
			continue;
		}
		if (e.scope !== track.scope) continue;
		if (first) {
			at = e.id;
			first = false;
		}
		if (e.kind === 'tool_start') {
			const c = (tools[e.name] ??= { n: 0, last: '' });
			c.n++;
			c.last = e.id;
			if (e.name === 'task') {
				const type = (e.args as { subagent_type?: unknown } | null)?.subagent_type;
				if (typeof type === 'string' && !delegated.includes(type)) delegated.push(type);
			}
		}
		if (e.kind === 'fs_write' && !files.includes(e.path)) files.push(e.path);
	}

	return {
		from: revs[start].n,
		to: end >= 0 ? revs[end].n : revs.length,
		open: end < 0,
		ms: openTo - openFrom,
		tools: Object.entries(tools)
			.map(([name, c]) => ({ name, ...c }))
			.sort((a, b) => b.n - a.n),
		files,
		delegated,
		tokens,
		at
	};
}
