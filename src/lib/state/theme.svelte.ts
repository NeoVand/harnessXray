/**
 * The colour theme.
 *
 * Modelled on voicebook's: the theme is an attribute on `<html>`, a boot script
 * in app.html restores it before first paint, and the header button *cycles* —
 * one click, one theme, wrapping around — rather than opening a picker. A
 * picker is the right control for ten choices you compare; a cycle is the right
 * one for a preference you nudge until it feels right.
 *
 * The tokens are ours, not voicebook's — the two apps share no colour
 * vocabulary — so what is borrowed here is the mechanism and the interaction,
 * not the palettes.
 *
 * `dark` is still a *class* as well as an attribute. Tailwind's `dark:`
 * variants and a handful of `:global(.dark)` rules in components already depend
 * on it, and keeping both in step costs one line here instead of a rewrite of
 * every consumer.
 */

export type ThemeId =
	'cloudy' | 'sunny' | 'meadow' | 'midnight' | 'rainy' | 'forest' | 'cocoa' | 'ocean';

export interface ThemeSpec {
	id: ThemeId;
	label: string;
	/** The page background, for `<meta name="theme-color">`. */
	meta: string;
	dark: boolean;
}

/**
 * Cycle order: light first, then dark, each group running warm to cool. A
 * cycle is a sequence you feel your way along, so neighbours should be
 * neighbours — jumping between a paper white and a near-black on every click
 * makes the control feel broken.
 */
export const THEMES: ThemeSpec[] = [
	{ id: 'midnight', label: 'Midnight', meta: '#131316', dark: true },
	{ id: 'rainy', label: 'Rainy', meta: '#121820', dark: true },
	{ id: 'ocean', label: 'Ocean', meta: '#0d1620', dark: true },
	{ id: 'forest', label: 'Forest', meta: '#101711', dark: true },
	{ id: 'cocoa', label: 'Cocoa', meta: '#1a1310', dark: true },
	{ id: 'cloudy', label: 'Cloudy', meta: '#eef1f3', dark: false },
	{ id: 'sunny', label: 'Sunny', meta: '#f5f1e8', dark: false },
	{ id: 'meadow', label: 'Meadow', meta: '#edf2ea', dark: false }
];

const KEY = 'hx:theme';
const browser = typeof window !== 'undefined';

export function normalizeTheme(value: string | null | undefined): ThemeId {
	// `dark`/`light` are what the old two-state toggle wrote. Map them rather
	// than dropping anyone who used the app before this existed.
	if (value === 'dark') return 'midnight';
	if (value === 'light') return 'cloudy';
	return THEMES.some((t) => t.id === value) ? (value as ThemeId) : 'midnight';
}

class ThemeState {
	/** The boot script stamped the attribute before hydration; trust it. */
	current = $state<ThemeId>(
		normalizeTheme(browser ? document.documentElement.dataset.theme : undefined)
	);

	get spec(): ThemeSpec {
		return THEMES.find((t) => t.id === this.current) ?? THEMES[0];
	}

	/** Where one more click lands — named in the tooltip, so the cycle is not a guess. */
	get next(): ThemeSpec {
		const i = THEMES.findIndex((t) => t.id === this.current);
		return THEMES[(i + 1) % THEMES.length];
	}

	set(id: ThemeId) {
		this.current = id;
		if (!browser) return;
		const spec = this.spec;
		const root = document.documentElement;
		root.dataset.theme = id;
		root.classList.toggle('dark', spec.dark);
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', spec.meta);
		try {
			localStorage.setItem(KEY, id);
		} catch {
			/* private mode; the choice lasts this session */
		}
	}

	cycle() {
		this.set(this.next.id);
	}
}

export const theme = new ThemeState();
