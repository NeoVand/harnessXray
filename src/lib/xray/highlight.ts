/**
 * JSON tokenizer for display.
 *
 * Hand-rolled rather than shiki, deliberately. We highlight exactly one
 * language, the payloads can be megabytes, and shiki would cost ~1 MB of
 * grammar and a WASM engine to do it. This is ~40 lines, runs synchronously,
 * and — importantly — emits *tokens*, so the renderer can use real elements
 * instead of injecting HTML into a pane that displays untrusted model output.
 */

export type TokenKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain';

export interface Token {
	kind: TokenKind;
	text: string;
}

const PATTERN = new RegExp(
	[
		'("(?:\\\\.|[^"\\\\])*")\\s*:', // 1: key (a string followed by a colon)
		'("(?:\\\\.|[^"\\\\])*")', // 2: string value
		'(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)', // 3: number
		'\\b(true|false)\\b', // 4: boolean
		'\\b(null)\\b' // 5: null
	].join('|'),
	'g'
);

export function tokenizeJson(source: string): Token[] {
	const tokens: Token[] = [];
	let last = 0;

	for (const m of source.matchAll(PATTERN)) {
		const at = m.index ?? 0;
		if (at > last) tokens.push({ kind: 'punct', text: source.slice(last, at) });

		if (m[1] !== undefined) {
			// Emit the colon separately so it can be dimmed with the other punctuation.
			tokens.push({ kind: 'key', text: m[1] });
			tokens.push({ kind: 'punct', text: m[0].slice(m[1].length) });
		} else if (m[2] !== undefined) tokens.push({ kind: 'string', text: m[2] });
		else if (m[3] !== undefined) tokens.push({ kind: 'number', text: m[3] });
		else if (m[4] !== undefined) tokens.push({ kind: 'boolean', text: m[4] });
		else if (m[5] !== undefined) tokens.push({ kind: 'null', text: m[5] });

		last = at + m[0].length;
	}

	if (last < source.length) tokens.push({ kind: 'punct', text: source.slice(last) });
	return tokens;
}

/** Pretty-print if it parses; otherwise hand back the original text untouched. */
export function prettyJson(source: string): string {
	try {
		return JSON.stringify(JSON.parse(source), null, 2);
	} catch {
		return source;
	}
}

/** The `event:` name of an SSE frame, for chips and filtering. */
export function sseEventName(raw: string): string | null {
	const line = raw.split('\n').find((l) => l.startsWith('event:'));
	if (line) return line.slice(6).trim();
	const data = raw
		.split('\n')
		.find((l) => l.startsWith('data:'))
		?.slice(5)
		.trim();
	if (!data || data === '[DONE]') return data === '[DONE]' ? 'done' : null;
	try {
		return (JSON.parse(data) as { type?: string }).type ?? null;
	} catch {
		return null;
	}
}
