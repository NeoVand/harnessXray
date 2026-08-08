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

	// arXiv ids — but not ones that are already part of a link, in either half
	// of it. The lookBEHIND skips a destination, `](arXiv:…`; the lookAHEAD
	// skips one that is the link *text*, `[arXiv:…](url)`. Without the second, a
	// citation the model wrote correctly as markdown came back as
	// `[[arXiv:x](url)](url)` — the one form of citation that got punished for
	// being right.
	out = out.replace(
		new RegExp(String.raw`(?<!\]\()(?<!\/)\barXiv:${ARXIV}\b(?!\]\()`, 'gi'),
		(whole, id: string) => `[${whole}](https://arxiv.org/abs/${id})`
	);

	// Internal paths written as prose or inline code. `hx:` is resolved by the
	// viewer rather than the browser.
	//
	// The path may not END on a dot. `.` has to be in the character class —
	// every one of these has an extension — but a path is usually the last thing
	// in its sentence, so a greedy class swallowed the full stop and linked
	// `/paper/review.md.`, a file that does not exist. A comma or a paren never
	// had this problem; only the character the extension also uses.
	out = out.replace(
		/(?<!\]\()(?<!\/)`?(\/(?:paper|notes|figures|memories)\/[\w./-]*[\w-])`?/g,
		(whole, path: string) => (whole.startsWith('](') ? whole : `[\`${path}\`](hx:${path})`)
	);

	return out;
}

/** Markdown image syntax. Alt runs to the first `]`, destination to the `)`. */
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/**
 * Linkify the prose and resolve the pictures, without either touching the other.
 *
 * Order was the bug. Running `linkify` over the whole document and *then*
 * rewriting figure paths broke every figure that cited its source — which, in a
 * document made of paper figures, is all of them. A caption says where the
 * picture came from:
 *
 *     ![Figure 1: … Figure from arXiv:2405.15793.](/figures/2405-15793-fig1.png)
 *
 * and linkify rewrites that `arXiv:…` **inside the alt text** into a markdown
 * link. The `]` it inserts ends the alt early for the figure regex that runs
 * next, the path is never resolved, and the reader gets a broken image pointing
 * at a virtual path no server can serve. Uncited figures were untouched, so the
 * app looked fine: a generated banner rendered and every extracted figure did
 * not.
 *
 * Cutting the images out first fixes both halves. Alt text is a plain attribute
 * — a link inside it was never meaningful — and a destination is a path rather
 * than prose, so neither was ever linkify's business.
 *
 * `resolve` is passed in rather than imported: this stays a pure string
 * transform, and the asset store is the caller's problem.
 */
export function enrichBody(source: string, resolve: (dest: string) => string): string {
	let out = '';
	let last = 0;
	for (let m: RegExpExecArray | null; (m = IMAGE.exec(source));) {
		out += linkify(source.slice(last, m.index));
		out += `![${m[1]}](${resolve(m[2])})`;
		last = m.index + m[0].length;
	}
	// `IMAGE` is a module-level /g regex; leaving lastIndex set would make the
	// next call start mid-document and silently skip its first figures.
	IMAGE.lastIndex = 0;
	return out + linkify(source.slice(last));
}

/** True for links the app handles itself rather than the browser. */
export function isInternalHref(href: string): boolean {
	return href.startsWith('hx:');
}

export function internalPath(href: string): string {
	return href.slice(3);
}
