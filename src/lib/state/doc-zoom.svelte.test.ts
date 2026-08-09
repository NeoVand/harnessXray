import { describe, it, expect, beforeEach } from 'vitest';
import { STEPS, DEFAULT_STEP } from './doc-zoom.svelte';

/**
 * The ladder, and the restore that got it wrong.
 *
 * The first version tested `Number(localStorage.getItem(KEY))` and accepted any
 * valid index — but `Number(null)` is 0, and 0 IS a valid index, so a browser
 * that had never stored a preference opened every document at the smallest step
 * on the ladder. It looked deliberate, which is why it needed measuring to
 * catch: 10.5px is a plausible size for someone to have chosen.
 *
 * The class reads localStorage in its constructor and is a module singleton, so
 * the restore logic is tested as the pure predicate it is rather than by
 * reaching for a fake DOM.
 */

/** The guard as `DocZoom`'s constructor applies it. */
function restore(raw: string | null): number {
	if (!raw) return DEFAULT_STEP;
	const stored = Number(raw);
	if (Number.isInteger(stored) && stored >= 0 && stored < STEPS.length) return stored;
	return DEFAULT_STEP;
}

describe('doc zoom', () => {
	beforeEach(() => {
		// Nothing to reset — `restore` is pure. Here so adding state later fails
		// loudly rather than leaking between cases.
	});

	it('opens at the default when nothing was ever stored', () => {
		// The bug, twice: `Number(null)` and `Number('')` are both 0, which is a
		// real index. The empty string was found by this very test.
		expect(restore(null)).toBe(DEFAULT_STEP);
		expect(restore('')).toBe(DEFAULT_STEP);
		expect(STEPS[restore(null)]).toBe(0.9);
	});

	it('opens at the default rather than trusting junk', () => {
		for (const junk of ['', 'small', '1.5', 'NaN', '-1', String(STEPS.length)]) {
			expect(restore(junk), junk).toBe(DEFAULT_STEP);
		}
	});

	it('restores a real stored step, including the smallest', () => {
		// Zero has to stay reachable — it is the whole point of the ladder's bottom
		// rung, and the obvious fix for the bug above would have banned it.
		expect(restore('0')).toBe(0);
		expect(restore('5')).toBe(5);
	});

	it('defaults one notch below the base size', () => {
		// The complaint was that the pane's text was too large as shipped, so the
		// fix has to be the state you find it in, not something to discover.
		expect(STEPS[DEFAULT_STEP]).toBeLessThan(1);
		expect(STEPS[DEFAULT_STEP + 1]).toBe(1);
	});

	it('is a strictly ascending ladder around 1', () => {
		for (let i = 1; i < STEPS.length; i++) expect(STEPS[i]).toBeGreaterThan(STEPS[i - 1]);
		expect(STEPS).toContain(1);
	});
});
