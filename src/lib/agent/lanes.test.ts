import { describe, it, expect } from 'vitest';
import { emptyLanes, laneName, sealLanes, type Dispatch } from './lanes';

/**
 * Naming a subagent lane, pinned — because the pairing is positional and
 * positional pairings fail quietly.
 *
 * Observed live: continue a thread after a page reload, dispatch
 * `report-writer`, and every row in its lane — timeline, file log, plan tab —
 * came back labelled `paper-reader`, the first subagent the thread had ever
 * used. Right data, confident wrong name.
 */

const task = (id: string, type?: string): Dispatch => ({
	id,
	name: 'task',
	args: type === undefined ? {} : { subagent_type: type }
});
const other = (id: string): Dispatch => ({ id, name: 'read_file', args: { file_path: '/a' } });

describe('laneName', () => {
	it('pairs namespaces with dispatches in order', () => {
		const lanes = emptyLanes();
		const calls = [task('a', 'paper-reader'), task('b', 'report-writer')];
		expect(laneName(lanes, 'tools:1', calls)).toBe('paper-reader');
		expect(laneName(lanes, 'tools:2', calls)).toBe('report-writer');
	});

	it('remembers a namespace it has already named', () => {
		const lanes = emptyLanes();
		const calls = [task('a', 'paper-reader'), task('b', 'report-writer')];
		expect(laneName(lanes, 'tools:1', calls)).toBe('paper-reader');
		// Every subsequent event from the same lane must get the same answer, not
		// consume the next dispatch.
		expect(laneName(lanes, 'tools:1', calls)).toBe('paper-reader');
		expect(laneName(lanes, 'tools:2', calls)).toBe('report-writer');
	});

	it('ignores tool calls that are not dispatches', () => {
		const lanes = emptyLanes();
		expect(laneName(lanes, 'tools:1', [other('x'), task('a', 'critic')])).toBe('critic');
	});

	it('waits rather than claiming a dispatch whose arguments have not arrived', () => {
		// Tool arguments stream in after the call is announced. Claiming a blank
		// would spend the pairing and shift every later lane by one.
		const lanes = emptyLanes();
		const pending = [task('a')];
		expect(laneName(lanes, 'tools:1', pending)).toBeUndefined();
		// Same namespace, once the arguments land.
		expect(laneName(lanes, 'tools:1', [task('a', 'image-smith')])).toBe('image-smith');
	});

	it('returns undefined rather than a wrong name when nothing is left', () => {
		const lanes = emptyLanes();
		const calls = [task('a', 'critic')];
		expect(laneName(lanes, 'tools:1', calls)).toBe('critic');
		expect(laneName(lanes, 'tools:2', calls)).toBeUndefined();
	});
});

describe('sealLanes', () => {
	it('writes off dispatches restored with a transcript', () => {
		// The live bug. A reload leaves the pairing empty and the transcript full:
		// four paper-readers, a report-writer and a critic from runs nobody
		// watched. The next namespace belongs to the dispatch made AFTER the
		// reload, and must not be handed the first one from last time.
		const lanes = emptyLanes();
		const restored = [
			task('a', 'paper-reader'),
			task('b', 'paper-reader'),
			task('c', 'report-writer'),
			task('d', 'critic')
		];
		sealLanes(lanes, restored);

		const afterReload = [...restored, task('e', 'report-writer')];
		expect(laneName(lanes, 'tools:new', afterReload)).toBe('report-writer');
	});

	it('drops pairings from the thread being navigated away from', () => {
		const lanes = emptyLanes();
		const before = [task('a', 'critic')];
		expect(laneName(lanes, 'tools:1', before)).toBe('critic');

		// Switching threads: same namespace shape, entirely different run.
		sealLanes(lanes, []);
		expect(laneName(lanes, 'tools:1', [task('z', 'image-smith')])).toBe('image-smith');
	});

	it('leaves a fresh thread able to pair from the first dispatch', () => {
		const lanes = emptyLanes();
		sealLanes(lanes, []);
		expect(laneName(lanes, 'tools:1', [task('a', 'paper-reader')])).toBe('paper-reader');
	});
});
