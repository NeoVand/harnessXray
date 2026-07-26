/**
 * Getting papers into a browser with no server.
 *
 * arXiv's *search* API sends no `access-control-allow-origin`, so it is
 * unreachable from a page. Its *content* is wide open — both `arxiv.org/html/…`
 * and `arxiv.org/pdf/…` return `ACAO: *`. So we search somewhere else and read
 * from arXiv:
 *
 *     OpenAlex (ACAO *, keyless)  →  arXiv id
 *              →  arxiv.org/html/<id>   (LaTeXML: real sections, real math)
 *              →  arxiv.org/pdf/<id>    (fallback, pre-2024)
 *
 * All CORS behaviour above was verified with live requests, not assumed.
 */

import { cached } from './search-cache';

export interface PaperHit {
	arxivId: string | null;
	title: string;
	authors: string[];
	year: number | null;
	citations: number;
	abstract: string;
	url: string;
}

/** OpenAlex ships abstracts as a position index, to sidestep bulk redistribution. */
function deInvertAbstract(inverted: Record<string, number[]> | null | undefined): string {
	if (!inverted) return '';
	const words: string[] = [];
	for (const [word, positions] of Object.entries(inverted)) {
		for (const p of positions) words[p] = word;
	}
	return words.filter(Boolean).join(' ');
}

/**
 * arXiv has two id formats and both are still in circulation:
 *   modern  2401.12345
 *   legacy  hep-th/9711200, math.AG/0601001  (pre-2007)
 * Landmark papers are overwhelmingly legacy — Maldacena's AdS/CFT is
 * hep-th/9711200 — so matching only the modern form makes exactly the papers a
 * course wants to demo unreadable.
 */
const ARXIV_ID = String.raw`(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})`;

export const ARXIV_ID_RE = new RegExp(`^${ARXIV_ID}(v\\d+)?$`, 'i');

function arxivIdFrom(work: Record<string, unknown>): string | null {
	const loc = work.primary_location as { pdf_url?: string; landing_page_url?: string } | null;
	const candidates = [loc?.pdf_url, loc?.landing_page_url, work.doi as string | undefined];
	for (const c of candidates) {
		if (!c) continue;
		const m =
			c.match(new RegExp(`arxiv\\.org\\/(?:abs|pdf)\\/${ARXIV_ID}`, 'i')) ??
			c.match(new RegExp(`arxiv\\.${ARXIV_ID}`, 'i'));
		if (m) return m[1];
	}
	return null;
}

/** arXiv mints DOIs of the form 10.48550/arXiv.<id>, so a DOI can yield an id. */
function arxivIdFromDoi(doi: string | undefined): string | null {
	const m = doi?.match(new RegExp(`10\\.48550\\/arxiv\\.${ARXIV_ID}`, 'i'));
	return m ? m[1] : null;
}

async function searchOpenAlex(
	query: string,
	limit: number,
	fromYear: number | null,
	sort: string
): Promise<PaperHit[]> {
	const filters = ['type:article'];
	if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);

	const params = new URLSearchParams({
		search: query,
		per_page: String(Math.min(limit * 3, 50)),
		filter: filters.join(','),
		select:
			'id,doi,title,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index'
	});
	if (sort === 'citations') params.set('sort', 'cited_by_count:desc');
	if (sort === 'recency') params.set('sort', 'publication_year:desc');

	const res = await fetch(`https://api.openalex.org/works?${params}`);
	if (res.status === 429) {
		// A daily credit quota, not a per-second rate — retrying immediately
		// cannot help, so say when it actually resets.
		const reset = Number(res.headers.get('x-ratelimit-reset') ?? 0);
		const hours = reset ? Math.ceil(reset / 3600) : 24;
		throw new QuotaError(
			`OpenAlex daily quota exhausted (about 100 searches per IP; resets in ~${hours}h).`
		);
	}
	if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}.`);

	const json = (await res.json()) as { results?: Record<string, unknown>[] };
	return (json.results ?? []).map((w) => ({
		arxivId: arxivIdFrom(w),
		title: String(w.title ?? 'Untitled'),
		authors: ((w.authorships as { author?: { display_name?: string } }[] | undefined) ?? [])
			.slice(0, 6)
			.map((a) => a.author?.display_name ?? '')
			.filter(Boolean),
		year: (w.publication_year as number) ?? null,
		citations: (w.cited_by_count as number) ?? 0,
		abstract: deInvertAbstract(w.abstract_inverted_index as Record<string, number[]>),
		url: String(w.id ?? '')
	}));
}

/**
 * Fallback source.
 *
 * Crossref is CORS-open and rate-limited per *second* (3/s) rather than per
 * day, so it keeps working when OpenAlex's quota is gone. It carries no
 * abstracts and only yields an arXiv id when the DOI is an arXiv one — a
 * genuinely worse result, which is why it is the fallback and not the default.
 */
async function searchCrossref(query: string, limit: number): Promise<PaperHit[]> {
	const params = new URLSearchParams({
		'query.bibliographic': query,
		rows: String(Math.min(limit * 2, 30)),
		select: 'DOI,title,issued,is-referenced-by-count,author,abstract'
	});
	const res = await fetch(`https://api.crossref.org/works?${params}`, {
		headers: { Accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`Crossref returned HTTP ${res.status}.`);

	const json = (await res.json()) as { message?: { items?: Record<string, unknown>[] } };
	return (json.message?.items ?? []).map((it) => {
		const doi = it.DOI as string | undefined;
		return {
			arxivId: arxivIdFromDoi(doi),
			title: Array.isArray(it.title) ? String(it.title[0]) : 'Untitled',
			authors: ((it.author as { family?: string; given?: string }[] | undefined) ?? [])
				.slice(0, 6)
				.map((a) => [a.given, a.family].filter(Boolean).join(' '))
				.filter(Boolean),
			year:
				((it.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]?.[0] as
					| number
					| undefined) ?? null,
			citations: (it['is-referenced-by-count'] as number) ?? 0,
			abstract: String(it.abstract ?? '').replace(/<[^>]+>/g, ''),
			url: doi ? `https://doi.org/${doi}` : ''
		};
	});
}

