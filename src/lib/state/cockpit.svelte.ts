/**
 * Cockpit mode — the Easter egg.
 *
 * The working layout is a good instrument and a bad theatre: three resizable
 * columns, roughly fourteen views competing for them, and a tab strip whose
 * whole job is deciding what to hide. That is the right trade when you are
 * using the app. It is the wrong one when the point is to *watch* an agent —
 * a class, a demo, someone meeting the idea for the first time — because the
 * thing worth seeing is the correspondence between panels, and the correspondence
 * is exactly what tabbing destroys.
 *
 * So the cockpit is a second mode, not a replacement. Everything on screen at
 * once, arranged around the conversation. Nothing here changes the working
 * layout, and nothing here is on the critical path to using the app.
 *
 * It is hidden because it is a delight, and delights are worth finding. Once
 * found, it stays found — `discovered` persists, and the header grows a button.
 * An Easter egg you have to re-earn on every visit is a chore wearing a costume.
 */

const KEY = 'hx:cockpit-found';
const browser = typeof window !== 'undefined';

/** The Konami code, because there is exactly one right answer to "how is this hidden". */
export const KONAMI = [
	'ArrowUp',
	'ArrowUp',
	'ArrowDown',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'ArrowLeft',
	'ArrowRight',
	'b',
	'a'
] as const;

/**
 * The last few keys pressed, newest last, capped at the length of the code.
 *
 * This started as an index that advanced on a match and fell back on a miss,
 * which is the natural way to write it and is wrong. The code opens with two Up
 * presses, so a stray third Up has to leave you *two* keys in, not one — the
 * last two Ups are still a valid prefix. Crediting the failed key as a fresh
 * first key gets that case wrong, and every deeper repeat wrong too; getting it
 * right means a proper prefix-function fallback, which is a lot of machinery for
 * ten keys.
 *
 * A rolling buffer has no failure branch to get wrong. Keep the last ten keys,
 * ask whether they are the code. `↑↑↑↓↓←→←→ba` opens it because the last ten
 * keys of that *are* the code, which is also what a person pressing it would
 * expect. Found by testing the stray-press case against the running app, where
 * it silently did nothing.
 */
export function push(buffer: readonly string[], key: string): string[] {
	// Single characters compare case-insensitively so Caps Lock is not a puzzle;
	// named keys ('ArrowUp') are already canonical and must not be lowercased.
	const k = key.length === 1 ? key.toLowerCase() : key;
	return [...buffer, k].slice(-KONAMI.length);
}

export const isComplete = (buffer: readonly string[]) =>
	buffer.length === KONAMI.length && buffer.every((k, i) => k === KONAMI[i]);

class CockpitState {
	open = $state(false);
	/** Whether this browser has ever found it — persisted, so the button stays. */
	discovered = $state(false);

	#recent: string[] = [];

	constructor() {
		if (!browser) return;
		try {
			this.discovered = localStorage.getItem(KEY) === '1';
		} catch {
			/* private mode; the egg is simply hidden again next visit */
		}
	}

	/**
	 * Feed a keydown to the detector. Returns true if this press opened it.
	 *
	 * Ignores keystrokes aimed at a text field — the composer is a textarea that
	 * sits under the same window listener, and "ba" is two letters someone types
	 * constantly. Without this the egg would fire mid-sentence.
	 */
	feed(e: KeyboardEvent): boolean {
		const el = e.target as HTMLElement | null;
		if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) {
			this.#recent = [];
			return false;
		}
		this.#recent = push(this.#recent, e.key);
		if (!isComplete(this.#recent)) return false;
		this.#recent = [];
		this.reveal();
		return true;
	}

	reveal() {
		this.discovered = true;
		this.open = true;
		if (!browser) return;
		try {
			localStorage.setItem(KEY, '1');
		} catch {
			/* see above */
		}
	}

	close() {
		this.open = false;
	}
	toggle() {
		if (this.open) this.close();
		else this.reveal();
	}
}

export const cockpit = new CockpitState();
