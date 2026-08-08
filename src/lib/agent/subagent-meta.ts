import {
	Book02Icon,
	JusticeScale01Icon,
	PaintBrush04Icon,
	QuillWrite01Icon,
	RoboticIcon
} from '@hugeicons/core-free-icons';
import type { IconValue } from '$lib/icons';

/**
 * Per-subagent identity, the same idea as `tool-meta` and for the same reason.
 *
 * A subagent shows up in four places — the lane header on the timeline, the
 * crew list, the carrier strip in the toolbox, and the `task` rows that
 * dispatch it — and until now every one of them drew the identical generic
 * robot. Which meant the most structural fact about a run, *which* delegate is
 * talking, was carried entirely by a truncated string. One glyph per subagent
 * makes a lane recognisable before you read it.
 *
 * Names are matched exactly and an unknown one falls back to the robot, which
 * is the honest default: `general-purpose` is the harness's own clone and has
 * no character of its own to draw.
 *
 * paper-reader is a CLOSED book, not an open one. The open book is the app's
 * own tutorial button in the top bar, and hugeicons' open-book-with-text is
 * that icon's two paths verbatim plus four hairline strokes — at the 9-12px a
 * lane header draws, the strokes are gone and the two are the same picture.
 */
const META: Record<string, IconValue> = {
	'paper-reader': Book02Icon,
	'image-smith': PaintBrush04Icon,
	'report-writer': QuillWrite01Icon,
	critic: JusticeScale01Icon,
	'general-purpose': RoboticIcon
};

export function subagentIcon(name: string): IconValue {
	return META[name] ?? RoboticIcon;
}

/**
 * The colour a subagent is drawn in.
 *
 * Two, not five: the distinction worth seeing is ours vs. the one the harness
 * appended, exactly as tools are coloured by origin. Giving each subagent its
 * own hue would look richer and say less.
 */
export function subagentColor(origin: 'ours' | 'harness'): string {
	return origin === 'harness' ? 'var(--hx-interrupt)' : 'var(--hx-subagent)';
}
