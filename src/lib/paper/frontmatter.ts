/**
 * YAML frontmatter, split off before markdown ever sees it.
 *
 * Every SKILL.md opens with a `---` block, and until now it went straight into
 * `marked`, which does the only thing it can: turns the fences into two
 * horizontal rules and the `key: value` lines into one running paragraph. So
 * the most structured part of the document rendered as the least structured —
 * "name: arxiv-review description: Read arXiv papers and turn them into…" as
 * body prose, in the body font.
 *
 * Splitting it out rather than teaching the markdown pipeline about it is
 * deliberate. The renderer sanitises model-authored HTML, so anything injected
 * as markup has to survive a whitelist; emitting *tokens* and letting Svelte
 * build real elements keeps untrusted text as text — the same reason
 * `tokenizeJson` exists instead of shiki.
 *
 * The tokenizer is scoped to what frontmatter actually contains: scalars, flow
 * lists, block lists and comments. It is not a YAML parser and does not pretend
 * to be one — anchors, multi-line scalars and nested flow maps fall through as
 * plain text, which renders correctly even when it is not coloured.
 */

export type YamlKind = 'key' | 'string' | 'number' | 'boolean' | 'comment' | 'dash' | 'plain';

export interface YamlToken {
	kind: YamlKind;
	text: string;
}

export interface Split {
	/** Raw frontmatter body, fences removed. Empty when there was none. */
	frontmatter: string;
	/** Everything after the closing fence — what markdown should render. */
	body: string;
}

/**
 * Peel the leading `---` block off a document.
 *
 * Strict about the opening: the fence must be the very first line, because a
 * `---` further down is a horizontal rule and turning one of those into a
 * metadata block would silently eat a section of prose. Unterminated frontmatter
 * is treated as no frontmatter for the same reason.
 */
export function splitFrontmatter(source: string): Split {
	const text = source ?? '';
	// Tolerate a BOM and CRLF, both of which arrive from real uploaded files.
	const clean = text.replace(/^\uFEFF/, '');
	const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(clean);
	if (!m) return { frontmatter: '', body: text };
	return { frontmatter: m[1], body: clean.slice(m[0].length) };
}

/** `key:`, with the key captured — indentation and list dashes allowed before it. */
const KEY = /^(\s*)(?:(-)\s+)?([A-Za-z0-9_.$-]+)(:)(.*)$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const BOOLEAN = /^(?:true|false|yes|no|null|~)$/i;

/** One line of frontmatter, as coloured tokens. Whitespace is preserved. */
function tokenizeLine(line: string): YamlToken[] {
	const trimmed = line.trim();
	if (!trimmed) return [{ kind: 'plain', text: line }];
	if (trimmed.startsWith('#')) return [{ kind: 'comment', text: line }];

	const m = KEY.exec(line);
	if (m) {
		const [, indent, dash, key, colon, rest] = m;
		const out: YamlToken[] = [];
		if (indent) out.push({ kind: 'plain', text: indent });
		if (dash) out.push({ kind: 'dash', text: '- ' });
		out.push({ kind: 'key', text: key });
		out.push({ kind: 'plain', text: colon });
		out.push(...tokenizeValue(rest));
		return out;
	}

	// A bare list item: `- something`.
	const item = /^(\s*)(-)\s+(.*)$/.exec(line);
	if (item) {
		const [, indent, , rest] = item;
		return [
			...(indent ? [{ kind: 'plain' as const, text: indent }] : []),
			{ kind: 'dash', text: '- ' },
			...tokenizeValue(rest)
		];
	}

	return [{ kind: 'plain', text: line }];
}

/** The right-hand side of a `key:`, or a list item's payload. */
function tokenizeValue(raw: string): YamlToken[] {
	if (!raw) return [];
	const lead = raw.match(/^\s*/)?.[0] ?? '';
	const value = raw.slice(lead.length);
	const out: YamlToken[] = lead ? [{ kind: 'plain', text: lead }] : [];
	if (!value) return out;

	// A trailing comment is a comment wherever it appears — but only when it is
	// preceded by whitespace, so a `#` inside a value (a colour, a fragment) stays
	// part of the value.
	const hash = value.search(/(?:^|\s)#/);
	if (hash > 0) {
		out.push(...tokenizeValue(value.slice(0, hash)));
		out.push({ kind: 'comment', text: value.slice(hash) });
		return out;
	}

	if (NUMBER.test(value)) out.push({ kind: 'number', text: value });
	else if (BOOLEAN.test(value)) out.push({ kind: 'boolean', text: value });
	else out.push({ kind: 'string', text: value });
	return out;
}

/** Frontmatter as lines of tokens — one array per source line, order preserved. */
export function tokenizeYaml(frontmatter: string): YamlToken[][] {
	return frontmatter.replace(/\r\n/g, '\n').split('\n').map(tokenizeLine);
}
