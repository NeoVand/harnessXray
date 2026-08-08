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
import { labFetch } from '$lib/xray/replay.svelte';

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

interface OaLocation {
	pdf_url?: string;
	landing_page_url?: string;
}

export function arxivIdFrom(work: Record<string, unknown>): string | null {
	// Every location, not just the primary one. For published papers OpenAlex
	// promotes the journal to primary_location and the arXiv record slides down
	// the list — checking only the front row is how a paper with a perfectly
	// readable preprint came back "(no arXiv id — cannot be read)".
	const primary = work.primary_location as OaLocation | null;
	const rest = (work.locations as OaLocation[] | undefined) ?? [];
	const candidates = [
		primary?.pdf_url,
		primary?.landing_page_url,
		...rest.flatMap((l) => [l?.pdf_url, l?.landing_page_url]),
		work.doi as string | undefined
	];
	for (const c of candidates) {
		if (!c) continue;
		const m =
			c.match(new RegExp(`arxiv\\.org\\/(?:abs|pdf)\\/${ARXIV_ID}`, 'i')) ??
			c.match(new RegExp(`arxiv\\.${ARXIV_ID}`, 'i'));
		if (m) return m[1];
	}
	return null;
}

/**
 * The year an arXiv id itself states.
 *
 * OpenAlex reports `publication_year`, which for a preprint that later ran in a
 * journal is the JOURNAL's year. The app cites by arXiv id, so the two
 * disagreed in print: a live run produced "Cheng et al., 2026, arXiv:2401.03428"
 * — a paper whose identifier says January 2024 in the first four digits. The
 * agent was faithful to what we handed it; what we handed it was internally
 * contradictory, and a reader who checks the id is the person the citation is
 * for.
 *
 * Both id schemes encode the submission month. Modern is `YYMM.NNNNN` from
 * 2007-04 on; legacy is `archive/YYMMNNN`, which ran from 1991 to 2007 — so
 * `91`–`99` is the 1990s and everything else is the 2000s.
 */
export function arxivYear(id: string): number | null {
	const m = id.match(/^(?:[a-z-]+(?:\.[A-Z]{2})?\/)?(\d{2})(\d{2})/);
	if (!m) return null;
	const yy = Number(m[1]);
	const mm = Number(m[2]);
	if (mm < 1 || mm > 12) return null;
	return yy >= 91 ? 1900 + yy : 2000 + yy;
}

/**
 * Authors, formatted so the one that matters survives.
 *
 * "First et al." erased exactly the name a "latest paper by X" question needs
 * — in Tenenbaum-style fields the senior author is listed LAST. Short lists
 * print whole; long ones keep both ends.
 */
export function authorsLine(authors: string[]): string {
	if (!authors.length) return 'unknown';
	if (authors.length <= 3) return authors.join(', ');
	return `${authors[0]} … ${authors[authors.length - 1]} (${authors.length} authors)`;
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
	sort: string,
	author: string | null
): Promise<PaperHit[]> {
	const filters = ['type:article'];
	if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`);
	// `search=` matches title/abstract TEXT — an author's name in it finds
	// papers that mention them, not papers by them. Author queries need the
	// author filter, which is a different index entirely. Commas would read as
	// filter separators, so they cannot ride along.
	if (author) filters.push(`raw_author_name.search:${author.replace(/,/g, ' ')}`);

	const params = new URLSearchParams({
		per_page: String(Math.min(limit * 3, 50)),
		filter: filters.join(','),
		select:
			'id,doi,title,publication_year,cited_by_count,authorships,primary_location,locations,abstract_inverted_index'
	});
	if (query.trim()) params.set('search', query);
	if (sort === 'citations') params.set('sort', 'cited_by_count:desc');
	// publication_date, not publication_year: "latest" is a day-granular question.
	if (sort === 'recency') params.set('sort', 'publication_date:desc');

	const res = await labFetch(`https://api.openalex.org/works?${params}`);
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
	return (json.results ?? []).map((w) => {
		const arxivId = arxivIdFrom(w);
		return {
			arxivId,
			title: String(w.title ?? 'Untitled'),
			// 25, not 6: the senior author on a ten-name paper is the one a reader
			// asks about, and slicing at six silently deleted them.
			authors: ((w.authorships as { author?: { display_name?: string } }[] | undefined) ?? [])
				.slice(0, 25)
				.map((a) => a.author?.display_name ?? '')
				.filter(Boolean),
			// The id's year wins when there is an id, because the id is what gets
			// printed beside it. `publication_year` stays the answer for anything
			// we cite by DOI instead.
			year: (arxivId && arxivYear(arxivId)) || ((w.publication_year as number) ?? null),
			citations: (w.cited_by_count as number) ?? 0,
			abstract: deInvertAbstract(w.abstract_inverted_index as Record<string, number[]>),
			url: String(w.id ?? '')
		};
	});
}

