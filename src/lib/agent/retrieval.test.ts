import { describe, it, expect } from 'vitest';
import { arxivIdFrom, arxivYear, authorsLine, resolveFigureUrl } from './retrieval';

/**
 * The two index bugs that made a "latest paper by X" run thrash: the arXiv id
 * hiding in a non-primary location, and the senior author vanishing off the
 * end of a sliced list.
 */

describe('arxivIdFrom', () => {
	it('finds the id in the primary location', () => {
		expect(arxivIdFrom({ primary_location: { pdf_url: 'https://arxiv.org/pdf/2401.04088' } })).toBe(
			'2401.04088'
		);
	});

	it('rescues the id when the journal took the primary slot', () => {
		expect(
			arxivIdFrom({
				primary_location: { landing_page_url: 'https://doi.org/10.1038/s41586-026-1' },
				locations: [
					{ landing_page_url: 'https://www.repository.cam.ac.uk/handle/x' },
					{ landing_page_url: 'https://arxiv.org/abs/2408.12022' }
				]
			})
		).toBe('2408.12022');
	});

	it('falls back to an arXiv DOI, and reads legacy ids', () => {
		expect(arxivIdFrom({ doi: 'https://doi.org/10.48550/arXiv.2402.11111' })).toBe('2402.11111');
		expect(
			arxivIdFrom({ primary_location: { pdf_url: 'https://arxiv.org/pdf/hep-th/9711200' } })
		).toBe('hep-th/9711200');
	});

	it('returns null when there is genuinely no arXiv anywhere', () => {
		expect(
			arxivIdFrom({
				primary_location: { landing_page_url: 'https://doi.org/10.1111/tops.70075' },
				locations: [{ landing_page_url: 'https://europepmc.org/x' }]
			})
		).toBeNull();
	});
});

describe('resolveFigureUrl', () => {
	it('resolves version-carrying relative srcs against a version-less page', () => {
		// The bug that 404'd every figure: the src already contains the versioned
		// directory, and the page URL must resolve by browser rules (strip the
		// last segment), not by having a slash appended.
		expect(
			resolveFigureUrl('2602.22296v1/images/gains_qwen.png', 'https://arxiv.org/html/2602.22296')
		).toBe('https://arxiv.org/html/2602.22296v1/images/gains_qwen.png');
	});

	it('handles absolute paths and versioned pages the same way', () => {
		expect(resolveFigureUrl('/html/2602.22296v1/x1.png', 'https://arxiv.org/html/2602.22296')).toBe(
			'https://arxiv.org/html/2602.22296v1/x1.png'
		);
		expect(resolveFigureUrl('2602.22296v1/x1.png', 'https://arxiv.org/html/2602.22296v1')).toBe(
			'https://arxiv.org/html/2602.22296v1/x1.png'
		);
	});
});

describe('authorsLine', () => {
	it('prints short lists whole', () => {
		expect(authorsLine(['Ada Lovelace'])).toBe('Ada Lovelace');
		expect(authorsLine(['A One', 'B Two', 'C Three'])).toBe('A One, B Two, C Three');
	});

	it('keeps both ends of a long list — the senior author survives', () => {
		const nine = ['First Author', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'Joshua B. Tenenbaum'];
		expect(authorsLine(nine)).toBe('First Author … Joshua B. Tenenbaum (9 authors)');
	});

	it('says unknown when there is nothing to say', () => {
		expect(authorsLine([])).toBe('unknown');
	});
});

describe('resolveFigureUrl — the shape that produced nothing', () => {
	it('treats the page id as a DIRECTORY when the src does not name it', () => {
		// Verified live against arxiv.org: both of these return 200 image/png,
		// and the old browser-semantics rule asked for /html/x1.png — which does
		// not exist, so extraction quietly yielded no figures for every paper
		// whose LaTeXML output uses bare relative srcs.
		expect(resolveFigureUrl('x1.png', 'https://arxiv.org/html/2401.02385')).toBe(
			'https://arxiv.org/html/2401.02385/x1.png'
		);
		expect(resolveFigureUrl('pic/image.png', 'https://arxiv.org/html/2401.02385')).toBe(
			'https://arxiv.org/html/2401.02385/pic/image.png'
		);
	});

	it('keeps working when the page URL already carries a version', () => {
		expect(resolveFigureUrl('x3.png', 'https://arxiv.org/html/2401.02385v2')).toBe(
			'https://arxiv.org/html/2401.02385v2/x3.png'
		);
	});

	it('does not double the directory when the src repeats a versioned id', () => {
		// The two rules meet here: the comparison has to ignore the version, or
		// this lands on /html/2602.22296/2602.22296v1/x1.png.
		expect(resolveFigureUrl('2602.22296v1/x1.png', 'https://arxiv.org/html/2602.22296')).toBe(
			'https://arxiv.org/html/2602.22296v1/x1.png'
		);
	});

	it('passes absolute URLs through untouched', () => {
		expect(resolveFigureUrl('https://cdn.example/x.png', 'https://arxiv.org/html/2401.02385')).toBe(
			'https://cdn.example/x.png'
		);
	});
});

/**
 * The year the citation prints has to be the year its identifier states.
 *
 * OpenAlex answers `publication_year`, which for a preprint that later ran in
 * a journal is the journal's. A live run cited "Cheng et al., 2026,
 * arXiv:2401.03428" — a paper whose id says 2024 in its first four digits —
 * because that is what the registry handed the model. The id is what the
 * reader checks, so the id is what decides the year.
 */
describe('arxivYear', () => {
	it('reads the year off a modern id', () => {
		expect(arxivYear('2401.03428')).toBe(2024);
		expect(arxivYear('2310.06770')).toBe(2023);
	});

	it('reads it off a legacy id, including the 1990s', () => {
		// Landmark papers are overwhelmingly legacy — AdS/CFT is hep-th/9711200.
		expect(arxivYear('hep-th/9711200')).toBe(1997);
		expect(arxivYear('math.AG/0601001')).toBe(2006);
	});

	it('tolerates a version suffix', () => {
		expect(arxivYear('2405.15793v3')).toBe(2024);
	});

	it('refuses anything whose month is not a month', () => {
		// A DOI fragment or a stray number must not become a confident year.
		expect(arxivYear('2499.12345')).toBeNull();
		expect(arxivYear('not-an-id')).toBeNull();
	});
});
