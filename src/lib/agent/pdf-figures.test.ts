import { describe, it, expect } from 'vitest';
import {
	rowsOf,
	captionsOf,
	captionBlock,
	regionFor,
	type Row,
	type TextItem
} from './pdf-figures';

/**
 * The geometry, pinned.
 *
 * Every case here is one that produced a visibly wrong crop against a real
 * paper before the rule that fixes it existed, and each names the paper. The
 * end-to-end behaviour needs a real PDF and a real canvas — these are the parts
 * that can be checked without one, which is most of the decisions.
 */

/** The 3×2 affine multiply pdf.js does; the tests use an identity viewport. */
const util = {
	transform: (a: number[], b: number[]) => [
		a[0] * b[0] + a[2] * b[1],
		a[1] * b[0] + a[3] * b[1],
		a[0] * b[2] + a[2] * b[3],
		a[1] * b[2] + a[3] * b[3],
		a[0] * b[4] + a[2] * b[5] + a[4],
		a[1] * b[4] + a[3] * b[5] + a[5]
	]
};
const viewport = { transform: [1, 0, 0, 1, 0, 0], scale: 1 };

/** A text item at (x, baseline) with a 10px font. */
function item(str: string, x: number, y: number, width: number, lh = 10): TextItem {
	return { str, transform: [lh, 0, 0, lh, x, y], width, height: lh };
}

/** A row built the way the page builder builds one, for the region tests. */
function row(text: string, x0: number, x1: number, baseline: number, lh = 10): Row {
	const box = { text, lh, baseline, x0, x1, y0: baseline - lh, y1: baseline + lh * 0.22 };
	return { text, lh, items: [box], x0, x1, y0: box.y0, y1: box.y1 };
}

describe('rowsOf', () => {
	it('splits a shared baseline at the column gutter', () => {
		// ResNet p4: the caption of Figure 3 sits on the same baseline as a line of
		// the right column's prose. Stitched together, the caption's x-span becomes
		// the whole page and the crop comes back containing both columns.
		const rows = rowsOf(
			[
				item('Figure 3. Example network architectures.', 100, 1279, 400),
				item('18-layer plain net is of a similar form.', 618, 1279, 472)
			],
			{ transform: [1, 0, 0, 1, 0, 0], scale: 1 },
			util
		);
		expect(rows).toHaveLength(2);
		expect(rows[0].text).toMatch(/^Figure 3\./);
		expect(rows[0].x1).toBeLessThan(618);
	});

	it('keeps ordinary word spacing on one row, and restores the missing space', () => {
		// A PDF encodes the space between two runs as position, not as a character,
		// so a plain join gives "Figure 1.Training error…".
		const rows = rowsOf(
			[item('Figure 1.', 100, 200, 60), item('Training error on CIFAR-10.', 168, 200, 200)],
			viewport,
			util
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].text).toBe('Figure 1. Training error on CIFAR-10.');
	});

	it('does not invent a space between abutting runs', () => {
		const rows = rowsOf(
			[item('dis', 100, 200, 20), item('criminative', 120, 200, 60)],
			viewport,
			util
		);
		expect(rows[0].text).toBe('discriminative');
	});

	it('reads top to bottom regardless of item order', () => {
		const rows = rowsOf([item('lower', 100, 400, 50), item('upper', 100, 200, 50)], viewport, util);
		expect(rows.map((r) => r.text)).toEqual(['upper', 'lower']);
	});
});

