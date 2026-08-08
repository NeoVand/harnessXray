/**
 * Figures out of a PDF, anchored on their captions.
 *
 * The HTML path (`fetchPaperFigures`) lifts the original image files out of
 * arXiv's LaTeXML edition, which is strictly better when it exists — but it
 * exists only for 2024+ papers, and arXiv rate-limits it. Everything before
 * that, every legacy id, and every PDF a person drags into the app had no path
 * at all: the app could read a paper's words and never show its pictures.
 *
 * The naive fix — walk the PDF's image XObjects — is wrong for research papers
 * and the failure is instructive. Most figures in this literature are *vector*:
 * TikZ, matplotlib, PGF. They contain no image XObject to find. And the ones
 * that are raster are usually several images composed into one figure, so a
 * per-image loop emits four disconnected panels where the paper has one figure.
 *
 * So this works the other way round. Find "Figure N:" in the text layer, and
 * treat it as the anchor: the figure is the ink directly above its caption,
 * within the caption's own horizontal span. That span is also what solves
 * two-column layout for free — a full-width figure has a full-width caption —
 * and the caption itself is the metadata we wanted anyway, so the attribution a
 * review needs comes out of the same pass.
 *
 * "Ink" comes from pdf.js v6's operation recorder: rendering with
 * `recordOperations: true` populates `page.recordedBBoxes`, a per-operator
 * bounding box in canvas space. Vector strokes and raster paints both land
 * there, which is why one mechanism covers both kinds of figure. Text glyphs do
 * not, which is exactly right: prose must not look like a picture.
 *
 * Every guard below is here because it failed without it on a real paper, and
 * they are named in the code rather than tuned silently.
 */

export interface Rect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** One text row of the page, in canvas pixels. */
export interface Row extends Rect {
	text: string;
	/** Font height, used as the page's unit of "a little bit". */
	lh: number;
	/** The individual items the row was stitched from, left to right. */
	items: Box[];
}

export interface Box extends Rect {
	text: string;
	lh: number;
	baseline: number;
}

export interface PdfFigure {
	/** 1-based page it was found on. */
	page: number;
	/** "Figure 3", as the paper writes it. */
	label: string;
	/** The paper's own caption, wrapped lines rejoined. */
	caption: string;
	dataUrl: string;
	bytes: number;
	width: number;
	height: number;
}

export interface PdfFigureResult {
	figures: PdfFigure[];
	/** Captions that were found but produced nothing, and why. Never silent. */
	skipped: string[];
	/** Pages that carried a figure caption at all. */
	scanned: number;
}

/**
 * A caption, strictly.
 *
 * The punctuation after the number is not optional. Without it "Fig. 7 shows
 * that…" and "(Fig. 3). When…" both read as captions, and each one anchors a
 * crop in the middle of a paragraph.
 */
const CAPTION_RE = /^(figure|fig\.?)\s*(\d+(?:\.\d+)*)\s*[.:]/i;
/** Anything that ends the region above a caption — including another figure. */
const BLOCK_RE = /^(figure|fig\.?|table|algorithm)\s*\d+(?:\.\d+)*\s*[.:]/i;
/**
 * A caption describes something, so it has words after the label.
 *
 * Without this, "Fig. 4." opening a sentence in body prose is a caption, and it
 * anchors a crop in the middle of a paragraph. Ten characters is short enough
 * that a terse real caption survives.
 */
const CAPTION_MIN_TAIL = 10;

export interface TextItem {
	str: string;
	transform: number[];
	width: number;
	height: number;
}