/**
 * Fallback source.
 *
 * Crossref is CORS-open and rate-limited per *second* (3/s) rather than per
 * day, so it keeps working when OpenAlex's quota is gone. It carries no
 * abstracts and only yields an arXiv id when the DOI is an arXiv one — a
 * genuinely worse result, which is why it is the fallback and not the default.
 */
async function searchCrossref(
	query: string,
	limit: number,
	author: string | null
): Promise<PaperHit[]> {
	const params = new URLSearchParams({
		rows: String(Math.min(limit * 2, 30)),
		select: 'DOI,title,issued,is-referenced-by-count,author,abstract'
	});
	if (query.trim()) params.set('query.bibliographic', query);
	if (author) params.set('query.author', author);
	const res = await labFetch(`https://api.crossref.org/works?${params}`, {
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
				(doi && arxivIdFromDoi(doi) && arxivYear(arxivIdFromDoi(doi) as string)) ||
				(((it.issued as { 'date-parts'?: number[][] } | undefined)?.['date-parts']?.[0]?.[0] as
					number | undefined) ??
					null),
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
	author?: string | null;
}): Promise<PaperHit[] & { source?: string }> {
	const { query, limit = 8, fromYear = null, sort = 'relevance', author = null } = opts;
	const key = `oa:${query}|${limit}|${fromYear}|${sort}|${author ?? ''}`;

	const hits = await cached(key, async () => {
		try {
			return {
				source: 'OpenAlex',
				hits: await searchOpenAlex(query, limit, fromYear, sort, author)
			};
		} catch (e) {
			if (!(e instanceof QuotaError)) throw e;
			// Degrade rather than fail: a worse source beats no source.
			return {
				source: 'Crossref (OpenAlex quota spent)',
				hits: await searchCrossref(query, limit, author)
			};
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

export interface ExtractedFigure {
	path: string;
	caption: string;
	bytes: number;
}

/**
 * Resolve a figure src against the page it appeared on.
 *
 * arXiv's LaTeXML pages come in two shapes and only one of them works under
 * plain browser semantics, which is why extraction silently produced nothing
 * for a whole class of papers:
 *
 *   src "2602.22296v1/x1.png" on page /html/2602.22296v1  — repeats the
 *       versioned directory. Browser semantics (drop the last segment, then
 *       resolve) is exactly right.
 *   src "x1.png" or "pic/image.png" on page /html/2401.02385 — relative to the
 *       paper's own directory. Browser semantics drops "2401.02385" as though
 *       it were a filename and asks for /html/x1.png, which does not exist.
 *
 * So the last path segment is a directory unless the src already names it. Both
 * shapes verified live against arxiv.org: every case below returns 200
 * image/png, and the old rule returned nothing at all for the second.
 *
 * Exported pure so the geometry stays pinned by a test instead of by luck.
 */
export function resolveFigureUrl(src: string, pageUrl: string): string {
	if (/^https?:/i.test(src)) return src;
	const page = new URL(pageUrl);
	// Version-insensitively, because the page is routinely version-less while the
	// src names "…v1" — that mismatch is the whole reason the two shapes exist.
	const bare = (seg: string) => seg.replace(/v\d+$/, '');
	const last = page.pathname.replace(/\/+$/, '').split('/').pop() ?? '';
	const first = src.replace(/^\.?\//, '').split('/')[0];
	const dir =
		bare(first) === bare(last)
			? page.pathname.replace(/[^/]*$/, '') // the src carries the directory
			: page.pathname.replace(/\/*$/, '/'); // the page IS the directory
	return new URL(src, new URL(dir, page.origin)).href;
}

/**
 * Put one figure in the asset store and announce it.
 *
 * Both extraction paths end here, so a figure from a 2024 HTML edition and a
 * figure cropped out of a 1997 PDF are the same kind of thing downstream: same
 * store, same `source: 'extracted'` provenance, same timeline row with a
 * preview. `list_figures` and the report-writer's checklist never have to know
 * which route a picture took.
 */
async function saveFigure(fig: {
	path: string;
	dataUrl: string;
	bytes: number;
	arxivId: string;
	caption: string;
}): Promise<ExtractedFigure> {
	const { assets, thumbnail } = await import('$lib/storage/assets.svelte');
	const { bus } = await import('$lib/xray/bus.svelte');
	await assets.put({
		path: fig.path,
		dataUrl: fig.dataUrl,
		kind: 'image',
		bytes: fig.bytes,
		createdAt: Date.now(),
		meta: { arxivId: fig.arxivId, caption: fig.caption, source: 'extracted' }
	});
	bus.emit({
		kind: 'figure_extracted',
		scope: 'main',
		arxivId: fig.arxivId,
		path: fig.path,
		caption: fig.caption,
		preview: await thumbnail(fig.dataUrl, 320),
		bytes: fig.bytes,
		label: fig.path
	});
	return { path: fig.path, caption: fig.caption, bytes: fig.bytes };
}

/**
 * Lift the real figures out of a paper's HTML edition.
 *
 * `htmlToText` deliberately drops everything that is not prose; this walks the
 * same LaTeXML page for the part it drops. Each `<figure>` carries the actual
 * image asset and the paper's own `<figcaption>` — which means a review can
 * embed the genuine figure with attribution instead of describing it from
 * memory. HTML editions exist for 2024+ papers only; older papers get an
 * honest refusal rather than a scrape attempt.
 */
export async function fetchPaperFigures(
	arxivId: string,
	max = 6
): Promise<{ figures: ExtractedFigure[]; note: string }> {
	const id = arxivId.trim().replace(/^arxiv:/i, '');
	if (id.includes('/')) {
		return {
			figures: [],
			note: `arXiv:${id} is a legacy id — it predates the HTML edition, so its figures cannot be extracted. Only the PDF text is available.`
		};
	}

	let res: Response;
	try {
		res = await labFetch(`https://arxiv.org/html/${id}`);
	} catch {
		// A refused connection, not a status — the burst-limiter makes this
		// rare, but when it happens the model gets words, not a detonation.
		return {
			figures: [],
			note: `arxiv.org refused the connection while fetching figures for ${id} — usually rate limiting after many parallel fetches. Continue without these figures, or retry later.`
		};
	}
	if (!res.ok) {
		return {
			figures: [],
			note: `arXiv:${id} has no HTML edition (HTTP ${res.status}) — usually a pre-2024 paper. Figures cannot be extracted.`
		};
	}

	const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
	const nodes = [...doc.querySelectorAll('figure.ltx_figure')];
	if (!nodes.length)
		return { figures: [], note: `The HTML edition of arXiv:${id} contains no figures.` };

	const { toBase64 } = await import('$lib/storage/assets.svelte');
	const slug = id.replace(/\//g, '-').replace(/\./g, '-');

	const figures: ExtractedFigure[] = [];
	let firstFailure = '';
	for (const fig of nodes) {
		if (figures.length >= max) break;
		const img = fig.querySelector('img');
		const src = img?.getAttribute('src');
		if (!src) continue;

		const caption = (fig.querySelector('figcaption')?.textContent ?? '')
			.replace(/\s+/g, ' ')
			.trim();

		try {
			const imgRes = await labFetch(
				resolveFigureUrl(src, res.url || `https://arxiv.org/html/${id}`)
			);
			if (!imgRes.ok) {
				firstFailure ||= `HTTP ${imgRes.status} for ${src}`;
				continue;
			}
			const mime = imgRes.headers.get('content-type') ?? 'image/png';
			const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
			const buf = await imgRes.arrayBuffer();
			const dataUrl = `data:${mime};base64,${toBase64(buf)}`;
			const path = `/figures/${slug}-fig${figures.length + 1}.${ext}`;
			figures.push(
				await saveFigure({ path, dataUrl, bytes: buf.byteLength, arxivId: id, caption })
			);
		} catch (e) {
			// One unfetchable figure should not sink the rest — but its reason
			// must survive, or the failure reads as superstition.
			firstFailure ||= e instanceof Error ? e.message : String(e);
		}
	}

	return figures.length
		? { figures, note: '' }
		: {
				figures: [],
				note: `Found ${nodes.length} figures in arXiv:${id} but none could be downloaded (first error: ${firstFailure || 'none had a usable src'}).`
			};
}

/** The PDF bytes for a paper: the copy we already kept, or a fresh download. */
async function pdfBytesFor(id: string): Promise<ArrayBuffer> {
	const { assets, fromDataUrl } = await import('$lib/storage/assets.svelte');
	const stored = await assets.get(`/papers/${id.replace(/\//g, '-')}.pdf`);
	// fetch_paper keeps the PDF it downloaded, so a paper already read costs
	// nothing to extract from — and cannot be rate-limited on the second ask.
	if (stored?.dataUrl) return fromDataUrl(stored.dataUrl);

	let res: Response;
	try {
		res = await labFetch(`https://arxiv.org/pdf/${id}`);
	} catch {
		throw new Error(
			`arxiv.org refused the connection while fetching the PDF of ${id} — usually rate ` +
				`limiting after many parallel fetches. Wait a moment and retry.`
		);
	}
	if (!res.ok) throw new Error(`Could not download the PDF of arXiv:${id} (HTTP ${res.status}).`);
	return res.arrayBuffer();
}

/**
 * Figures out of anything: an arXiv id, or a PDF already in the store.
 *
 * Two routes, tried in the order of how good the result is. arXiv's HTML
 * edition holds the publisher's own image files and its own `<figcaption>`, so
 * when it exists nothing beats it. It exists for 2024+ papers only, which used
 * to be the end of the story — a pre-2024 paper, a legacy id, or a PDF someone
 * dragged into the app all got a refusal.
 *
 * The PDF route covers the rest by cropping the rendered page around each
 * caption. It is a redrawing of the page rather than the original asset, which
 * is why it is second — but it works on vector figures, on scanned-era layouts,
 * and on any file at all, and it recovers the paper's real caption either way.
 */
export async function extractFigures(
	source: string,
	max = 6
): Promise<{ figures: ExtractedFigure[]; note: string; via: 'html' | 'pdf' | 'none' }> {
	const raw = source.trim().replace(/^arxiv:/i, '');

	// A path means a file already in the store — an upload, or a paper we kept.
	// There is no arXiv id to attribute to, so the file's own name stands in.
	if (raw.startsWith('/')) {
		const { assets, fromDataUrl } = await import('$lib/storage/assets.svelte');
		const asset = await assets.get(raw);
		if (!asset)
			return { figures: [], note: `No file at ${raw}. Check list_figures or ls.`, via: 'none' };
		if (asset.kind !== 'pdf')
			return {
				figures: [],
				note: `${raw} is not a PDF — figures can only be cut out of a PDF.`,
				via: 'none'
			};
		const id =
			String(asset.meta?.arxivId ?? '') || (raw.split('/').pop() ?? raw).replace(/\.pdf$/i, '');
		return fromPdf(fromDataUrl(asset.dataUrl), id, max);
	}

	const html = await fetchPaperFigures(raw, max);
	if (html.figures.length) return { ...html, via: 'html' };

	try {
		const out = await fromPdf(await pdfBytesFor(raw), raw, max);
		// The HTML attempt's reason still matters when the PDF found nothing
		// either — otherwise the model is told only about the second failure.
		if (!out.figures.length) return { ...out, note: `${html.note} ${out.note}`.trim() };
		return out;
	} catch (e) {
		const why = e instanceof Error ? e.message : String(e);
		return { figures: [], note: `${html.note} ${why}`.trim(), via: 'none' };
	}
}

/** The PDF route: crop each caption's figure out of the rendered page. */
async function fromPdf(
	bytes: ArrayBuffer,
	id: string,
	max: number
): Promise<{ figures: ExtractedFigure[]; note: string; via: 'pdf' | 'none' }> {
	const { extractPdfFigures } = await import('./pdf-figures');
	const { figures: found, skipped, scanned } = await extractPdfFigures(bytes, { max });
	if (!found.length) {
		return {
			figures: [],
			note: scanned
				? `Found figure captions on ${scanned} page(s) of ${id} but could not cut out a figure: ` +
					`${skipped.slice(0, 3).join('; ')}.`
				: `No figure captions were found in the text layer of ${id} — it may be a scanned PDF, ` +
					`or its figures may be labelled in a way this cannot read.`,
			via: 'none'
		};
	}

	const slug = id.replace(/\//g, '-').replace(/\./g, '-');
	const out: ExtractedFigure[] = [];
	for (const f of found) {
		const n = f.label.match(/\d+/)?.[0] ?? String(out.length + 1);
		out.push(
			await saveFigure({
				path: `/figures/${slug}-fig${n}.png`,
				dataUrl: f.dataUrl,
				bytes: f.bytes,
				arxivId: id,
				caption: f.caption
			})
		);
	}
	return {
		figures: out,
		note: skipped.length ? `Skipped: ${skipped.slice(0, 3).join('; ')}.` : '',
		via: 'pdf'
	};
}

/** Strip an arXiv LaTeXML page down to readable text, keeping section structure. */
function htmlToText(html: string): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	doc
		.querySelectorAll('script,style,nav,footer,.ltx_bibliography,.ltx_page_footer')
		.forEach((n) => n.remove());
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
		const res = await labFetch(`https://arxiv.org/html/${id}`);
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

	let res: Response;
	try {
		res = await labFetch(`https://arxiv.org/pdf/${id}`);
	} catch {
		throw new Error(
			`arxiv.org refused the connection for ${id} — usually rate limiting after many parallel ` +
				`fetches. Wait a moment and retry, or pick a different paper.`
		);
	}
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
		/* the initialiser already is the fallback */
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
