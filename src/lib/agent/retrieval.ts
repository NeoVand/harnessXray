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

function arxivIdFrom(work: Record<string, unknown>): string | null {
	const loc = work.primary_location as { pdf_url?: string; landing_page_url?: string } | null;
	const candidates = [loc?.pdf_url, loc?.landing_page_url, work.doi as string | undefined];
	for (const c of candidates) {
		if (!c) continue;
		const m = c.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,5})/i) ?? c.match(/arxiv\.(\d{4}\.\d{4,5})/i);
		if (m) return m[1];
	}
	return null;
}

export async function searchPapers(opts: {
	query: string;
	limit?: number;
	fromYear?: number | null;
	sort?: 'relevance' | 'citations' | 'recency';
}): Promise<PaperHit[]> {
	const { query, limit = 8, fromYear = null, sort = 'relevance' } = opts;

	const filters = ['type:article'];
	if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);

	const params = new URLSearchParams({
		search: query,
		per_page: String(Math.min(limit * 3, 50)),
		filter: filters.join(','),
		select: 'id,doi,title,publication_year,cited_by_count,authorships,primary_location,abstract_inverted_index'
	});
	if (sort === 'citations') params.set('sort', 'cited_by_count:desc');
	if (sort === 'recency') params.set('sort', 'publication_year:desc');

	const res = await fetch(`https://api.openalex.org/works?${params}`);
	if (!res.ok) throw new Error(`OpenAlex returned HTTP ${res.status}.`);
	const json = (await res.json()) as { results?: Record<string, unknown>[] };

	const hits: PaperHit[] = (json.results ?? []).map((w) => ({
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

	// Papers we can actually read come first — an arXiv id is what makes a hit
	// actionable rather than merely interesting.
	return hits.sort((a, b) => Number(Boolean(b.arxivId)) - Number(Boolean(a.arxivId))).slice(0, limit);
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
}

export async function fetchPaper(arxivId: string, maxChars = 24000): Promise<FetchedPaper> {
	const id = arxivId.trim().replace(/^arxiv:/i, '');

	// The LaTeXML edition is dramatically better than PDF text when it exists:
	// real headings, real math, no column interleaving.
	try {
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
	const { extractPdfText } = await import('./pdf');
	const text = await extractPdfText(buf);
	return {
		arxivId: id,
		source: 'pdf',
		text: text.slice(0, maxChars),
		chars: text.length,
		truncated: text.length > maxChars
	};
}
