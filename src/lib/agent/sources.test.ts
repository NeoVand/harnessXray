import { describe, it, expect, beforeEach } from 'vitest';
import { sources } from './sources';
import type { PaperHit } from './retrieval';

/**
 * The registry's one job: make `cite` refuse what the run cannot vouch for.
 * Both refusal modes matter — the never-seen paper (hallucinated reference)
 * and the seen-but-unread one (an abstract dressed up as a reading).
 */

const hit = (arxivId: string, title: string): PaperHit => ({
	arxivId,
	title,
	authors: ['Ada Lovelace', 'Charles Babbage'],
	year: 2024,
	citations: 42,
	abstract: '…',
	url: ''
});

describe('source registry', () => {
	beforeEach(() => {
		// A fresh scope is a fresh registry (no localStorage outside the browser).
		sources.setScope(`t-${Math.random().toString(36).slice(2)}`);
	});

	it('refuses papers the run has never seen', () => {
		const res = sources.cite('9999.99999');
		expect(res.ok).toBe(false);
		expect(res.text).toContain('not in this run');
	});

	it('refuses papers only seen as search snippets', () => {
		sources.registerHits([hit('2401.11111', 'Snippets Are Not Readings')]);
		const res = sources.cite('2401.11111');
		expect(res.ok).toBe(false);
		expect(res.text).toContain('never read');
	});

	it('cites read papers with a stable number and canonical inline form', () => {
		sources.registerHits([hit('2401.11111', 'First'), hit('2402.22222', 'Second')]);
		sources.markFetched('2402.22222');
		const res = sources.cite('2402.22222');
		expect(res.ok).toBe(true);
		expect(res.text).toContain('(Lovelace et al., 2024, arXiv:2402.22222)');
		expect(res.text).toContain('[S2]'); // numbered by first appearance, not by fetch order
	});

	it('builds the bibliography from what was cited', () => {
		sources.registerHits([hit('2401.11111', 'First'), hit('2402.22222', 'Second')]);
		sources.markFetched('2401.11111');
		sources.cite('2401.11111');
		const bib = sources.bibliography();
		expect(bib).toContain('[S1]');
		expect(bib).toContain('arXiv:2401.11111');
		expect(bib).not.toContain('2402.22222'); // seen but never cited nor read
	});

	it('a direct fetch without a search still registers', () => {
		sources.markFetched('2403.33333');
		expect(sources.cite('2403.33333').ok).toBe(true);
	});

	/**
	 * A model knows SWE-bench is 2310.06770 and dispatches a reader straight at
	 * the id. That skipped the only path that recorded a title, so a live run
	 * produced a reference list reading `Unknown authors (n.d.). (title not
	 * recorded).` for three of its four papers — while the fetch had the header
	 * in its hands the whole time.
	 */
	describe('a paper fetched straight by id', () => {
		it('names itself from what the fetch read off the paper', () => {
			sources.markFetched('2310.06770', {
				title: 'SWE-bench: Can Language Models Resolve Real-World GitHub Issues?',
				authors: ['Carlos E. Jimenez', 'John Yang']
			});
			sources.cite('2310.06770');
			const bib = sources.bibliography();
			expect(bib).toContain('Carlos E. Jimenez, John Yang');
			expect(bib).toContain('SWE-bench');
			expect(bib).not.toContain('Unknown authors');
			expect(bib).not.toContain('title not recorded');
		});

		it('cites by family name whichever order the source wrote it in', () => {
			// An index that answers "Jimenez, Carlos E." used to be cited as
			// "(E. et al., …)" — the last whitespace token of a comma-first name.
			sources.markFetched('2310.06770', {
				title: 'SWE-bench',
				authors: ['Jimenez, Carlos E.', 'John Yang']
			});
			expect(sources.cite('2310.06770').text).toContain('(Jimenez et al., 2023,');
		});

		it('dates itself from its own identifier', () => {
			// The id states the submission month, so `(n.d.)` was never necessary
			// and the year always agrees with the id printed beside it.
			sources.markFetched('2310.06770', { title: 'T', authors: ['A B'] });
			expect(sources.get('2310.06770')?.year).toBe(2023);
			expect(sources.cite('2310.06770').text).toContain('(B, 2023, arXiv:2310.06770)');
		});

		it('still cites by id alone when nothing could name it', () => {
			// Honest, and better than typesetting a shrug.
			sources.markFetched('2403.33333');
			expect(sources.cite('2403.33333').text).toContain('(arXiv:2403.33333)');
		});
	});

	it('never overwrites a search hit with thinner metadata', () => {
		sources.registerHits([hit('2401.11111', 'The Canonical Title')]);
		sources.markFetched('2401.11111', { title: 'a scraped h1', authors: ['Someone Else'] });
		const s = sources.get('2401.11111');
		expect(s?.title).toBe('The Canonical Title');
		expect(s?.authors).toEqual(['Ada Lovelace', 'Charles Babbage']);
	});

	it('knows when a source still cannot name itself', () => {
		sources.markFetched('2405.15793');
		expect(sources.needsMetadata('2405.15793')).toBe(true);
		sources.markFetched('2405.15793', { title: 'SWE-agent', authors: ['John Yang'] });
		expect(sources.needsMetadata('2405.15793')).toBe(false);
		// Never seen at all is also "needs metadata" — the caller may be about to
		// register it.
		expect(sources.needsMetadata('9999.99999')).toBe(true);
	});
});