describe('captionsOf', () => {
	it('finds a caption buried behind the figure’s own axis labels', () => {
		// ResNet p4 again: "0 2 4 6 ... Figure 3. …" — the tick labels share the
		// caption's baseline, so no regex anchored at the start of the row matches.
		const r = rowsOf(
			[
				item('0', 60, 300, 8),
				item('2', 80, 300, 8),
				item('Figure 3. Example network architectures.', 100, 300, 400)
			],
			viewport,
			util
		);
		const caps = captionsOf(r);
		expect(caps).toHaveLength(1);
		expect(caps[0].text).toMatch(/^Figure 3\./);
		// The band narrows to the caption, not the row it was hiding in.
		expect(caps[0].x0).toBe(100);
	});

	it('rejects a cross-reference in prose', () => {
		// "Fig. 7 shows that…" and "(Fig. 3). When…" both used to anchor a crop in
		// the middle of a paragraph. The punctuation rule is what stops them.
		const cases = [
			'Fig. 7 shows that the residual net converges faster than the plain one.',
			'when the dimensions increase (Fig. 3). When the shortcuts are identity'
		];
		for (const text of cases) {
			expect(captionsOf([row(text, 100, 500, 300)])).toHaveLength(0);
		}
	});

	it('rejects a bare label with nothing to describe', () => {
		expect(captionsOf([row('Fig. 4.', 100, 160, 300)])).toHaveLength(0);
	});

	it('reads a multi-part number as one label', () => {
		// GPT-3 numbers its figures 1.1, 1.2, 1.3 — read as "Figure 1" three times,
		// they collapse into one figure and two of them are lost.
		const caps = captionsOf([
			row('Figure 1.3: Aggregate performance across tasks.', 100, 500, 300)
		]);
		expect(caps).toHaveLength(1);
		expect(/^(figure|fig\.?)\s*(\d+(?:\.\d+)*)/i.exec(caps[0].text)?.[2]).toBe('1.3');
	});
});

describe('captionBlock', () => {
	it('rejoins the wrapped lines of one caption', () => {
		const cap = row('Figure 2: Scaled dot-product attention', 100, 400, 300);
		const rows = [
			cap,
			row('and multi-head attention running in parallel.', 100, 400, 312),
			row('This paragraph is body text far below.', 100, 400, 400)
		];
		const out = captionBlock(cap, rows);
		expect(out.text).toBe(
			'Figure 2: Scaled dot-product attention and multi-head attention running in parallel.'
		);
		expect(out.bottom).toBeCloseTo(312 + 2.2, 1);
	});

	it('stops at the next caption', () => {
		const cap = row('Figure 2: The first caption', 100, 400, 300);
		const rows = [cap, row('Figure 3: The next one', 100, 400, 312)];
		expect(captionBlock(cap, rows).text).toBe('Figure 2: The first caption');
	});
});

describe('regionFor', () => {
	const W = 1000;
	const H = 1400;

	it('takes the ink directly above the caption', () => {
		const cap = row('Figure 1: A plot of something.', 100, 500, 800);
		const ink = [
			{ x0: 120, y0: 500, x1: 480, y1: 780 },
			{ x0: 120, y0: 200, x1: 480, y1: 260 } // far above, a different float
		];
		const region = regionFor(cap, [cap], ink, W, H);
		expect(region).not.toBeNull();
		expect(region!.y0).toBeGreaterThan(400);
		expect(region!.y1).toBeLessThan(800);
	});

	it('stops at the caption of the figure above it', () => {
		// p8 of ResNet: without a ceiling, one crop swallowed Figure 6, Figure 7
		// and two tables.
		const above = row('Figure 6: The one before.', 100, 500, 400);
		const cap = row('Figure 7: The one we want.', 100, 500, 800);
		const ink = [
			{ x0: 120, y0: 600, x1: 480, y1: 780 },
			{ x0: 120, y0: 200, x1: 480, y1: 380 } // belongs to Figure 6
		];
		const region = regionFor(cap, [above, cap], ink, W, H);
		expect(region!.y0).toBeGreaterThan(400);
	});

	it('trims prose that sits beside the figure', () => {
		// One over-wide clipping path is enough to drag the box across the gutter.
		const cap = row('Figure 3: Network architectures.', 100, 480, 1200);
		const prose = row(
			'Residual Network. Based on the above plain network, we insert shortcuts.',
			600,
			950,
			400
		);
		const ink = [
			{ x0: 120, y0: 300, x1: 480, y1: 1180 },
			{ x0: 120, y0: 300, x1: 960, y1: 320 } // a rule spanning both columns
		];
		const region = regionFor(cap, [cap, prose], ink, W, H);
		expect(region!.x1).toBeLessThan(600);
	});

	it('returns nothing when there is no drawing above the caption', () => {
		const cap = row('Figure 4: Continued from the previous page.', 100, 500, 300);
		expect(regionFor(cap, [cap], [], W, H)).toBeNull();
	});

	it('refuses a region that is the whole page', () => {
		const cap = row('Figure 1: Everything.', 100, 900, 1380);
		const ink = [{ x0: 5, y0: 5, x1: 995, y1: 1360 }];
		expect(regionFor(cap, [cap], ink, W, H)).toBeNull();
	});
});
