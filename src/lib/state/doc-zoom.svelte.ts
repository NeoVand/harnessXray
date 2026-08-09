/**
 * How large a document reads in the preview pane.
 *
 * The preview is a third of a third of the window and it was rendering agent
 * prose at the same 14px the chat uses — right for a conversation you read one
 * turn at a time, too big for a document you are trying to take in at a glance.
 * The fix wanted is browser zoom, scoped: smaller text, more of it, without
 * touching the instruments around it.
 *
 * One number does all of it. Everything inside `.md` is sized in `em` — headings,
 * code, tables, captions, the space between paragraphs — and only the root is
 * absolute, so scaling that root scales the whole document in proportion rather
 * than shrinking the text and leaving the margins behind. Figures are the
 * deliberate exception: `max-width: 100%` is not a font size, so a picture keeps
 * the pane's full width while the prose around it tightens. Which is what
 * anyone actually wants — the complaint was about text.
 *
 * Not a keyboard override. `Cmd -` is browser zoom, and browser zoom is an
 * accessibility control that some people rely on across every site they use;
 * quietly stealing it inside one pane of one app is not a trade this app gets to
 * make. Two buttons, and the current size on hover.
 */

const KEY = 'hx:doc-zoom';
const browser = typeof window !== 'undefined';

/**
 * The ladder, as multipliers of the 14px base.
 *
 * Explicit steps rather than a factor per press, so every rung lands on a size
 * someone chose: 10.5, 11.5, 12.6, 14, 15.7, 17.5px. The default is one notch
 * DOWN from the base — the pane's text was too large as shipped, and the fix
 * should be the state you find it in, not something to discover.
 */
export const STEPS = [0.75, 0.82, 0.9, 1, 1.12, 1.25];
export const DEFAULT_STEP = 2;

/** The base `.md` size, in px, for reporting the effective size. */
const BASE_PX = 14;

class DocZoom {
	step = $state(DEFAULT_STEP);

	constructor() {
		if (!browser) return;
		const raw = localStorage.getItem(KEY);
		// `Number(null)` and `Number('')` are both 0, and 0 is a perfectly valid
		// index — so testing the converted value alone made a fresh install (and a
		// cleared entry) open at the SMALLEST step rather than the default. Whether
		// anything was stored has to be settled before its value means anything.
		// `!raw` is right and `raw === null` was not: '0' is truthy as a string, so
		// the bottom rung stays reachable.
		if (!raw) return;
		const stored = Number(raw);
		// A stored index from a shorter ladder must not read off the end.
		if (Number.isInteger(stored) && stored >= 0 && stored < STEPS.length) this.step = stored;
	}

	get scale() {
		return STEPS[this.step];
	}

	/** The effective size, rounded, for the tooltip. Nobody wants 12.6px. */
	get px() {
		return Math.round(BASE_PX * this.scale);
	}

	get canShrink() {
		return this.step > 0;
	}
	get canGrow() {
		return this.step < STEPS.length - 1;
	}

	#set(next: number) {
		this.step = next;
		if (browser) localStorage.setItem(KEY, String(next));
	}

	shrink() {
		if (this.canShrink) this.#set(this.step - 1);
	}
	grow() {
		if (this.canGrow) this.#set(this.step + 1);
	}
	reset() {
		this.#set(DEFAULT_STEP);
	}
}

export const docZoom = new DocZoom();
