import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchPapers, fetchPaper } from './retrieval';

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
		return hits
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
		return [
			`source: ${paper.source} · ${paper.chars} chars${paper.truncated ? ' (truncated)' : ''}`,
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
			arxivId: z.string().describe('arXiv id such as 2401.12345 or 2401.12345v2'),
			maxChars: z.number().int().min(2000).max(60000).default(20000)
		})
	}
);

export const AGENT_TOOLS = [searchPapersTool, fetchPaperTool];
