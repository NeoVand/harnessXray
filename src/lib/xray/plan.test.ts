import { describe, it, expect } from 'vitest';
import { plans, caused } from './plan';
import type { EventBus } from './bus.svelte';
import type { Scope, Todo, XrayEvent } from './events';

/**
 * The plan's history, pinned.
 *
 * The cases that matter are all about what a SNAPSHOT cannot show: an item
 * dropped without being finished, a plan rewritten rather than followed, and a
 * subagent's private list which the parent never sees and which used to
 * overwrite the parent's on screen.
 */

let seq = 0;
function ev(e: Partial<XrayEvent> & { kind: string }): XrayEvent {
	seq++;
	return {
		id: `e${seq}`,
		seq,
		t: seq * 1000,
		displayKind: 'state',
		scope: 'main',
		branchId: 'b',
		label: '',
		...e
	} as XrayEvent;
}

/** A bus stub: `plans` and `caused` only ever read `events`. */
function busOf(events: XrayEvent[]): EventBus {
	return { events } as unknown as EventBus;
}

const todo = (content: string, status: Todo['status'] = 'pending'): Todo => ({ content, status });

function write(todos: Todo[], scope: Scope = 'main', lane?: string) {
	return ev({
		kind: 'todo_update',
		scope,
		...(lane ? { lane } : {}),
		todos,
		added: [],
		statusChanged: []
	});
}

describe('plans', () => {
	it('keeps every write as a revision, diffed against the one it replaced', () => {
		seq = 0;
		const [track] = plans(
			busOf([
				write([todo('read the paper'), todo('draft it')]),
				write([todo('read the paper', 'in_progress'), todo('draft it')]),
				write([todo('read the paper', 'completed'), todo('draft it'), todo('cite it')])
			])
		);

		expect(track.revisions).toHaveLength(3);
		expect(track.revisions[0].added).toEqual(['read the paper', 'draft it']);
		expect(track.revisions[1].changed).toEqual([
			{ content: 'read the paper', from: 'pending', to: 'in_progress' }
		]);
		expect(track.revisions[2].added).toEqual(['cite it']);
		expect(track.revisions[2].changed).toEqual([
			{ content: 'read the paper', from: 'in_progress', to: 'completed' }
		]);
	});

	it('catches an item deleted while still unfinished', () => {
		// The failure `todos` semantics make easy: a partial write_todos silently
		// removes whatever it omits, and nothing anywhere raises a word about it.
		seq = 0;
		const [track] = plans(
			busOf([
				write([todo('read the paper'), todo('check the citations')]),
				write([todo('read the paper', 'completed')])
			])
		);

		expect(track.revisions[1].dropped).toEqual(['check the citations']);
		expect(track.dropped).toEqual([
			{ content: 'check the citations', at: 2, status: 'pending', returned: false }
		]);
	});

	it('separates tidying a finished item from dropping an unfinished one', () => {
		seq = 0;
		const [track] = plans(
			busOf([write([todo('a', 'completed'), todo('b')]), write([todo('b', 'in_progress')])])
		);
		expect(track.revisions[1].retired).toEqual(['a']);
		expect(track.revisions[1].dropped).toEqual([]);
		expect(track.dropped).toEqual([]);
	});

	it('repairs a legacy log where every write was labelled main', () => {
		// Every run recorded before plan updates carried their namespace — the
		// bundled demo included — has the subagent's writes folded into the
		// parent's track. The `write_todos` CALL was always scoped correctly, and
		// the channel only ever changes because of one, so the nearest preceding
		// call says who really wrote it.
		seq = 0;
		const call = (scope: Scope, lane?: string) =>
			ev({
				kind: 'tool_start',
				name: 'write_todos',
				args: {},
				scope,
				...(lane ? { lane } : {}),
				displayKind: 'tool'
			});
		const tracks = plans(
			busOf([
				call('main'),
				write([todo('review the field')]),
				call('sub:task:1', 'report-writer'),
				// Mislabelled `main`, exactly as the old emitter wrote it.
				write([todo('inspect notes'), todo('assemble')]),
				call('main'),
				write([todo('review the field', 'in_progress')])
			])
		);

		expect(tracks.map((t) => t.agent)).toEqual(['main', 'report-writer']);
		expect(tracks[0].revisions).toHaveLength(2);
		expect(tracks[1].revisions).toHaveLength(1);
		// And the parent's plan never looked like it lost its items.
		expect(tracks[0].dropped).toEqual([]);
	});

	it('gives each namespace its own plan', () => {
		// `todos` is in EXCLUDED_STATE_KEYS, so a subagent plans into an empty
		// channel of its own. Folding the two together is what made the panel show
		// a paper-reader's two steps as though they had replaced the parent's plan.
		seq = 0;
		const tracks = plans(
			busOf([
				write([todo('review the field')]),
				write([todo('fetch'), todo('summarise')], 'sub:task:1', 'paper-reader'),
				write([todo('review the field', 'in_progress')])
			])
		);

		expect(tracks).toHaveLength(2);
		expect(tracks[0].agent).toBe('main');
		expect(tracks[0].revisions).toHaveLength(2);
		expect(tracks[1].agent).toBe('paper-reader');
		expect(tracks[1].revisions[0].items.map((t) => t.content)).toEqual(['fetch', 'summarise']);
		// The parent's plan was never touched by the subagent's write.
		expect(tracks[0].revisions[1].items).toHaveLength(1);
	});
});

