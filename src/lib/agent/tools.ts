import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchPapers, fetchPaper, fetchPaperFigures, authorsLine } from './retrieval';
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
		sources.markFetched(paper.arxivId);
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
	async ({ arxivId, max }) => {
		let figures: Awaited<ReturnType<typeof fetchPaperFigures>>['figures'];
		let note: string;
		try {
			({ figures, note } = await fetchPaperFigures(arxivId, max));
		} catch (e) {
			return toolError(e);
		}
		if (!figures.length) return note;
		return [
			`Extracted ${figures.length} real figures from arXiv:${arxivId}, with the paper's own captions:`,
			...figures.map(
				(f, i) =>
					`${i + 1}. ${f.path} (${(f.bytes / 1024).toFixed(0)} KB)\n   caption: ${f.caption.slice(0, 200) || '(none)'}`
			),
			'',
			'Embed one with ![<short caption>](<path>) and attribute it in the caption text: ' +
				`"Figure from arXiv:${arxivId}". Embed only figures that carry a claim the text needs.`,
			'Note: these live in the asset store, not your text filesystem — verify with ' +
				'list_figures, never with ls.'
		].join('\n');
	},
	{
		name: 'extract_figures',
		description:
			'Pull the REAL figures out of a paper (2024+ arXiv HTML editions only), with their ' +
			'original captions, saved under /figures/. Prefer this over generate_image when the ' +
			'point is to show what the paper actually reported — an extracted figure is evidence, ' +
			'a generated one is decoration.',
		schema: z.object({
			arxivId: z.string().describe('arXiv id, e.g. 2401.12345 (legacy ids have no HTML edition)'),
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
	listFiguresTool,
	compactContextTool
];

/** Everything a subagent might be handed. */
export const ALL_TOOLS = [
	searchPapersTool,
	fetchPaperTool,
	generateImageTool,
	citeTool,
	bibliographyTool,
	extractFiguresTool,
	listFiguresTool
];
