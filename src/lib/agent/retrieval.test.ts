import { describe, it, expect } from 'vitest';
import { arxivIdFrom, authorsLine, resolveFigureUrl } from './retrieval';

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