describe('caused', () => {
	it('attributes the work between starting an item and finishing it', () => {
		seq = 0;
		const events = [
			write([todo('read the paper'), todo('draft it')]),
			write([todo('read the paper', 'in_progress'), todo('draft it')]),
			ev({ kind: 'tool_start', name: 'fetch_paper', args: {}, displayKind: 'tool' }),
			ev({ kind: 'tool_start', name: 'fetch_paper', args: {}, displayKind: 'tool' }),
			ev({ kind: 'fs_write', op: 'write', path: '/notes/x.md', bytes: 10, displayKind: 'fs' }),
			ev({
				kind: 'http_response',
				status: 200,
				rawUsage: { input_tokens: 900, output_tokens: 100 },
				displayKind: 'model'
			}),
			write([todo('read the paper', 'completed'), todo('draft it')]),
			// After the item closed — must not be counted against it.
			ev({ kind: 'tool_start', name: 'write_file', args: {}, displayKind: 'tool' })
		];
		const bus = busOf(events);
		const [track] = plans(bus);

		const w = caused(bus, track, 'read the paper');
		expect(w).not.toBeNull();
		expect(w!.from).toBe(2);
		expect(w!.to).toBe(3);
		expect(w!.open).toBe(false);
		expect(w!.tools).toEqual([{ name: 'fetch_paper', n: 2, last: 'e4' }]);
		expect(w!.files).toEqual(['/notes/x.md']);
		expect(w!.tokens).toBe(1000);
	});

	it('uses the preceding revision when the agent never says in_progress', () => {
		seq = 0;
		const events = [
			write([todo('read the paper')]),
			ev({ kind: 'tool_start', name: 'fetch_paper', args: {}, displayKind: 'tool' }),
			write([todo('read the paper', 'completed')])
		];
		const bus = busOf(events);
		const [track] = plans(bus);

		const w = caused(bus, track, 'read the paper');
		expect(w!.from).toBe(1);
		expect(w!.to).toBe(2);
		expect(w!.tools.map((t) => t.name)).toEqual(['fetch_paper']);
	});

	it('names the subagents an item delegated to', () => {
		seq = 0;
		const events = [
			write([todo('read three papers', 'in_progress')]),
			ev({
				kind: 'tool_start',
				name: 'task',
				args: { subagent_type: 'paper-reader' },
				displayKind: 'subagent'
			}),
			write([todo('read three papers', 'completed')])
		];
		const bus = busOf(events);
		const [track] = plans(bus);
		expect(caused(bus, track, 'read three papers')!.delegated).toEqual(['paper-reader']);
	});

	it('returns nothing for an item that never started', () => {
		seq = 0;
		const bus = busOf([write([todo('a', 'in_progress'), todo('never touched')])]);
		const [track] = plans(bus);
		expect(caused(bus, track, 'never touched')).toBeNull();
	});

	it('ignores another namespace’s tool calls', () => {
		seq = 0;
		const events = [
			write([todo('review', 'in_progress')]),
			ev({ kind: 'tool_start', name: 'grep', args: {}, scope: 'sub:task:1', displayKind: 'tool' }),
			write([todo('review', 'completed')])
		];
		const bus = busOf(events);
		const [track] = plans(bus);
		expect(caused(bus, track, 'review')!.tools).toEqual([]);
	});
});
