import { describe, it, expect } from 'vitest';
import { checkQuote, MIN_QUOTE_CHARS } from './paper-text';

/**
 * Quote verification, pinned.
 *
 * This is the one citation check that needs no model: "does the paper contain
 * this sentence" has a right answer. It exists because the critic could only
 * ever compare a draft against `/notes/*.md` — a model's paraphrase — which is
 * one LLM checking another LLM's summary, the pattern the literature is
 * clearest about not working.
 *
 * The tests are mostly about tolerance. Too strict and it refuses honest
 * quotes, which would be far worse than not checking at all: the agent would
 * learn to stop quoting.
 */

// As a PDF extraction actually delivers it — spaces missing where the encoder
// used position instead, a ligature, a curly apostrophe.
const PAPER = `arXiv:2310.06770v3 [cs.CL] 11 Apr 2024

SWE-bench: Can Language Models Resolve Real-World GitHub Issues?

Abstract
Language models have outpaced our ability to evaluate them effectively, but
for their future development it is critical to study the frontier of their
capabilities. We find real-world software engineering to be a rich,
sustainable, and challenging testbed.

3 Evaluation
Wefindthatresolving SWE-bench task instances requires understanding and
coordinating changes across multiple functions, classes and files. The agent's
patch is applied and the repository's own tests decide the outcome.`;

describe('checkQuote', () => {
	it('finds a sentence the paper contains', () => {
		const r = checkQuote('real-world software engineering to be a rich, sustainable', PAPER);
		expect(r.status).toBe('found');
	});

	it('hands back the surrounding text, not just a boolean', () => {
		// The interesting failure is a real sentence supporting something it does
		// not say — so the caller needs to see the quote in situ.
		const r = checkQuote('outpaced our ability to evaluate them effectively', PAPER);
		if (r.status !== 'found') throw new Error('expected found');
		expect(r.context).toContain('Language models have outpaced');
		expect(r.context).toContain('critical to study the frontier');
		// Collapsed to one line, so it reads in a tool result.
		expect(r.context).not.toContain('\n');
	});

	it('survives the spaces a PDF drops', () => {
		// The paper says "Wefindthatresolving"; the quote is typed properly.
		const r = checkQuote('We find that resolving SWE-bench task instances requires', PAPER);
		expect(r.status).toBe('found');
	});

	it('survives punctuation and case differences', () => {
		const r = checkQuote('THE AGENTS PATCH IS APPLIED AND THE REPOSITORYS OWN TESTS', PAPER);
		expect(r.status).toBe('found');
	});

	it('refuses a sentence the paper does not contain', () => {
		// Plausible, on-topic, and not in the paper — the exact failure mode.
		const r = checkQuote(
			'SWE-bench demonstrates that language models now exceed human engineers',
			PAPER
		);
		expect(r.status).toBe('absent');
	});

	it('refuses a quote too short to be evidence', () => {
		// "the agent" is in every paper in the corpus.
		expect(checkQuote('the agent', PAPER).status).toBe('too-short');
		expect(checkQuote('a'.repeat(MIN_QUOTE_CHARS - 1), PAPER).status).toBe('too-short');
	});

	it('says so when there is no text rather than passing or failing', () => {
		// A run restored from storage, or a paper cited from a snippet. Refusing
		// here would accuse an honest citation; passing silently would lie about
		// having checked.
		const r = checkQuote('a quote long enough to clear the minimum bar for checking', undefined);
		expect(r.status).toBe('no-text');
	});

	it('checks against the whole paper, not the truncated read', () => {
		// `fetch_paper` gives the model `maxChars`; the store keeps everything. A
		// quote from past the cut must still verify, or a long paper would produce
		// false accusations.
		const tail = 'a conclusion sentence that sits well past any truncation point';
		const long = 'x '.repeat(20_000) + tail;
		expect(checkQuote(tail, long).status).toBe('found');
	});
});
