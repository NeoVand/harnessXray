import { describe, it, expect } from 'vitest';
import { enrichBody, linkify } from './enrich';

/**
 * The figure pipeline, pinned against the bug that hid inside it.
 *
 * A live run wrote a tutorial with ten extracted paper figures and rendered
 * exactly one — the generated banner. The other nine were broken images
 * pointing at `/figures/…`, a virtual path no server can serve, and nothing
 * threw: no console error, no failing test, just pictures that were not there.
 *
 * The difference between the one that worked and the nine that did not was the
 * caption. `linkify` ran over the whole document first, and a caption that
 * cites its source — which is every figure in a paper — carries an `arXiv:` id
 * *inside the alt text*. Linkifying that inserts a `]`, the figure regex that
 * ran next stopped at it, and the path was never resolved.
 *
 * So these tests are mostly about captions.
 */

/** Stands in for the asset store: only these paths have bytes behind them. */
const STORE: Record<string, string> = {
	'/figures/2405-15793-fig1.png': 'data:image/png;base64,AAAA',
	'/figures/banner.png': 'data:image/png;base64,BBBB'
};
const resolve = (dest: string) => STORE[dest] ?? dest;

describe('enrichBody', () => {
	it('resolves a figure whose caption cites the paper it came from', () => {
		const out = enrichBody(
			'![Figure 1: SWE-agent is an LM interacting with a computer. Figure from arXiv:2405.15793.](/figures/2405-15793-fig1.png)',
			resolve
		);
		expect(out).toContain('](data:image/png;base64,AAAA)');
		// The citation stays plain text: alt is an attribute, not prose.
		expect(out).toContain('Figure from arXiv:2405.15793.]');
		expect(out).not.toContain('https://arxiv.org');
	});

	it('resolves a figure whose caption names another figure path', () => {
		// What stylize_figure writes — the redrawn picture, crediting the crop it
		// was drawn from. Two virtual paths in one image, one of them inside the
		// alt text.
		const out = enrichBody(
			'![Redrawn after arXiv:2405.15793; original evidence: `/figures/2405-15793-fig1.png`.](/figures/banner.png)',
			resolve
		);
		expect(out).toContain('](data:image/png;base64,BBBB)');
		expect(out).not.toContain('](hx:');
	});

	it('still linkifies citations and paths in the prose around a figure', () => {
		const out = enrichBody(
			'See arXiv:2310.06770.\n\n![cap](/figures/banner.png)\n\nWritten to /paper/review.md.',
			resolve
		);
		expect(out).toContain('[arXiv:2310.06770](https://arxiv.org/abs/2310.06770)');
		expect(out).toContain('](hx:/paper/review.md)');
	});

	it('leaves a destination it cannot resolve exactly as written', () => {
		// A figure the agent named before generating it still renders as a broken
		// image — but as the SAME broken image, so the next asset-store bump
		// resolves it rather than a mangled path that never can.
		const out = enrichBody('![cap](/figures/not-yet.png)', resolve);
		expect(out).toBe('![cap](/figures/not-yet.png)');
	});

	it('does not touch external images', () => {
		const out = enrichBody('![cap](https://example.com/x.png)', resolve);
		expect(out).toBe('![cap](https://example.com/x.png)');
	});

	it('resolves every figure in a document, not just the first', () => {
		// The image matcher is a module-level /g regex; a leaked lastIndex would
		// make the second document start mid-way and silently drop its openers.
		const doc = '![a](/figures/banner.png)\n\ntext\n\n![b](/figures/2405-15793-fig1.png)';
		for (const _ of [1, 2]) {
			const out = enrichBody(doc, resolve);
			expect(out).toContain('data:image/png;base64,BBBB');
			expect(out).toContain('data:image/png;base64,AAAA');
		}
	});
});

describe('linkify', () => {
	it('leaves a citation the model already wrote as a link alone', () => {
		const already = '[arXiv:2310.06770](https://arxiv.org/abs/2310.06770)';
		expect(linkify(already)).toBe(already);
	});

	it('stops a path at the end of its sentence', () => {
		// `.` belongs in the path (extensions), and a path is usually the last
		// thing in its sentence — so the greedy read linked a file that does not
		// exist and the link did nothing when clicked.
		expect(linkify('Written to /paper/review.md.')).toBe(
			'Written to [`/paper/review.md`](hx:/paper/review.md).'
		);
	});

	it('links a path followed by other punctuation', () => {
		expect(linkify('See /notes/2310.06770.md, then stop.')).toContain(
			'[`/notes/2310.06770.md`](hx:/notes/2310.06770.md),'
		);
	});
});
