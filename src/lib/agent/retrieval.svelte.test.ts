import { afterEach, describe, it, expect, vi } from 'vitest';
import { parseHtmlPaper, searchPapers } from './retrieval';
import { cached, clearSearchCache } from './search-cache';

/**
 * The header of an arXiv HTML edition, which used to be parsed and thrown away.
 *
 * `htmlToText` built a DOM, kept the prose and dropped the title and authors —
 * so the source registry only ever learned a paper's name from
 * `search_papers`, and a run that went straight to an id it already knew
 * produced `Unknown authors (n.d.). (title not recorded).` in its references.
 *
 * Real LaTeXML shape, including the parts that make naive extraction wrong: an
 * author's affiliation and email live inside the same `.ltx_personname` as the
 * name, on the lines after it.
 */
const PAGE = `<!doctype html>
<html><head><title>SWE-agent — arXiv</title></head>
<body>
  <div class="ltx_page_content">
    <h1 class="ltx_title ltx_title_document">SWE-agent: Agent-Computer Interfaces
      Enable Automated Software Engineering</h1>
    <div class="ltx_authors">
      <span class="ltx_creator ltx_role_author">
        <span class="ltx_personname">John Yang
          Princeton University
          byjohnyang@princeton.edu</span>
      </span>
      <span class="ltx_creator ltx_role_author">
        <span class="ltx_personname">Carlos E. Jimenez
          Princeton University</span>
      </span>
    </div>
    <h2 class="ltx_title">1 Introduction</h2>
    <p>Language model agents are increasingly used to automate software tasks, and the
       interface they are given turns out to matter as much as the model.</p>
    <ul><li>An editor with linting feedback.</li></ul>
    <div class="ltx_bibliography"><p>[1] Someone else entirely, 1999.</p></div>
  </div>
</body></html>`;

describe('parseHtmlPaper', () => {
	it('uses a custom title block instead of an erroneous page-caption title', () => {
		const out =
			parseHtmlPaper(`<html><head><title>1LeJEPA overview. A long figure caption.</title></head>
		<body><div class="ltx_page_content"><article class="ltx_document">
		<div class="ltx_logical-block"><div class="ltx_para">
		<p class="ltx_p ltx_align_center"><span class="ltx_text ltx_font_bold">LeJEPA: Provable and Scalable
		<br>Self-Supervised Learning Without the Heuristics</span></p></div></div>
		<section><h2>Introduction</h2><p>Body</p></section></article></div></body></html>`);
		expect(out.title).toBe(
			'LeJEPA: Provable and Scalable Self-Supervised Learning Without the Heuristics'
		);
	});

	it('keeps display equations in reading order and emits inline TeX only once', () => {
		const out = parseHtmlPaper(String.raw`<div class="ltx_page_content">
		<p>Before <math alttext="z_i"><semantics><mi>z</mi><annotation encoding="application/x-tex">z_i</annotation></semantics></math>.</p>
		<table class="ltx_equation"><tr><td><math display="block" alttext="L = L_{pred} + \lambda L_{SIGReg}"><mi>L</mi></math></td></tr></table>
		<p>After <math display="block"><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math>.</p>
		</div>`);
		expect(out.text).toBe(String.raw`Before $z_i$.
$$L = L_{pred} + \lambda L_{SIGReg}$$
After $$x^2$$.`);
	});

	it('removes affiliation superscripts and email addresses from author names', () => {
		const out = parseHtmlPaper(
			'<div class="ltx_creator"><span class="ltx_personname">Adrien Bardes<sup>1</sup></span><span class="ltx_text">author@example.org</span></div>'
		);
		expect(out.authors).toEqual(['Adrien Bardes']);
	});
	it('reads the title off the document', () => {
		expect(parseHtmlPaper(PAGE).title).toBe(
			'SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering'
		);
	});

	it('reads the authors, and only the names', () => {
		// The affiliation and the email are in the same element as the name.
		expect(parseHtmlPaper(PAGE).authors).toEqual(['John Yang', 'Carlos E. Jimenez']);
	});

	it('still returns the prose, with its structure', () => {
		const { text } = parseHtmlPaper(PAGE);
		expect(text).toContain('## 1 Introduction');
		expect(text).toContain('- An editor with linting feedback.');
		// The reference list is the paper's, not ours — it would blow the budget
		// and it is not what a reader was asked to summarise.
		expect(text).not.toContain('Someone else entirely');
	});

	it('degrades to the page title rather than nothing', () => {
		// Pre-LaTeXML or hand-rolled pages have no `.ltx_title_document`.
		const plain =
			'<html><head><title>A Paper</title></head><body><p>' + 'x'.repeat(600) + '</p></body></html>';
		const out = parseHtmlPaper(plain);
		expect(out.title).toBe('A Paper');
		expect(out.authors).toEqual([]);
	});

	it('names nothing rather than guessing when there is no header at all', () => {
		const out = parseHtmlPaper('<html><body><p>bare</p></body></html>');
		expect(out.title).toBe('');
		expect(out.authors).toEqual([]);
	});
});

describe('preprint search', () => {
	afterEach(async () => {
		vi.unstubAllGlobals();
		await clearSearchCache();
	});
	it('includes preprints and bypasses cached article-only results', async () => {
		await clearSearchCache();
		await cached('oa:SIGReg|8|2025|relevance|', async () => ({ source: 'OpenAlex', hits: [] }));
		const transport = vi.fn<typeof fetch>().mockResolvedValue(
			Response.json({
				results: [
					{
						title: 'Weak-SIGReg: Covariance Regularization for Stable Deep Learning',
						doi: 'https://doi.org/10.48550/arxiv.2603.05924',
						publication_year: 2026,
						cited_by_count: 0,
						authorships: [],
						primary_location: null,
						locations: [],
						abstract_inverted_index: null
					}
				]
			})
		);
		vi.stubGlobal('fetch', transport);
		const hits = await searchPapers({ query: 'SIGReg', fromYear: 2025 });
		expect(hits[0].arxivId).toBe('2603.05924');
		const url = new URL(String(transport.mock.calls[0][0]));
		expect(url.searchParams.get('filter')).toBe(
			'type:article|preprint,from_publication_date:2025-01-01'
		);
	});
});
