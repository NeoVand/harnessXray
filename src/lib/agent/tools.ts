import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchPapers, fetchPaper } from './retrieval';
import { bus } from '$lib/xray/bus.svelte';
import { compactRequest } from './compaction';

/**
 * The agent's own tools. The harness contributes the rest — `write_todos`,
 * `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `task` — which
 * is exactly the point: a student can see in the raw request that most of the
 * tool list was not written by us.
 */

export const searchPapersTool = tool(
	async ({ query, limit, fromYear, sort }) => {
		const hits = await searchPapers({ query, limit, fromYear, sort });
		if (!hits.length) return 'No results. Try broader or different terms.';
		const header = hits.source && hits.source !== 'OpenAlex' ? `(source: ${hits.source})\n\n` : '';
		return header + hits
			.map((h, i) => {
				const id = h.arxivId ? `arXiv:${h.arxivId}` : '(no arXiv id — cannot be read)';
				const who = h.authors.length ? `${h.authors[0]} et al.` : 'unknown';
				return [
					`[${i + 1}] ${h.title}`,
					`    ${who} · ${h.year ?? '?'} · ${h.citations} citations · ${id}`,
					`    ${h.abstract.slice(0, 400)}${h.abstract.length > 400 ? '…' : ''}`
				].join('\n');
			})
			.join('\n\n');
	},
	{
		name: 'search_papers',
		description:
			'Search the literature via OpenAlex. Returns title, authors, year, citation count, arXiv id ' +
			'and abstract. Cheap — run several searches with different phrasings before reading anything. ' +
			'Only results with an arXiv id can be read in full by fetch_paper.',
		schema: z.object({
			query: z.string().min(3).describe('Natural-language or keyword query'),
			limit: z.number().int().min(1).max(20).default(8),
			fromYear: z.number().int().min(1990).max(2030).nullable().default(null),
			sort: z.enum(['relevance', 'citations', 'recency']).default('relevance')
		})
	}
);

export const fetchPaperTool = tool(
	async ({ arxivId, maxChars }) => {
		const paper = await fetchPaper(arxivId, maxChars);
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
			'Fetch the full text of an arXiv paper by id (e.g. 2401.12345). Uses arXiv\'s HTML edition ' +
			'when available (2024+, preserves sections and math) and falls back to PDF extraction. ' +
			'EXPENSIVE — a full paper is tens of thousands of tokens. Read a paper once, then ' +
			'write_file your notes to /notes/<id>.md and work from those.',
		schema: z.object({
			arxivId: z
				.string()
				.describe('arXiv id — modern (2401.12345) or legacy (hep-th/9711200)'),
			maxChars: z.number().int().min(2000).max(60000).default(20000)
		})
	}
);

export const generateImageTool = tool(
	async ({ prompt, path, size, quality }) => {
		const { generateImage } = await import('./images');
		const img = await generateImage({ prompt, path, size, quality });
		return (
			`Image created and saved to ${img.path} (${(img.bytes / 1024).toFixed(0)} KB, ` +
			`${img.size}, ${img.quality}, ${img.partials} progressive frames).\n` +
			`Reference it in markdown as ![caption](${img.path}).`
		);
	},
	{
		name: 'generate_image',
		description:
			'Generate an illustration with gpt-image-2 and save it to the figures directory. ' +
			'Write a vivid, specific prompt — describe subject, composition, style and palette. ' +
			'Use paths like /figures/banner.png. The image is streamed, so progressive frames ' +
			'appear while it renders. Reference the result in markdown with ![caption](path).',
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

/** The main agent delegates rather than doing everything itself. */
export const AGENT_TOOLS = [searchPapersTool, fetchPaperTool, compactContextTool];

/** Everything a subagent might be handed. */
export const ALL_TOOLS = [searchPapersTool, fetchPaperTool, generateImageTool];