/** Text items grouped into rows, in canvas pixels with y growing downward. */
export function rowsOf(
	items: TextItem[],
	viewport: { transform: number[]; scale: number },
	util: { transform(a: number[], b: number[]): number[] }
): Row[] {
	const boxes: Box[] = [];
	for (const it of items) {
		if (!it.str || !it.str.trim()) continue;
		const t = util.transform(viewport.transform, it.transform);
		const lh = Math.hypot(t[2], t[3]) || it.height * viewport.scale;
		const x0 = t[4];
		const baseline = t[5];
		boxes.push({
			text: it.str,
			lh,
			baseline,
			x0,
			x1: x0 + it.width * viewport.scale,
			// A descender hangs below the baseline; a cap-height sits above it.
			y0: baseline - lh,
			y1: baseline + lh * 0.22
		});
	}

	boxes.sort((a, b) => a.baseline - b.baseline || a.x0 - b.x0);

	const pageWidth = Math.max(...boxes.map((b) => b.x1), 1);
	const rows: Row[] = [];
	let run: Box[] = [];

	/**
	 * A run of items sharing a baseline, split at wide horizontal gaps.
	 *
	 * This is the two-column fix, and it is not optional. Papers here are two
	 * columns, and a caption line in the left column shares its baseline with a
	 * line of body prose in the right one — so stitching purely by baseline gives
	 * the caption a full-page x-span, the band becomes the whole page, and the
	 * crop for ResNet's Figure 3 came back containing Figure 3 *and* the right
	 * column's prose. A gap wider than a couple of line heights is a gutter, not
	 * word spacing.
	 */
	const flush = () => {
		if (!run.length) return;
		const sorted = [...run].sort((a, b) => a.x0 - b.x0);
		// Measured, not guessed: the gutter between ResNet's two columns is 45px at
		// scale 2 on a 1224px page, and the caption row that ran across it is the
		// bug this exists for. Anything looser than this misses it.
		const gutter = Math.max(sorted[0].lh * 1.6, pageWidth * 0.025);
		let seg: Box[] = [sorted[0]];
		for (const b of sorted.slice(1)) {
			if (b.x0 - seg[seg.length - 1].x1 > gutter) {
				rows.push(rowOf(seg));
				seg = [];
			}
			seg.push(b);
		}
		if (seg.length) rows.push(rowOf(seg));
		run = [];
	};

	for (const b of boxes) {
		const prev = run[run.length - 1];
		if (prev && Math.abs(b.baseline - prev.baseline) > Math.max(prev.lh, b.lh) * 0.5) flush();
		run.push(b);
	}
	flush();
	// Segments are emitted per baseline, so the array is only roughly ordered.
	// Everything downstream walks it as a page read top to bottom.
	rows.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
	return rows;
}

/** One row from a set of items sharing a baseline. */
function rowOf(items: Box[]): Row {
	const sorted = [...items].sort((a, b) => a.x0 - b.x0);
	// A PDF encodes the space between two runs as *position*, not as a character,
	// so joining the strings gives "Figure 1:Generative adversarial nets are
	// trained by simultaneously updating thediscriminative distribution". A gap
	// wider than a fifth of the font size is a space.
	let text = '';
	for (let i = 0; i < sorted.length; i++) {
		const b = sorted[i];
		const prev = sorted[i - 1];
		if (prev && b.x0 - prev.x1 > prev.lh * 0.2 && !/\s$/.test(text) && !/^\s/.test(b.text))
			text += ' ';
		text += b.text;
	}
	return {
		items: sorted,
		text: text.replace(/\s+/g, ' ').trim(),
		lh: Math.max(...sorted.map((b) => b.lh)),
		x0: Math.min(...sorted.map((b) => b.x0)),
		x1: Math.max(...sorted.map((b) => b.x1)),
		y0: Math.min(...sorted.map((b) => b.y0)),
		y1: Math.max(...sorted.map((b) => b.y1))
	};
}

/**
 * The caption rows of a page.
 *
 * Stitching a row by baseline is right for prose and wrong at exactly the wrong
 * moment: a figure's own in-picture labels routinely share a baseline with the
 * caption underneath it, so the stitched row reads "0 2 4 6 Figure 1. Training
 * error…" and no regex anchored at the start will ever match it. ResNet's
 * Figure 1 disappeared for precisely this reason while the text layer held a
 * clean item saying `Figure 1. Training error (left) and test error (right)…`.
 *
 * So: try the whole row, and failing that, look for an item that starts a
 * caption and rebuild the row from there rightward. The x-span narrows to the
 * caption's real span, which is what the region finder wants anyway.
 */
export function captionsOf(rows: Row[]): Row[] {
	const reads = (r: Row) => {
		const m = CAPTION_RE.exec(r.text);
		return !!m && r.text.length >= m[0].length + CAPTION_MIN_TAIL;
	};
	const out: Row[] = [];
	for (const r of rows) {
		if (reads(r)) {
			out.push(r);
			continue;
		}
		const at = r.items.findIndex((it) => CAPTION_RE.test(it.text.trim()));
		if (at < 0) continue;
		const row = rowOf(r.items.slice(at));
		if (reads(row)) out.push(row);
	}
	return out;
}

