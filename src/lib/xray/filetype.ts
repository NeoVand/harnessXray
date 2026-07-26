import { ICON, type IconValue } from '$lib/icons';

/**
 * What a file looks like, decided once.
 *
 * This used to be inlined in three places as a two-way guess — image or not —
 * which gave a PDF the same glyph as a markdown note and painted a picture with
 * the *sparkles* icon that means "generated image". Worse, the colours were
 * pulled from the `--hx-*` event palette, so a PDF was memory-clay and a PNG
 * was tool-ochre for no reason at all. That palette is a legend: ochre means a
 * tool ran. Borrowing it for file types says something untrue.
 *
 * So file types get their own tokens. They are theme-aware by construction —
 * defined once per scheme in layout.css, and themes only ever change surfaces —
 * and they are free to use the conventional associations a person already has:
 * red for PDF, green for tabular data, violet for pictures.
 */
export interface FileType {
	icon: IconValue;
	/** A CSS custom property, so it follows the theme. */
	color: string;
	label: string;
}

const DOC: FileType = { icon: ICON.doc, color: 'var(--hx-file-doc)', label: 'document' };
const PDF: FileType = { icon: ICON.pdf, color: 'var(--hx-file-pdf)', label: 'PDF' };
const IMAGE: FileType = { icon: ICON.image, color: 'var(--hx-file-image)', label: 'image' };
const DATA: FileType = { icon: ICON.data, color: 'var(--hx-file-data)', label: 'data' };
const CODE: FileType = { icon: ICON.code, color: 'var(--hx-file-code)', label: 'code' };
const PLAIN: FileType = { icon: ICON.text, color: 'var(--hx-file-plain)', label: 'text' };

export function fileType(path: string): FileType {
	const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
	if (/^(png|jpe?g|webp|gif|svg|avif)$/.test(ext)) return IMAGE;
	if (ext === 'pdf') return PDF;
	if (/^(md|markdown|tex|rst)$/.test(ext)) return DOC;
	if (/^(csv|tsv|json|ya?ml|toml)$/.test(ext)) return DATA;
	if (/^(ts|js|tsx|jsx|py|sh|html?|css|sql|bib)$/.test(ext)) return CODE;
	return PLAIN;
}

/** For attachments, which are classified before they have a path extension. */
export function attachmentType(kind: string): FileType {
	if (kind === 'image') return IMAGE;
	if (kind === 'pdf') return PDF;
	return DOC;
}
