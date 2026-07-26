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
});
