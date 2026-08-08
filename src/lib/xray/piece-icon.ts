import { ICON, type IconValue } from '$lib/icons';
import { toolMeta } from '$lib/agent/tool-meta';
import type { ContextPiece } from './context';

/**
 * A glyph per piece of the context window.
 *
 * The panel's rows were a colour swatch and two lines of text, which meant the
 * eye had to read every label to find the one band it wanted — and the colours
 * were already doing a different job (they map to the event palette, so the
 * filesystem band is fs-teal because filesystem events are fs-teal). An icon
 * says *what kind of thing* at a glance and leaves the colour to say *which
 * subsystem*.
 *
 * Kept out of `context.ts` on purpose. That module decomposes a request body
 * and nothing else; teaching it about the icon registry would make a pure
 * derivation import presentation, the same reason `tool-meta` is not inside
 * `tools.ts`.
 *
 * Matching is on the piece's stable `id` rather than its label, because labels
 * are prose that gets rewritten and ids are the contract.
 */

/** The harness's own system-prompt bands, keyed by `id` from BANDS. */
const SYSTEM: Record<string, IconValue> = {
	'sys:ours': ICON.prompt,
	'sys:base': ICON.agent,
	'sys:plan': ICON.todo,
	'sys:files': ICON.files,
	'sys:task': ICON.subagent,
	'sys:skills': ICON.skill,
	'sys:memory': ICON.memory
};

/** Message-item kinds, keyed by the label the decomposition assigns. */
const MESSAGE: Record<string, IconValue> = {
	'tool call': ICON.tool,
	'tool result': ICON.tool,
	reasoning: ICON.reasoning,
	// A middleware wrote this into the request on the way out, and it is stored
	// nowhere — the state icon, because that is exactly what middleware is here.
	injected: ICON.state,
	user: ICON.user,
	assistant: ICON.model
};

export function pieceIcon(piece: ContextPiece): IconValue {
	if (piece.group === 'system') return SYSTEM[piece.id] ?? ICON.model;
	// The toolbox already owns one glyph per tool; the context panel showing a
	// different one for the same schema would be two legends for one thing.
	if (piece.group === 'tools') return toolMeta(piece.label).icon;
	return MESSAGE[piece.label] ?? ICON.message;
}