/**
 * The drawing operations that count as ink.
 *
 * Paths and image paints, never text. Names are looked up rather than listed as
 * numbers because the opcode values are pdf.js internals, and any that a future
 * version drops simply falls out of the set instead of aliasing another op.
 */
const INK_OPS = [
	'constructPath',
	'rawFillPath',
	'fill',
	'eoFill',
	'stroke',
	'closeStroke',
	'fillStroke',
	'eoFillStroke',
	'closeFillStroke',
	'closeEOFillStroke',
	'shadingFill',
	'paintImageXObject',
	'paintImageXObjectRepeat',
	'paintInlineImageXObject',
	'paintImageMaskXObject',
	'paintImageMaskXObjectRepeat'
];

interface BBoxReader {
	length: number;
	isEmpty(i: number): boolean;
	minX(i: number): number;
	minY(i: number): number;
	maxX(i: number): number;
	maxY(i: number): number;
}

/** Per-operator bounding boxes, converted to canvas pixels and filtered. */
function inkOf(fnArray: number[], bb: BBoxReader | null, ops: Set<number>, w: number, h: number) {
	const out: Rect[] = [];
	if (!bb) return out;
	// The tracker is sized from a streaming operator list, so it can be SHORTER
	// than the op array it describes. Reading past it returns garbage boxes.
	const n = Math.min(fnArray.length, bb.length ?? 0);
	for (let i = 0; i < n; i++) {
		if (!ops.has(fnArray[i]) || bb.isEmpty(i)) continue;
		const x0 = bb.minX(i);
		const y0 = bb.minY(i);
		const x1 = bb.maxX(i);
		const y1 = bb.maxY(i);
		// The page background: a white rectangle covering everything, which would
		// make every region the whole page.
		if (x1 - x0 > 0.97 && y1 - y0 > 0.97) continue;
		out.push({ x0: x0 * w, y0: y0 * h, x1: x1 * w, y1: y1 * h });
	}
	return out;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
	Math.min(a1, b1) - Math.max(a0, b0);

/**
 * The caption and its wrapped continuation lines.
 *
 * A caption is a paragraph, and the paper's own words are the whole point of
 * extracting rather than generating — so the rest of it has to come along.
 */
export function captionBlock(cap: Row, rows: Row[]): { text: string; bottom: number } {
	const parts = [cap.text];
	let bottom = cap.y1;
	for (const r of rows) {
		if (r === cap || r.y0 < bottom - r.lh * 0.2) continue;
		// Consecutive lines of one paragraph very nearly touch, so anything with
		// half a line of air under it is a different block. Loosen this and GAN's
		// Figure 3 caption runs on into the table printed underneath it.
		if (r.y0 > bottom + r.lh * 0.6) break;
		if (overlap(r.x0, r.x1, cap.x0, cap.x1) < r.lh) continue;
		if (BLOCK_RE.test(r.text)) break;
		parts.push(r.text);
		bottom = r.y1;
		if (parts.join(' ').length > 600) break;
	}
	return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), bottom };
}

/**
 * The region a caption points at: the ink cluster directly above it.
 *
 * Returns null when there is nothing above worth cropping, which is the correct
 * answer surprisingly often — a "Figure 4:" continued from the previous page,
 * or a caption whose figure is a table drawn entirely in text.
 */
