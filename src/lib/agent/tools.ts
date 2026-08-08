import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	searchPapers,
	fetchPaper,
	extractFigures,
	authorsLine,
	arxivMetadata,
	confirmMetadata
} from './retrieval';
import { sources } from './sources';
import { bus } from '$lib/xray/bus.svelte';
import { compactRequest } from './compaction';

/**
 * The agent's own tools. The harness contributes the rest — `write_todos`,
 * `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `task` — which
 * is exactly the point: a student can see in the raw request that most of the
 * tool list was not written by us.
 */

/**
 * Our tools never detonate the graph.
 *
 * A thrown tool exception is not reliably converted into a tool message on
 * every execution path — inside a parallel subagent fan-out it killed the
 * whole run with a bare "Failed to fetch". So every tool that touches the
 * network (or a paid API) catches its failures and RETURNS them as text the
 * model can read and route around, which is what an agent needs from a tool
 * anyway.
 */
function toolError(e: unknown): string {
	const m = e instanceof Error ? e.message : String(e);
	const network = /failed to fetch|networkerror|load failed/i.test(m);
	return `ERROR: ${
		network
			? 'the network refused this call — usually rate limiting after many parallel fetches, or a dropped connection. Wait briefly and retry, or continue without it.'
			: m
	}`;
}

export const searchPapersTool = tool(
	async ({ query, limit, fromYear, sort, author }) => {
		if (!query.trim() && !author) {
			return 'Give a topic query, an author, or both — an empty search matches everything and nothing.';
		}
		let hits: Awaited<ReturnType<typeof searchPapers>>;
		try {
			hits = await searchPapers({ query, limit, fromYear, sort, author });
		} catch (e) {
			return toolError(e);
		}
		if (!hits.length) return 'No results. Try broader or different terms.';
		// Every hit enters the source registry, so `cite` can later tell a paper
		// this run has seen from one the model is inventing.
		sources.registerHits(hits);
		const header = hits.source && hits.source !== 'OpenAlex' ? `(source: ${hits.source})\n\n` : '';
		return (
			header +
			hits
				.map((h, i) => {
					const id = h.arxivId ? `arXiv:${h.arxivId}` : '(no arXiv id — cannot be read)';
					return [
						`[${i + 1}] ${h.title}`,
						`    ${authorsLine(h.authors)} · ${h.year ?? '?'} · ${h.citations} citations · ${id}`,
						`    ${h.abstract.slice(0, 400)}${h.abstract.length > 400 ? '…' : ''}`
					].join('\n');
				})
				.join('\n\n')
		);
	},
	{
		name: 'search_papers',
		description:
			'Search the literature via OpenAlex. Returns title, authors (first and last preserved), ' +
			'year, citation count, arXiv id and abstract. Cheap — run several searches before reading. ' +
			'IMPORTANT: `query` matches title/abstract TEXT — it cannot find papers BY a person. For ' +
			'"papers by X" or "X\'s latest paper", pass `author` (optionally with a topic query and ' +
			'sort: recency). Only results with an arXiv id can be read in full by fetch_paper; recent ' +
			'journal-only papers legitimately have none.',
		schema: z.object({
			query: z
				.string()
				.default('')
				.describe('Topic query over titles and abstracts. May be empty when author is given.'),
			author: z
				.string()
				.nullable()
				.default(null)
				.describe('Author name filter, e.g. "Joshua Tenenbaum". The only way to search by person.'),
			limit: z.number().int().min(1).max(20).default(8),
			fromYear: z.number().int().min(1990).max(2030).nullable().default(null),
			sort: z.enum(['relevance', 'citations', 'recency']).default('relevance')
		})
	}
);

