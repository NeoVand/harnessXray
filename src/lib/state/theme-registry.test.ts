import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEMES, normalizeTheme } from './theme.svelte';

/**
 * The theme registry exists twice, and it has to.
 *
 * `THEMES` is the app's list, but the boot script in app.html has to stamp the
 * attribute BEFORE any module loads — otherwise the page paints one theme and
 * snaps to another — so it cannot import this file and carries its own copy of
 * the ids, the dark flags and the meta colours. Both files say "kept in sync
 * with the other" in a comment, which is a promise rather than a mechanism.
 *
 * This is the mechanism. Adding a fifth theme meant touching four files, and
 * the boot script is the one with no type checking, no lint rule and no visible
 * symptom when it is wrong except the flash you only notice on a cold load.
 *
 * Reading the real app.html rather than a fixture is the point — a fixture
 * would drift in exactly the way this test exists to prevent.
 */

const html = readFileSync(new URL('../../app.html', import.meta.url), 'utf8');

/** Pull one object literal out of the boot script by its variable name. */
function bootObject(name: string): Record<string, string> {
	const m = html.match(new RegExp(`var ${name} = \\{([^}]*)\\}`));
	if (!m) throw new Error(`boot script has no \`var ${name}\``);
	const out: Record<string, string> = {};
	for (const entry of m[1].split(',')) {
		const pair = entry.match(/(\w+)\s*:\s*'?([^'\s]+)'?/);
		if (pair) out[pair[1]] = pair[2];
	}
	return out;
}

describe('theme registry', () => {
	it('lists every theme in the boot script, with the same meta colour', () => {
		const meta = bootObject('meta');
		expect(Object.keys(meta).sort()).toEqual(THEMES.map((t) => t.id).sort());
		for (const t of THEMES) expect(meta[t.id], t.id).toBe(t.meta);
	});

	it('agrees with the boot script about which themes are dark', () => {
		// The boot script lists only the dark ones; anything absent is light.
		const dark = bootObject('dark');
		for (const t of THEMES) expect(Boolean(dark[t.id]), t.id).toBe(t.dark);
	});

	it('keeps the darks and the lights contiguous in the cycle', () => {
		// The cycle is a sequence you feel your way along, so exactly one step in
		// the loop may cross the dark/light divide — two would mean a theme was
		// inserted into the wrong half of the list.
		const flips = THEMES.filter((t, i) => t.dark !== THEMES[(i + 1) % THEMES.length].dark);
		expect(flips).toHaveLength(2); // dark→light once, and light→dark on the wrap
	});

	it('lands every id it has ever written on a theme that still exists', () => {
		const ids = new Set(THEMES.map((t) => t.id));
		for (const legacy of [
			'dark',
			'light',
			'cocoa',
			'ocean',
			'forest',
			'meadow',
			'nonsense',
			null
		]) {
			expect(ids.has(normalizeTheme(legacy)), String(legacy)).toBe(true);
		}
	});

	it('maps every legacy id the boot script maps, to the same place', () => {
		const legacy = bootObject('legacy');
		for (const [from, to] of Object.entries(legacy)) {
			expect(normalizeTheme(from), from).toBe(to);
		}
	});
});
