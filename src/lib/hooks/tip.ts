import type { Attachment } from 'svelte/attachments';

/**
 * Tooltips that arrive before you have finished wondering.
 *
 * The instrument panel is almost entirely 12px glyphs — a filter funnel, a
 * donut, four dashboard tabs — and until now every one of them explained
 * itself with a native `title`. The browser shows those after roughly a
 * second, in the OS's own font, at the pointer rather than at the control.
 * For a row of icons you are meant to *scan*, a one-second delay per icon is
 * the difference between a legend and a guessing game.
 *
 * So: one bubble, reused, appended to `document.body` because every panel here
 * is an `overflow: hidden` scroller that would clip its own chrome's tooltip.
 *
 * Two behaviours are worth naming.
 *
 * The delay is short but not zero — a bubble that fires on every pointer
 * crossing turns a drag across the header into a flicker of five tooltips.
 * Once one has been shown, the next is instant for half a second, which is
 * what makes reading along a row of icons feel like reading a legend rather
 * than querying each glyph in turn.
 *
 * And the text is live. `tip(label)` is an attachment factory, so Svelte
 * re-runs it whenever the label changes; if the bubble is currently showing
 * *this* element, it updates in place. That is what lets a toggle's tooltip
 * name its next state while you are looking at it.
 */

/** Which side of the anchor to prefer. Flipped automatically at the edges. */
export type TipSide = 'top' | 'bottom';

/** Long enough that crossing a control does not fire it. */
const OPEN_DELAY = 110;
/** After one closes, the next is instant — reading a row should feel continuous. */
const WARM_WINDOW = 500;
/** Breathing room between the control and the bubble. */
const GAP = 6;
/** Keep the bubble off the viewport edge. */
const MARGIN = 6;

let bubble: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
/** The element the visible bubble belongs to — null when nothing is shown. */
let anchored: HTMLElement | null = null;
let closedAt = -Infinity;

function element(): HTMLDivElement {
	if (bubble) return bubble;
	bubble = document.createElement('div');
	bubble.className = 'hx-tip';
	// Presentational: every control that carries a tip also carries its own
	// accessible name, so announcing the bubble as well would double-read it.
	bubble.setAttribute('aria-hidden', 'true');
	document.body.appendChild(bubble);
	return bubble;
}

/**
 * Measure, then place. The bubble is laid out at all times (only its opacity
 * changes), so its size can be read before it is positioned — no flash of a
 * bubble in the wrong corner.
 */
function place(anchor: HTMLElement, side: TipSide) {
	const tip = element();
	const a = anchor.getBoundingClientRect();
	const b = tip.getBoundingClientRect();

	const above = a.top - GAP - b.height;
	const below = a.bottom + GAP;
	// Prefer the requested side, flip when it would run off, and if neither
	// fits take whichever has more room rather than clipping.
	let top = side === 'top' ? above : below;
	if (side === 'top' && above < MARGIN) top = below;
	if (side === 'bottom' && below + b.height > window.innerHeight - MARGIN) top = above;
	top = Math.max(MARGIN, Math.min(top, window.innerHeight - b.height - MARGIN));

	const centred = a.left + a.width / 2 - b.width / 2;
	const left = Math.max(MARGIN, Math.min(centred, window.innerWidth - b.width - MARGIN));

	tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function open(anchor: HTMLElement, text: string, side: TipSide) {
	const tip = element();
	tip.textContent = text;
	anchored = anchor;
	place(anchor, side);
	tip.dataset.open = '';
}

function close() {
	clearTimeout(timer);
	timer = undefined;
	if (anchored) closedAt = performance.now();
	anchored = null;
	if (bubble) delete bubble.dataset.open;
}

// One set of global listeners, installed with the first tip on the page.
// Anything that moves the world out from under the bubble dismisses it:
// a scroll would leave it pointing at empty space, and a tab-away would
// leave it painted over whatever comes next.
let listening = false;
function listen() {
	if (listening) return;
	listening = true;
	addEventListener('scroll', close, { capture: true, passive: true });
	addEventListener('blur', close);
	addEventListener('resize', close, { passive: true });
	addEventListener('keydown', (e) => {
		if (e.key === 'Escape') close();
	});
	document.addEventListener('visibilitychange', close);
}

/**
 * Attach a tooltip. `{@attach tip('What this does')}`.
 *
 * Falsy text attaches nothing, so a conditional label needs no `{#if}`.
 */
export function tip(text: string | false | null | undefined, side: TipSide = 'bottom') {
	const attachment: Attachment<HTMLElement> = (anchor) => {
		if (!text) return;
		listen();

		// Live text: if this element's bubble is already up, re-run means the
		// label changed under it. Re-place too — the new text may be wider.
		if (anchored === anchor) open(anchor, text, side);

		const show = () => {
			clearTimeout(timer);
			if (performance.now() - closedAt < WARM_WINDOW) open(anchor, text, side);
			else timer = setTimeout(() => open(anchor, text, side), OPEN_DELAY);
		};
		const hide = () => {
			// Only the element that owns the bubble may take it down; a pointer
			// leaving a neighbour it never opened must not close this one.
			clearTimeout(timer);
			if (anchored === anchor || !anchored) close();
		};

		const onEnter = (e: PointerEvent) => {
			// Touch has no hover, and a long-press bubble would fight the tap.
			if (e.pointerType === 'touch') return;
			show();
		};
		// Keyboard users get the same help, but only when the focus ring is
		// actually showing — a click leaves focus behind, and a tooltip that
		// lingers over the panel you just opened is noise.
		const onFocus = () => {
			if (anchor.matches(':focus-visible')) show();
		};

		anchor.addEventListener('pointerenter', onEnter);
		anchor.addEventListener('pointerleave', hide);
		// Down, not click: the bubble should be gone before the menu or panel
		// the click opens is painted underneath it.
		anchor.addEventListener('pointerdown', hide);
		anchor.addEventListener('focus', onFocus);
		anchor.addEventListener('blur', hide);

		return () => {
			anchor.removeEventListener('pointerenter', onEnter);
			anchor.removeEventListener('pointerleave', hide);
			anchor.removeEventListener('pointerdown', hide);
			anchor.removeEventListener('focus', onFocus);
			anchor.removeEventListener('blur', hide);
			// An element can be removed while its bubble is up — a tab switching
			// away under the pointer does exactly that.
			if (anchored === anchor) close();
		};
	};
	return attachment;
}
