/**
 * PDF text extraction, with two-column reconstruction.
 *
 * Academic PDFs are typically two columns, and pdf.js returns text items in
 * document order, not reading order — so a naive join interleaves the columns
 * and produces confident nonsense. The column split below is the approach
 * proven in voicebook against real arXiv PDFs: find the largest horizontal gap
 * per row, and only accept it as a column boundary if enough rows agree.
 */

interface TextItem {
	str: string;
	transform: number[];
}

const COLUMN_GAP = 180; // px in PDF user space — narrower gaps are word spacing
const MIN_ROWS_AGREEING = 0.3;

function pageLines(items: TextItem[]): string[] {
	// Group items into rows by their y coordinate.
	const rows = new Map<number, TextItem[]>();
	for (const it of items) {
		if (!it.str.trim()) continue;
		const y = Math.round(it.transform[5]);
		const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
		(rows.get(key) ?? rows.set(key, []).get(key)!).push(it);
	}

	const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]);

	// Where does the biggest gap fall on each row?
	const candidates: number[] = [];
	for (const [, row] of ordered) {
		const sorted = [...row].sort((a, b) => a.transform[4] - b.transform[4]);
		let best = 0;
		let at = 0;
		for (let i = 1; i < sorted.length; i++) {
			const gap = sorted[i].transform[4] - sorted[i - 1].transform[4];
			if (gap > best) {
				best = gap;
				at = sorted[i - 1].transform[4] + gap / 2;
			}
		}
		if (best > COLUMN_GAP) candidates.push(at);
	}

	const twoColumn = candidates.length >= 3 && candidates.length >= ordered.length * MIN_ROWS_AGREEING;
	const split = twoColumn ? candidates.sort((a, b) => a - b)[Math.floor(candidates.length / 2)] : Infinity;

	const emit = (row: TextItem[]) =>
		[...row]
			.sort((a, b) => a.transform[4] - b.transform[4])
			.map((i) => i.str)
			.join('')
			.replace(/\s+/g, ' ')
			.trim();

	if (!twoColumn) return ordered.map(([, row]) => emit(row)).filter(Boolean);

	// Read the left column top-to-bottom, then the right.
	const left: string[] = [];
	const right: string[] = [];
	for (const [, row] of ordered) {
		const l = row.filter((i) => i.transform[4] < split);
		const r = row.filter((i) => i.transform[4] >= split);
		if (l.length) left.push(emit(l));
		if (r.length) right.push(emit(r));
	}
	return [...left, ...right].filter(Boolean);
}

/** Rejoin hard-wrapped lines into paragraphs. */
function reflow(lines: string[]): string {
	const out: string[] = [];
	for (const line of lines) {
		const prev = out[out.length - 1];
		const continues =
			prev && !/[.!?]["']?$/.test(prev) && /^[a-z(]/.test(line) && !/^[-•]/.test(line);
		if (continues) out[out.length - 1] = `${prev.replace(/-$/, '')}${prev.endsWith('-') ? '' : ' '}${line}`;
		else out.push(line);
	}
	return out.join('\n');
}

/**
 * Render the first few pages to images.
 *
 * A fetched paper is otherwise just a number of characters in a tool result —
 * this is what makes "I read this paper" a *thing you can see*. Rendered at
 * modest scale and JPEG-compressed, because these are card faces, not a reader.
 */
/**
 * Page previews for an already-stored PDF, rendered once and kept.
 *
 * Papers fetched before thumbnails were stored alongside the file have none —
 * but we still hold the bytes, so there is no reason to show a placeholder.
 * Rendered on first view and written back into the asset, so it happens once
 * per document rather than once per glance.
 */
export async function pagesOf(path: string): Promise<string[]> {
	const { assets } = await import('$lib/storage/assets.svelte');
	const asset = await assets.get(path);
	if (!asset) return [];

	const known = asset.meta?.pages;
	if (Array.isArray(known) && known.length) return known as string[];

	try {
		const bin = atob(asset.dataUrl.split(',')[1] ?? '');
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const pages = await renderPdfPages(bytes.buffer, 4);
		if (pages.length) await assets.put({ ...asset, meta: { ...asset.meta, pages } });
		return pages;
	} catch {
		// A preview we cannot draw is not a failure worth reporting — the caller
		// falls back to a plain "read it" row and the document still opens.
		return [];
	}
}

export async function renderPdfPages(
	data: ArrayBuffer,
	count = 4,
	width = 240
): Promise<string[]> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const task = pdfjs.getDocument({ data: data.slice(0) });
	const doc = await task.promise;
	try {
		const out: string[] = [];
		for (let i = 1; i <= Math.min(doc.numPages, count); i++) {
			const page = await doc.getPage(i);
			const base = page.getViewport({ scale: 1 });
			const viewport = page.getViewport({ scale: width / base.width });

			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d');
			if (!ctx) break;
			// Papers render as black-on-transparent otherwise.
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			out.push(canvas.toDataURL('image/jpeg', 0.72));
		}
		return out;
	} finally {
		await task.destroy();
	}
}

export async function extractPdfText(data: ArrayBuffer, maxPages = 30): Promise<string> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	// getDocument consumes the buffer, so hand it a copy.
	const task = pdfjs.getDocument({ data: data.slice(0) });
	const doc = await task.promise;
	try {
		const pages: string[] = [];
		for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
			const page = await doc.getPage(i);
			const content = await page.getTextContent();
			pages.push(reflow(pageLines(content.items as unknown as TextItem[])));
		}
		const text = pages.join('\n\n');
		if (text.replace(/\s/g, '').length < Math.max(24, doc.numPages * 8)) {
			throw new Error('This PDF appears to be scanned images with no text layer.');
		}
		return text;
	} finally {
		// pdf.js v6 removed PDFDocumentProxy.destroy — the loading task owns teardown.
		await task.destroy();
	}
}
