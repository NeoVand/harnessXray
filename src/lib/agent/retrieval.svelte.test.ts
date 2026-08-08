import { describe, it, expect } from 'vitest';
import { parseHtmlPaper } from './retrieval';

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
