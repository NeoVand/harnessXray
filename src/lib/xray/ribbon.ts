import type { DisplayKind } from './events';

/**
 * Folding a run into a strip of fixed-width columns.
 *
 * Extracted from the cockpit's event ribbon because it is the only part of that
 * component with arithmetic in it, and the arithmetic has two ways to be quietly
 * wrong: dropping the tail of the run, or emitting more columns than fit. Both
 * look like a rendering quirk rather than a bug — the strip is a barcode, and
 * nobody can tell by eye that the last nine events are missing from it.
 */

/**
 * Rarest-and-loudest first.
 *
 * A column shows the highest-ranked kind in its bucket rather than the most
 * common one, and that choice is the whole design. Taking the mode buries
 * exactly what a person scans a run for: one interrupt among twenty pieces of
 * bookkeeping is the thing worth seeing, and it is a minority by construction.
 */
export const RANK: DisplayKind[] = [
	'error',
	'interrupt',
	'user',
	'memory',
	'subagent',
	'fs',
	'tool',
	'model',
	'state'
];

export const rankOf = (k: string): number => {
	const i = RANK.indexOf(k as DisplayKind);
	return i < 0 ? RANK.length : i;
};

export interface Marked {
	id: string;
	displayKind: string;
}

export interface Column {
	/** The event this column stands for — the loudest in its bucket. */
	id: string;
	kind: string;
	/** How many events it swallowed, for the tooltip. */
	n: number;
	hasSelected: boolean;
}

/**
 * Distribute `rows` across at most `slots` columns, in order.
 *
 * Buckets are computed by rounding a float stride rather than by integer
 * division: `floor(len / slots)` leaves a remainder that has to go somewhere,
 * and "somewhere" is usually a forgotten tail. Here every index from 0 to
 * `rows.length` is covered exactly once, for any combination of the two.
 */
export function fold(rows: Marked[], slots: number, selectedId?: string | null): Column[] {
	if (!rows.length || slots < 1) return [];
	const n = Math.min(Math.floor(slots), rows.length);
	const per = rows.length / n;
	const out: Column[] = [];
	for (let i = 0; i < n; i++) {
		const a = Math.floor(i * per);
		// The last column always ends at the end, so no tail can be dropped to
		// floating-point drift on the final multiplication.
		const b = i === n - 1 ? rows.length : Math.max(a + 1, Math.floor((i + 1) * per));
		let best = rows[a];
		let hasSelected = false;
		for (let j = a; j < b; j++) {
			if (rows[j].id === selectedId) hasSelected = true;
			if (rankOf(rows[j].displayKind) < rankOf(best.displayKind)) best = rows[j];
		}
		out.push({ id: best.id, kind: best.displayKind, n: b - a, hasSelected });
	}
	return out;
}
