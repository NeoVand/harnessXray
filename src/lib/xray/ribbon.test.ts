import { describe, it, expect } from 'vitest';
import { fold, rankOf, type Marked } from './ribbon';

/**
 * The ribbon's fold, and the two bugs it exists to prevent.
 *
 * The cockpit's first event strip drew one flex child per event with a 1px gap.
 * At 196 events in a 309px strip the gaps alone took 196px, so each mark came
 * out 0.58px wide and a longer run looked like LESS information than a short
 * one — measured in the running app, not spotted in review. Folding to
 * fixed-width columns is the fix, and folding is where the arithmetic lives.
 *
 * Two failure modes, both invisible by eye on a barcode: losing the tail of the
 * run, and letting a rare-but-loud event get outvoted by bookkeeping.
 */

const ev = (i: number, kind = 'state'): Marked => ({ id: `e${i}`, displayKind: kind });
const run = (n: number, kind = 'state') => Array.from({ length: n }, (_, i) => ev(i, kind));

describe('ribbon fold', () => {
	it('covers every event exactly once, for any run and any width', () => {
		for (const len of [1, 2, 7, 99, 100, 101, 500, 3501]) {
			for (const slots of [1, 3, 50, 102, 307, 1000]) {
				const cols = fold(run(len), slots);
				const covered = cols.reduce((n, c) => n + c.n, 0);
				expect(covered, `${len} events into ${slots} slots`).toBe(len);
			}
		}
	});

	it('never emits more columns than slots, or than events', () => {
		expect(fold(run(3501), 102)).toHaveLength(102);
		expect(fold(run(7), 300)).toHaveLength(7);
		expect(fold(run(1), 300)).toHaveLength(1);
	});

	it('keeps the loudest event in each bucket, not the most common', () => {
		// Nineteen pieces of bookkeeping and one interrupt: the interrupt is the
		// whole reason anyone looks at the strip, and it is outnumbered 19:1.
		const rows = [...run(19, 'state')];
		rows.splice(10, 0, { id: 'gate', displayKind: 'interrupt' });
		const [only] = fold(rows, 1);
		expect(only.kind).toBe('interrupt');
		expect(only.id).toBe('gate');
		expect(only.n).toBe(20);
	});

	it('ranks by significance, with unknown kinds last', () => {
		expect(rankOf('error')).toBeLessThan(rankOf('interrupt'));
		expect(rankOf('interrupt')).toBeLessThan(rankOf('tool'));
		expect(rankOf('tool')).toBeLessThan(rankOf('state'));
		expect(rankOf('something-new')).toBeGreaterThan(rankOf('state'));
	});

	it('reports the selection wherever it lands in a bucket', () => {
		const cols = fold(run(100), 10, 'e57');
		expect(cols.filter((c) => c.hasSelected)).toHaveLength(1);
		// 100 events into 10 columns: e57 belongs to the sixth.
		expect(cols.findIndex((c) => c.hasSelected)).toBe(5);
	});

	it('keeps events in order', () => {
		const cols = fold(run(60), 6);
		const ids = cols.map((c) => Number(c.id.slice(1)));
		expect(ids).toEqual([...ids].sort((a, b) => a - b));
	});

	it('is empty for an empty run or a zero-width strip', () => {
		expect(fold([], 100)).toEqual([]);
		expect(fold(run(10), 0)).toEqual([]);
		expect(fold(run(10), -5)).toEqual([]);
	});
});
