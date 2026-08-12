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

export type ThemeId = 'midnight' | 'aurora' | 'rainy' | 'cloudy' | 'sunny';

export interface ThemeSpec {
	id: ThemeId;
	label: string;
	/** The page background, for `<meta name="theme-color">`. */
	meta: string;
	dark: boolean;
}

/**
 * Five themes, three dark and two light. Cycle order keeps the darks together
 * and the lights together — a cycle is a sequence you feel your way along, so
 * neighbours should be neighbours, and only one click in the loop crosses the
 * dark/light divide.
 *
 * Aurora sits second rather than first. It is the loudest thing here by a wide
 * margin, and the theme you land on with no stored preference should be the
 * quiet one — but it should also be one click away, not four.
 */
export const THEMES: ThemeSpec[] = [
	{ id: 'midnight', label: 'Midnight', meta: '#131316', dark: true },
	{ id: 'aurora', label: 'Aurora', meta: '#0f1223', dark: true },
	{ id: 'rainy', label: 'Rainy', meta: '#121820', dark: true },
	{ id: 'cloudy', label: 'Cloudy', meta: '#eef1f3', dark: false },
	{ id: 'sunny', label: 'Sunny', meta: '#f5f1e8', dark: false }
];

const KEY = 'hx:theme';
const browser = typeof window !== 'undefined';

export function normalizeTheme(value: string | null | undefined): ThemeId {
	// Every id this app ever wrote still lands somewhere sensible: `dark`/`light`
	// are the old two-state toggle, the rest are retired themes mapped to their
	// nearest surviving temperature. Kept in sync with the boot script in
	// app.html, which must make the same call before any module loads.
	if (value === 'dark' || value === 'cocoa') return 'midnight';
	if (value === 'ocean' || value === 'forest') return 'rainy';
	if (value === 'light' || value === 'meadow') return 'cloudy';
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
