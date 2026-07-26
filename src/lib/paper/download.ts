import { assets } from '$lib/storage/assets.svelte';

/**
 * Getting a document out of the app.
 *
 * Markdown is the source and leaves as-is. PDF is produced by printing a
 * rendered copy through the browser rather than by pulling in a PDF library:
 * jsPDF and friends would add ~400KB and still not lay out KaTeX, tables and
 * images correctly, whereas the print engine already renders exactly what the
 * viewer shows. The cost is that the user picks "Save as PDF" in the print
 * dialog — a fair trade for output that matches the screen.
 */

export function downloadMarkdown(path: string, source: string) {
	const name = path.split('/').pop() ?? 'document.md';
	const blob = new Blob([source], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

/** Inline every figure so the printed copy is self-contained. */
function inlineFigures(html: string): string {
	return html.replace(/src="(\/figures\/[^"]+)"/g, (whole, p: string) => {
		const hit = assets.peek(p);
		return hit ? `src="${hit.dataUrl}"` : whole;
	});
}

export function printToPdf(path: string, renderedHtml: string) {
	const name = path.split('/').pop()?.replace(/\.md$/, '') ?? 'document';
	const win = window.open('', '_blank', 'width=900,height=1200');
	if (!win) return;

	// KaTeX needs its stylesheet in the new window, and the print engine will not
	// wait for it unless we hold the print call until load.
	const katexHref =
		[...document.styleSheets]
			.map((s) => s.href)
			.find((h) => h?.includes('katex')) ?? '';

	win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${name}</title>
${katexHref ? `<link rel="stylesheet" href="${katexHref}">` : ''}
<style>
  @page { margin: 22mm 18mm; }
  body {
    font: 11.5pt/1.65 ui-serif, Georgia, 'Times New Roman', serif;
    color: #111; max-width: 46em; margin: 0 auto; padding: 1em;
  }
  h1 { font-size: 1.8em; margin: 0 0 .6em; }
  h2 { font-size: 1.25em; margin: 1.6em 0 .5em; }
  h3 { font-size: 1.05em; margin: 1.3em 0 .4em; }
  img { max-width: 100%; height: auto; display: block; margin: 1.2em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .95em; }
  th, td { border: 1px solid #ccc; padding: .4em .6em; text-align: left; }
  pre { background: #f5f5f5; padding: .7em; overflow-x: auto; font-size: .85em; }
  code { font-family: ui-monospace, Menlo, monospace; font-size: .9em; }
  blockquote { border-left: 3px solid #ddd; margin: 1em 0; padding-left: 1em; color: #555; }
  a { color: #14506e; }
  /* Keep a heading with the text it introduces. */
  h1, h2, h3 { break-after: avoid; }
  img, table, .katex-display { break-inside: avoid; }
</style></head>
<body>${inlineFigures(renderedHtml)}</body></html>`);
	win.document.close();

	win.onload = () => {
		win.focus();
		win.print();
	};
}