export const fetchPaperTool = tool(
	async ({ arxivId, maxChars }) => {
		let paper: Awaited<ReturnType<typeof fetchPaper>>;
		try {
			paper = await fetchPaper(arxivId, maxChars);
		} catch (e) {
			return toolError(e);
		}
		sources.markFetched(paper.arxivId, { title: paper.title, authors: paper.authors });
		// Only when the read itself could not say. The HTML edition carries its
		// own header, and a paper found by `search_papers` already has canonical
		// metadata — so this costs a request for pre-2024 papers fetched straight
		// by id, and nothing at all otherwise. Best-effort: a citation that names
		// the paper by id alone is a poorer reference, not a failed fetch.
		if (sources.needsMetadata(paper.arxivId)) {
			const meta = await arxivMetadata(paper.arxivId);
			// Never unconfirmed. OpenAlex's record for SWE-bench's arXiv DOI carries
			// a different paper's title, and its disambiguated author names are
			// sometimes people who do not exist — either one written straight into a
			// reference list is a citation error, and worse than an honest blank.
			if (meta) {
				const ok = confirmMetadata(meta, paper.text);
				if (ok.title || ok.authors.length) sources.markFetched(paper.arxivId, ok);
			}
		}
		// A read paper should be visible as an object, not just a character count.
		bus.emit({
			kind: 'paper_fetched',
			scope: 'main',
			arxivId: paper.arxivId,
			source: paper.source,
			chars: paper.chars,
			pages: paper.pages ?? [],
			label: paper.arxivId
		});
		// Legacy ids contain a slash (hep-th/9711200), which turns a notes path
		// into an accidental subdirectory — and subagents each invented their own
		// spelling, producing seven files for four papers. Hand back the exact
		// path to use so it is decided here, once, rather than by each caller.
		const slug = paper.arxivId.replace(/\//g, '-');
		return [
			`source: ${paper.source} · ${paper.chars} chars${paper.truncated ? ' (truncated)' : ''}`,
			`Save your notes to /notes/${slug}.md — use exactly this path.`,
			'',
			paper.text
		].join('\n');
	},
	{
		name: 'fetch_paper',
		description:
			"Fetch the full text of an arXiv paper by id (e.g. 2401.12345). Uses arXiv's HTML edition " +
			'when available (2024+, preserves sections and math) and falls back to PDF extraction. ' +
			'EXPENSIVE — a full paper is tens of thousands of tokens. Read a paper once, then ' +
			'write_file your notes to /notes/<id>.md and work from those.',
		schema: z.object({
			arxivId: z.string().describe('arXiv id — modern (2401.12345) or legacy (hep-th/9711200)'),
			maxChars: z.number().int().min(2000).max(60000).default(20000)
		})
	}
);

export const generateImageTool = tool(
	async ({ prompt, path, size, quality }) => {
		const { generateImage } = await import('./images');
		let img: Awaited<ReturnType<typeof generateImage>>;
		try {
			img = await generateImage({ prompt, path, size, quality });
		} catch (e) {
			return toolError(e);
		}
		return (
			`Image created and saved to ${img.path} (${(img.bytes / 1024).toFixed(0)} KB, ` +
			`${img.size}, ${img.quality}, ${img.partials} progressive frames).` +
			(img.replaced ? ' This REPLACED an image that already existed at this path.' : '') +
			`\nReference it in markdown as ![caption](${img.path}).\n` +
			`Note: images live in the asset store, not your text filesystem — ls will never show ` +
			`this file, but list_figures will. It exists; do not regenerate it.`
		);
	},
	{
		name: 'generate_image',
		description:
			'Generate an illustration or infographic with gpt-image-2 and save it under /figures/. ' +
			'It renders in-image TEXT accurately and designs beautifully on its own: specify the ' +
			'content exactly (title and every label as exact quoted strings, audience, purpose, a ' +
			'quality bar like "Nature explainer") and do NOT dictate palette/style/strokes — ' +
			'over-specified prompts come back as clip-art. Use quality "high" for text-dense ' +
			'layouts. Reference the result in markdown with ![caption](path).',
		schema: z.object({
			prompt: z.string().min(10).describe('The image prompt. Be specific and visual.'),
			path: z
				.string()
				.regex(/^\/figures\/[\w-]+\.(png|jpg|jpeg|webp)$/)
				.describe('Where to save it, e.g. /figures/banner.png'),
			size: z.enum(['1024x1024', '1536x1024', '1024x1536']).default('1536x1024'),
			quality: z.enum(['low', 'medium', 'high']).default('medium')
		})
	}
);

/**
 * The house style stylize_figure redraws into.
 *
 * One sentence, and deliberately not a checklist: the same lesson the
 * infographic skill is built on is that palette lists and stroke widths produce
 * clip-art, while a named quality bar produces design. It is stated once here so
 * every stylised figure in a document matches every other one, which is the
 * actual point of having a house style rather than a per-call adjective.
 */
export const HOUSE_STYLE =
	'Redraw this as a clean editorial diagram of the quality of a Nature or Quanta ' +
	'explainer: the same structure, quantities and relationships, redrawn as ' +
	'original artwork rather than reproduced. Keep every axis label, data label ' +
	'and legend entry that is legible in the source, spelled exactly as it appears. ' +
	'Do not invent data points, do not change any value, and do not add decoration ' +
	'that asserts something the original does not.';

export const editImageTool = tool(
	async ({ from, prompt, path, size, quality }) => {
		const { editImage } = await import('./images');
		try {
			const img = await editImage({ from, path: path ?? from, prompt, size, quality });
			return (
				`Edited ${from} → ${img.path} (${(img.bytes / 1024).toFixed(0)} KB, ${img.quality}).` +
				(img.replaced ? ' This REPLACED the image that was at that path.' : '') +
				`\nReference it in markdown as ![caption](${img.path}).` +
				`\nThe edit is a NEW rendering, not the original pixels — describe it as a redrawn ` +
				`figure if the source was someone else's artwork.`
			);
		} catch (e) {
			return toolError(e);
		}
	},
	{
		name: 'edit_image',
		description:
			'Change an image that already exists: restyle it, fix a misspelled label, alter a ' +
			'background, combine an instruction with what is already there. Give the path of an ' +
			'existing image and say what should be different — the model re-renders the whole ' +
			'picture, so describe the change, not the entire scene. Omit `path` to overwrite in ' +
			'place, or give a new one to keep both. For turning a paper figure into something ' +
			'publishable, prefer stylize_figure — it carries the house style and the attribution.',
		schema: z.object({
			from: z
				.string()
				.regex(/^\/figures\/[\w-]+\.(png|jpg|jpeg|webp)$/)
				.describe('An existing image, e.g. /figures/fig1.png. Check list_figures first.'),
			prompt: z.string().min(8).describe('What should be different. Describe the change.'),
			path: z
				.string()
				.regex(/^\/figures\/[\w-]+\.(png|jpg|jpeg|webp)$/)
				.optional()
				.describe('Where to save it. Omit to overwrite `from` in place.'),
			size: z.enum(['auto', '1024x1024', '1536x1024', '1024x1536']).default('auto'),
			quality: z.enum(['low', 'medium', 'high']).default('high')
		})
	}
);

export const stylizeFigureTool = tool(
	async ({ from, path, note }) => {
		const { editImage } = await import('./images');
		const { assets } = await import('$lib/storage/assets.svelte');
		const target = path ?? from.replace(/\.(png|jpg|jpeg|webp)$/, '-styled.png');
		// Extracted figures record { arxivId, caption, source: 'extracted' }; a
		// generated one does not, and that difference decides the caption.
		const meta = (await assets.get(from))?.meta as { arxivId?: string } | undefined;
		const source = meta?.arxivId ? { arxivId: meta.arxivId } : undefined;
		try {
			const img = await editImage({
				from,
				path: target,
				prompt: note ? `${HOUSE_STYLE}\n\nAlso: ${note}` : HOUSE_STYLE,
				quality: 'high'
			});
			// Attribution is read off the source asset rather than left to the model,
			// which otherwise credits the file PATH — the run that prompted this
			// suggested 'Redrawn after /figures/….png', which credits nobody.
			const credit = source?.arxivId
				? `"Redrawn after arXiv:${source.arxivId}"`
				: 'no attribution — the source was generated for this document, not taken from a paper';
			return (
				`Stylised ${from} → ${img.path} (${(img.bytes / 1024).toFixed(0)} KB). ` +
				`The original is untouched and still at ${from}.\n` +
				`Embed the stylised one with ![caption](${img.path}). Caption it ${credit}. ` +
				`It is original artwork based on the figure rather than the figure itself, which ` +
				`is exactly what makes it publishable — but for that reason it is NOT evidence: ` +
				`use the original when the point is what a paper actually reported.`
			);
		} catch (e) {
			return toolError(e);
		}
	},
	{
		name: 'stylize_figure',
		description:
			"Redraw an extracted paper figure as original artwork in this document's house style, " +
			'preserving its structure, labels and quantities. Use this when a figure from a paper ' +
			'should appear in a document you are publishing: the redrawing carries the same ' +
			'information without reproducing copyrighted artwork. Saves alongside the original — ' +
			'never over it — so the evidence version survives. Caption the result as "Redrawn ' +
			'after <source>".',
		schema: z.object({
			from: z
				.string()
				.regex(/^\/figures\/[\w-]+\.(png|jpg|jpeg|webp)$/)
				.describe('The extracted figure to redraw, e.g. /figures/2401-12345-x1.png'),
			path: z
				.string()
				.regex(/^\/figures\/[\w-]+\.(png|jpg|jpeg|webp)$/)
				.optional()
				.describe('Where to save it. Defaults to the source path with -styled appended.'),
			note: z
				.string()
				.optional()
				.describe(
					'Only what the house style cannot know: which panel matters, a label to ' +
						'correct, something to leave out. Do NOT restate a style — no palettes, ' +
						'no "flat vector", no background or stroke instructions. The house style ' +
						'is already sent and over-specifying it is what produces clip-art.'
				)
		})
	}
);

export const compactContextTool = tool(
	async () => {
		compactRequest.pending = true;
		return (
			'Compaction scheduled. It will run the moment this turn ends, and cannot run before ' +
			'that: the message list is the input you are being served from right now, so rewriting ' +
			'it mid-turn would invalidate the request in progress. Finish your reply — everything ' +
			'up to the last user turn will be replaced by a summary, and the originals archived to ' +
			'/conversation_history/. Simply tell the user it is done.'
		);
	},
	{
		name: 'compact_context',
		description:
			'Fold the earlier part of this conversation into a summary, freeing context. Call this ' +
			'when the user asks you to compact, summarise or clear your context, or when you notice ' +
			'the context is nearly full. The harness also does this automatically past a threshold; ' +
			'this is the manual trigger.',
		schema: z.object({})
	}
);

export const extractFiguresTool = tool(
	async ({ paper, max }) => {
		let out: Awaited<ReturnType<typeof extractFigures>>;
		try {
			out = await extractFigures(paper, max);
		} catch (e) {
			return toolError(e);
		}
		if (!out.figures.length) return out.note;

		const provenance =
			out.via === 'pdf'
				? `These were cut out of the PDF pages around each caption, so they are page crops ` +
					`rather than the publisher's original files. Caption them "Figure from arXiv:${paper}" ` +
					`exactly as with any extracted figure.`
				: `Attribute each one in its caption text: "Figure from arXiv:${paper}".`;

		return [
			`Extracted ${out.figures.length} real figures from ${paper} ` +
				`(via ${out.via === 'pdf' ? 'the PDF' : "arXiv's HTML edition"}), with the paper's own captions:`,
			...out.figures.map(
				(f, i) =>
					`${i + 1}. ${f.path} (${(f.bytes / 1024).toFixed(0)} KB)\n   caption: ${f.caption.slice(0, 200) || '(none)'}`
			),
			out.note ? `\n${out.note}` : '',
			'',
			`Embed one with ![<short caption>](<path>). ${provenance} Embed only figures that carry a ` +
				'claim the text needs.',
			'Note: these live in the asset store, not your text filesystem — verify with ' +
				'list_figures, never with ls.'
		]
			.filter(Boolean)
			.join('\n');
	},
	{
		name: 'extract_figures',
		description:
			"Pull the REAL figures out of a paper, with the paper's own captions, saved under " +
			"/figures/. Works on any paper: 2024+ arXiv papers give the publisher's original image " +
			'files, and everything else — legacy ids, pre-2024 papers, and PDFs the user uploaded — ' +
			'is cut out of the rendered PDF page around each caption. Prefer this over generate_image ' +
			'when the point is to show what the paper actually reported: an extracted figure is ' +
			'evidence, a generated one is decoration.',
		schema: z.object({
			paper: z
				.string()
				.describe(
					'An arXiv id (2401.12345, or a legacy id like hep-th/9711200), or the path of a PDF ' +
						'already in the store (/papers/….pdf, /uploads/….pdf)'
				),
			max: z.number().int().min(1).max(12).default(6)
		})
	}
);

export const presentOutlineTool = tool(
	async ({ title, sections }) => {
		// Reaching this body at all means the human approved (or edited) the
		// outline — the interrupt happens before execution. Echo the final form
		// back so the model works from what was approved, not what it proposed.
		return [
			`The user approved this outline — follow it. Deviate only if they ask.`,
			`Title: ${title}`,
			...sections.map((s, i) => `${i + 1}. ${s.heading} — ${s.covers}`)
		].join('\n');
	},
	{
		name: 'present_outline',
		description:
			'Present the planned structure of the document for approval BEFORE reading deeply or ' +
			'drafting. This pauses the run: the user can approve, edit the sections directly, or ' +
			'reject with a reason. One approved outline is worth ten rounds of rewriting — call ' +
			'this once your searches tell you what the literature actually contains.',
		schema: z.object({
			title: z.string().min(4).describe('Working title of the document'),
			sections: z
				.array(
					z.object({
						heading: z.string().describe('Section heading'),
						covers: z.string().describe('One sentence: what this section argues or covers')
					})
				)
				.min(2)
				.max(10)
		})
	}
);

export const listFiguresTool = tool(
	async () => {
		const { assets } = await import('$lib/storage/assets.svelte');
		const images = (await assets.list()).filter((a) => a.kind === 'image');
		if (!images.length)
			return 'No images exist in this conversation yet — nothing generated, extracted or uploaded.';
		return [
			`${images.length} image${images.length > 1 ? 's' : ''} in the asset store:`,
			...images.map((a) => {
				const meta = a.meta ?? {};
				const what =
					meta.source === 'extracted'
						? `extracted from arXiv:${String(meta.arxivId ?? '?')}`
						: meta.prompt
							? 'generated'
							: 'uploaded';
				const cap = String(meta.caption ?? meta.prompt ?? '').slice(0, 90);
				return `${a.path} · ${(a.bytes / 1024).toFixed(0)} KB · ${what}${cap ? ` · ${cap}` : ''}`;
			})
		].join('\n');
	},
	{
		name: 'list_figures',
		description:
			'List every image this conversation actually has — generated, extracted, or uploaded. ' +
			'Images live in the ASSET STORE, not in your text filesystem: ls cannot see them, this ' +
			'can. Use this to verify a figure path before embedding it, and NEVER regenerate an ' +
			'image this list already shows.',
		schema: z.object({})
	}
);

export const citeTool = tool(
	async ({ arxivId }) => {
		const id = arxivId.trim().replace(/^arxiv:/i, '');
		return sources.cite(id).text;
	},
	{
		name: 'cite',
		description:
			'Get the canonical inline citation for a paper — and a refusal if this run never ' +
			'actually read it. Call this for EVERY citation you write. It fails on papers that were ' +
			'never seen, and on papers only seen as search snippets, which is exactly the point: a ' +
			'reference list should contain nothing the run cannot vouch for.',
		schema: z.object({
			arxivId: z.string().describe('arXiv id — modern (2401.12345) or legacy (hep-th/9711200)')
		})
	}
);

export const bibliographyTool = tool(async () => sources.bibliography(), {
	name: 'bibliography',
	description:
		'The References section, generated from the source registry — every paper this run ' +
		'cited (or read, if nothing is cited yet), numbered stably. Use this to write the ' +
		'reference list instead of recalling papers from memory.',
	schema: z.object({})
});

/** The main agent delegates rather than doing everything itself. */
export const AGENT_TOOLS = [
	searchPapersTool,
	fetchPaperTool,
	presentOutlineTool,
	citeTool,
	bibliographyTool,
	extractFiguresTool,
	// The main agent has no generate_image — designing an illustration is a
	// briefing job and belongs to image-smith, in its own context window.
	// Stylising is the opposite kind of work: mechanical, single-shot, with the
	// house style already in code. Dispatching a subagent to do it would buy a
	// model round-trip and nothing else, and the figure being redrawn is one the
	// main agent extracted and is about to place. So it lives here, gated.
	stylizeFigureTool,
	listFiguresTool,
	compactContextTool
];

/** Everything a subagent might be handed. */
export const ALL_TOOLS = [
	searchPapersTool,
	fetchPaperTool,
	generateImageTool,
	editImageTool,
	stylizeFigureTool,
	citeTool,
	bibliographyTool,
	extractFiguresTool,
	listFiguresTool
];