export function regionFor(cap: Row, rows: Row[], ink: Rect[], w: number, h: number): Rect | null {
	const lh = cap.lh || h * 0.012;
	const bx0 = cap.x0 - lh * 0.8;
	const bx1 = cap.x1 + lh * 0.8;
	const inBand = (r: Rect) => overlap(r.x0, r.x1, bx0, bx1) > (r.x1 - r.x0) * 0.3;

	// Hard ceiling: another figure, table or algorithm caption above us in the
	// same band. Ink above THAT belongs to it, and merging the two is how one
	// crop ends up containing Figure 6, Figure 7 and two tables. The ceiling is
	// the bottom of that caption's whole PARAGRAPH — stopping at its first line
	// leaves the rest of someone else's caption sitting on top of this figure.
	let ceiling = 0;
	for (const r of rows) {
		if (r === cap || r.y1 > cap.y0 - 1 || !inBand(r)) continue;
		if (BLOCK_RE.test(r.text)) ceiling = Math.max(ceiling, captionBlock(r, rows).bottom);
	}
	if (ceiling >= cap.y0) return null;

	const above = ink
		.filter((r) => r.y1 <= cap.y0 + lh * 0.3 && r.y1 > ceiling && inBand(r))
		.sort((a, b) => b.y1 - a.y1);
	if (!above.length) return null;

	// Grow upward through ink that is close enough to be part of the same
	// picture. Two body lines of clear space ends a figure; less than that is a
	// gap between panels.
	const gap = lh * 2.5;
	const box: Rect = { ...above[0] };
	for (const r of above.slice(1)) {
		if (r.y1 < box.y0 - gap) break;
		box.x0 = Math.min(box.x0, r.x0);
		box.x1 = Math.max(box.x1, r.x1);
		box.y0 = Math.min(box.y0, r.y0);
		box.y1 = Math.max(box.y1, r.y1);
	}

	// Text that belongs to the figure — axis ticks, legends, panel letters, the
	// sub-headings over each half of a two-panel figure — is not ink, so the box
	// clips it. Pull those rows in, and repeat: a heading pulled in raises the
	// top, which can admit the heading above it. Bounded, because the thing
	// directly above a figure is eventually prose and prose must not come along.
	for (let pass = 0; pass < 3; pass++) {
		let grew = false;
		for (const r of rows) {
			if (r === cap || BLOCK_RE.test(r.text)) continue;
			if (r.y1 > cap.y0 || r.y0 < ceiling) continue;
			if (r.y1 < box.y0 - lh * 1.3 || r.y0 > box.y1 + lh * 0.6) continue;
			// Narrower than the figure, or genuinely inside it. A row as wide as the
			// whole band sitting above the top edge is a line of the paper's text.
			const inside = overlap(r.x0, r.x1, box.x0, box.x1);
			if (inside <= 0) continue;
			if (r.y1 < box.y0 && r.x1 - r.x0 > (box.x1 - box.x0) * 0.9) continue;
			if (inside < (r.x1 - r.x0) * 0.5) continue;
			const x0 = Math.min(box.x0, r.x0);
			const x1 = Math.max(box.x1, r.x1);
			const y0 = Math.min(box.y0, r.y0);
			const y1 = Math.max(box.y1, r.y1);
			if (x0 !== box.x0 || x1 !== box.x1 || y0 !== box.y0 || y1 !== box.y1) grew = true;
			box.x0 = x0;
			box.x1 = x1;
			box.y0 = y0;
			box.y1 = y1;
		}
		if (!grew) break;
	}

	// Quantised bboxes and half-cut axis labels both want a little air.
	const pad = lh * 0.6;
	const out: Rect = {
		x0: Math.max(0, box.x0 - pad),
		y0: Math.max(ceiling, box.y0 - pad),
		x1: Math.min(w, box.x1 + pad),
		y1: Math.min(cap.y0 - lh * 0.15, box.y1 + pad)
	};

	// Trim anything that reached across a gutter into the paper's prose.
	//
	// A figure that fills one column of a two-column page sits beside body text,
	// and one over-wide path — a clipping rectangle, a rule — is enough to drag
	// the box across the gutter. Once it does, the crop contains the figure AND a
	// column of unrelated paragraphs, which is what ResNet's Figure 3 looked like
	// until this existed. Prose beside the figure, outside the caption's own band,
	// is the boundary; nothing inside the band is touched.
	//
	// After the padding, not before: padding the box back out over the prose we
	// just trimmed is a two-pixel bug that looks exactly like no bug at all.
	for (const r of rows) {
		if (r === cap || r.text.length < 40) continue;
		if (r.y1 <= out.y0 || r.y0 >= out.y1) continue;
		if (overlap(r.x0, r.x1, bx0, bx1) > (r.x1 - r.x0) * 0.5) continue;
		if (r.x0 >= bx1) out.x1 = Math.min(out.x1, r.x0 - lh * 0.5);
		else if (r.x1 <= bx0) out.x0 = Math.max(out.x0, r.x1 + lh * 0.5);
	}

	const rw = out.x1 - out.x0;
	const rh = out.y1 - out.y0;
	// Too thin to be a figure, or so large it is obviously the whole page — which
	// is what over-merging looks like when it happens.
	if (rw < lh * 3 || rh < lh * 1.5) return null;
	if (rh > h * 0.85 && rw > w * 0.85) return null;
	return out;
}

