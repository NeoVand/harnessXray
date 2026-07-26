import katex from 'katex';

/**
 * Turning agent-written markdown into a document.
 *
 * Three things the raw text does not do on its own:
 *   · math — the model writes \\(N\\), \\[…\\], $…$ and $$…$$ interchangeably
 *   · citations — "(Maldacena, 1998, arXiv:hep-th/9711200)" should be a link
 *   · paths — "/paper/review.md" should open that file
 *
 * All three are done *before* markdown parsing, by substituting into the source.
 * That keeps them out of the sanitizer's way: math becomes pre-rendered HTML
 * that we then explicitly allow, and the other two become ordinary markdown
 * links, which need no special permission at all.
 */

/** Modern (2401.12345) or legacy (hep-th/9711200). */
const ARXIV = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})`;

/**
 * Render math to HTML.
 *
 * Placeholders are used rather than direct substitution because KaTeX output
 * contains `$`, `\` and `_`, which markdown would then mangle. The rendered
 * spans are parked, markdown runs over the remaining prose, and they are put
 * back afterwards.
 */
export interface MathExtraction {
	text: string;
	nodes: Map<string, string>;
}

const PATTERNS: { re: RegExp; display: boolean }[] = [
	{ re: /\$\$([\s\S]+?)\$\$/g, display: true },
	{ re: /\\\[([\s\S]+?)\\\]/g, display: true },
	{ re: /\\\(([\s\S]+?)\\\)/g, display: false },
	// Single-dollar last, and never across a line break — otherwise a sentence
	// with two unrelated dollar amounts becomes one enormous formula.
	{ re: /(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$)/g, display: false }
];

export function extractMath(source: string): MathExtraction {
	const nodes = new Map<string, string>();
	let text = source;
	let n = 0;

	for (const { re, display } of PATTERNS) {
		text = text.replace(re, (whole, body: string) => {
			try {
				const html = katex.renderToString(body.trim(), {
					displayMode: display,
					// MUST be true. With `false`, KaTeX does not throw — it emits the
					// unparseable source as bright red text, which is where the red
					// noise in the chat came from. Throwing lets the catch below put
					// the original back untouched, so a formula the model wrote
					// slightly wrong degrades to plain text instead of an error.
					throwOnError: true,
					// The source is model-authored; \includegraphics and friends stay off.
					trust: false,
					strict: false
				});
				const key = `%%HXMATH${n++}%%`;
				nodes.set(key, html);
				return display ? `\n\n${key}\n\n` : key;
			} catch {
				return whole; // unrenderable math stays as written
			}
		});
	}

	return { text, nodes };
}

export function restoreMath(html: string, nodes: Map<string, string>): string {
	let out = html;
	for (const [key, value] of nodes) out = out.replaceAll(key, value);
	return out;
}

/**
 * Make citations and file paths clickable.
 *
 * Runs on the markdown source, so both become plain links and inherit the
 * renderer's existing link handling rather than needing new sanitizer rules.
 */
export function linkify(source: string): string {
	let out = source;

	// arXiv ids — but not ones already inside a link or an image.
	out = out.replace(
		new RegExp(String.raw`(?<!\]\()(?<!\/)\barXiv:${ARXIV}\b`, 'gi'),
		(whole, id: string) => `[${whole}](https://arxiv.org/abs/${id})`
	);

	// Internal paths written as prose or inline code. `hx:` is resolved by the
	// viewer rather than the browser.
	out = out.replace(
		/(?<!\]\()(?<!\/)`?(\/(?:paper|notes|figures|memories)\/[\w./-]+)`?/g,
		(whole, path: string) => (whole.startsWith('](') ? whole : `[\`${path}\`](hx:${path})`)
	);

	return out;
}

/** True for links the app handles itself rather than the browser. */
export function isInternalHref(href: string): boolean {
	return href.startsWith('hx:');
}

export function internalPath(href: string): string {
	return href.slice(3);
}