export class QuotaError extends Error {}

export async function searchPapers(opts: {
	query: string;
	limit?: number;
	fromYear?: number | null;
	sort?: 'relevance' | 'citations' | 'recency';
}): Promise<PaperHit[] & { source?: string }> {
	const { query, limit = 8, fromYear = null, sort = 'relevance' } = opts;
	const key = `oa:${query}|${limit}|${fromYear}|${sort}`;

	const hits = await cached(key, async () => {
		try {
			return { source: 'OpenAlex', hits: await searchOpenAlex(query, limit, fromYear, sort) };
		} catch (e) {
			if (!(e instanceof QuotaError)) throw e;
			// Degrade rather than fail: a worse source beats no source.
			return { source: 'Crossref (OpenAlex quota spent)', hits: await searchCrossref(query, limit) };
		}
	});

	// Papers we can actually read come first — an arXiv id is what makes a hit
	// actionable rather than merely interesting.
	const sorted = hits.hits
		.slice()
		.sort((a, b) => Number(Boolean(b.arxivId)) - Number(Boolean(a.arxivId)))
		.slice(0, limit) as PaperHit[] & { source?: string };
	sorted.source = hits.source;
	return sorted;
}

/** Strip an arXiv LaTeXML page down to readable text, keeping section structure. */
function htmlToText(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	doc.querySelectorAll('script,style,nav,footer,.ltx_bibliography,.ltx_page_footer').forEach((n) =>
		n.remove()
	);
	const root = doc.querySelector('.ltx_page_content') ?? doc.body;

	const out: string[] = [];
	root.querySelectorAll('h1,h2,h3,h4,p,li').forEach((el) => {
		const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
		if (!text) return;
		const tag = el.tagName.toLowerCase();
		if (tag.startsWith('h')) out.push(`\n## ${text}\n`);
		else if (tag === 'li') out.push(`- ${text}`);
		else out.push(text);
	});
	return out.join('\n');
}

export interface FetchedPaper {
	arxivId: string;
	source: 'html' | 'pdf';
	text: string;
	chars: number;
	truncated: boolean;
	/** First-page thumbnails, when the source was a PDF. */
	pages?: string[];
}

export async function fetchPaper(arxivId: string, maxChars = 24000): Promise<FetchedPaper> {
	const id = arxivId.trim().replace(/^arxiv:/i, '');

	// Legacy ids predate arXiv's HTML edition entirely, so skip the request that
	// is guaranteed to 404 (verified: /html/hep-th/9711200 → 404, /pdf → 200).
	const legacy = id.includes('/');

	// The LaTeXML edition is dramatically better than PDF text when it exists:
	// real headings, real math, no column interleaving.
	try {
		if (legacy) throw new Error('legacy id — PDF only');
		const res = await fetch(`https://arxiv.org/html/${id}`);
		if (res.ok) {
			const text = htmlToText(await res.text());
			if (text.length > 500) {
				return {
					arxivId: id,
					source: 'html',
					text: text.slice(0, maxChars),
					chars: text.length,
					truncated: text.length > maxChars
				};
			}
		}
	} catch {
		/* fall through to PDF */
	}

	const res = await fetch(`https://arxiv.org/pdf/${id}`);
	if (!res.ok) {
		throw new Error(
			`Could not fetch ${id} (HTTP ${res.status}). arXiv HTML exists only for 2024+ papers; ` +
				`the PDF fallback also failed. Try a different paper.`
		);
	}
	const buf = await res.arrayBuffer();
	const { extractPdfText, renderPdfPages } = await import('./pdf');
	const text = await extractPdfText(buf);

	// Page images are a nicety, never a reason to fail a fetch.
	let pages: string[] = [];
	try {
		pages = await renderPdfPages(buf, 4);
	} catch {
		pages = [];
	}

	// Keep the PDF itself. The agent reads the extracted text, but a person
	// reading the review will want the actual paper — and we already paid to
	// download it, so discarding it only to link out again is wasteful.
	try {
		const { assets, toBase64 } = await import('$lib/storage/assets.svelte');
		const b64 = toBase64(buf);
		await assets.put({
			path: `/papers/${id.replace(/\//g, '-')}.pdf`,
			dataUrl: `data:application/pdf;base64,${b64}`,
			kind: 'pdf',
			bytes: buf.byteLength,
			createdAt: Date.now(),
			// The thumbnails travel with the asset so the file viewer can show the
			// deck without going back through the event log to find them.
			meta: { arxivId: id, pages }
		});
	} catch {
		/* a paper we cannot cache is still a paper we read */
	}

	return {
		arxivId: id,
		source: 'pdf',
		text: text.slice(0, maxChars),
		chars: text.length,
		truncated: text.length > maxChars,
		pages
	};
}