/** Fraction of sampled pixels that are not near-white. */
function inkFraction(ctx: CanvasRenderingContext2D, r: Rect): number {
	const w = Math.max(1, Math.round(r.x1 - r.x0));
	const h = Math.max(1, Math.round(r.y1 - r.y0));
	const data = ctx.getImageData(Math.round(r.x0), Math.round(r.y0), w, h).data;
	let marked = 0;
	let seen = 0;
	// Every 7th pixel: enough to tell a blank crop from a drawing, cheap enough
	// to run on every candidate.
	for (let i = 0; i < data.length; i += 4 * 7) {
		seen++;
		if (data[i] < 244 || data[i + 1] < 244 || data[i + 2] < 244) marked++;
	}
	return seen ? marked / seen : 0;
}

/**
 * Pull every figure out of a PDF's bytes.
 *
 * Only pages whose text layer actually contains a caption are rendered, which
 * is what keeps this affordable: a thirty-page paper renders the six pages that
 * have pictures on them.
 */
export async function extractPdfFigures(
	data: ArrayBuffer,
	{ max = 6, maxPages = 24, scale = 2 } = {}
): Promise<PdfFigureResult> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const ops = new Set<number>(
		INK_OPS.map((k) => (pdfjs.OPS as unknown as Record<string, number>)[k]).filter(
			(v) => typeof v === 'number'
		)
	);

	// getDocument consumes the buffer, so hand it a copy.
	const task = pdfjs.getDocument({ data: data.slice(0) });
	const doc = await task.promise;
	const figures: PdfFigure[] = [];
	const skipped: string[] = [];
	let scanned = 0;

	try {
		for (let p = 1; p <= Math.min(doc.numPages, maxPages) && figures.length < max; p++) {
			const page = await doc.getPage(p);
			const viewport = page.getViewport({ scale });
			const content = await page.getTextContent();
			const rows = rowsOf(content.items as unknown as TextItem[], viewport, pdfjs.Util);
			const captions = captionsOf(rows);
			if (!captions.length) continue;
			scanned++;

			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(viewport.width);
			canvas.height = Math.ceil(viewport.height);
			const ctx = canvas.getContext('2d', { willReadFrequently: true });
			if (!ctx) break;
			// Papers render black-on-transparent otherwise, and every crop would
			// come back as a silhouette.
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);

			const list = await page.getOperatorList();
			await page.render({ canvas, canvasContext: ctx, viewport, recordOperations: true }).promise;
			const ink = inkOf(
				list.fnArray as unknown as number[],
				page.recordedBBoxes as BBoxReader | null,
				ops,
				canvas.width,
				canvas.height
			);

			for (const cap of captions) {
				if (figures.length >= max) break;
				// Canonical, not verbatim: a paper writes "Fig. 4." in one place and
				// "Figure 4:" in another for the same figure, and two spellings of one
				// label means two files and a duplicate that dedup cannot see.
				const label = `Figure ${CAPTION_RE.exec(cap.text)?.[2] ?? figures.length + 1}`;
				// A label seen twice is a cross-reference that read as a caption, not a
				// second figure. The first one wins: captions come in page order, and
				// the real caption is the one that sits under the drawing.
				if (figures.some((f) => f.label === label)) {
					skipped.push(`${label} (p${p}): a second caption with this label — ignored`);
					continue;
				}
				const region = regionFor(cap, rows, ink, canvas.width, canvas.height);
				if (!region) {
					skipped.push(`${label} (p${p}): no drawing found above the caption`);
					continue;
				}
				if (inkFraction(ctx, region) < 0.02) {
					skipped.push(`${label} (p${p}): the region above the caption is blank`);
					continue;
				}

				const w = Math.round(region.x1 - region.x0);
				const h = Math.round(region.y1 - region.y0);
				const crop = document.createElement('canvas');
				crop.width = w;
				crop.height = h;
				const cctx = crop.getContext('2d');
				if (!cctx) continue;
				cctx.fillStyle = '#fff';
				cctx.fillRect(0, 0, w, h);
				cctx.drawImage(canvas, Math.round(region.x0), Math.round(region.y0), w, h, 0, 0, w, h);

				const dataUrl = crop.toDataURL('image/png');
				figures.push({
					page: p,
					label,
					caption: captionBlock(cap, rows).text,
					dataUrl,
					// A data URL is base64 of the bytes plus a short prefix.
					bytes: Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4),
					width: w,
					height: h
				});
			}
		}
		return { figures, skipped, scanned };
	} finally {
		// pdf.js v6 removed PDFDocumentProxy.destroy — the loading task owns teardown.
		await task.destroy();
	}
}
