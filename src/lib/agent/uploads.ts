import { assets, toBase64, thumbnail } from '$lib/storage/assets.svelte';
import { bus } from '$lib/xray/bus.svelte';

/**
 * Handing the agent a file.
 *
 * Three routes, chosen by what the model can actually do with the bytes:
 *
 *   text  → straight into the virtual filesystem. The agent reads it with the
 *           same `read_file` it uses for its own notes.
 *   pdf   → extracted to text and filed the same way; the original goes to the
 *           asset store so a person can still look at the pages. A PDF is not
 *           something a language model reads — something has to turn it into
 *           text first, and here that something is visible.
 *   image → attached to the next user message as a content block, because that
 *           is the only way pixels reach the model at all. It never becomes a
 *           file, and it costs tokens on every subsequent turn it stays in the
 *           history.
 *
 * The split is worth seeing precisely because it is invisible in most chat
 * apps, where "attach a file" implies the model can read anything.
 */

export type AttachmentKind = 'text' | 'pdf' | 'image';

export interface Attachment {
	kind: AttachmentKind;
	name: string;
	/** Where it landed in the virtual filesystem, for text and pdf. */
	path: string;
	bytes: number;
	/** Extracted text, for text and pdf. */
	text: string;
	/** A data: URL, for images — this is what goes on the wire. */
	dataUrl?: string;
	/** First-page previews, for pdf. */
	pages?: string[];
}

const TEXT_EXT = /\.(md|markdown|txt|csv|tsv|json|ya?ml|tex|bib|py|ts|js|html?|css|sql|sh|toml|ini|log)$/i;

/** Filesystem-safe, collision-resistant, still recognisable. */
function slug(name: string): string {
	return name
		.replace(/\.[^.]+$/, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48) || 'file';
}

async function readAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(file);
	});
}

export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;

export async function ingest(file: File): Promise<Attachment> {
	if (file.size > MAX_UPLOAD_BYTES) {
		throw new Error(`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the cap is 24 MB.`);
	}

	const base = slug(file.name);
	const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
	const isImage = file.type.startsWith('image/');

	if (isPdf) {
		const buf = await file.arrayBuffer();
		const { extractPdfText, renderPdfPages } = await import('./pdf');
		const text = await extractPdfText(buf);

		let pages: string[] = [];
		try {
			pages = await renderPdfPages(buf, 4);
		} catch {
			pages = [];
		}

		const path = `/uploads/${base}.pdf`;
		await assets.put({
			path,
			dataUrl: `data:application/pdf;base64,${toBase64(buf)}`,
			kind: 'pdf',
			bytes: buf.byteLength,
			createdAt: Date.now(),
			meta: { pages, uploaded: file.name }
		});

		bus.emit({
			kind: 'upload',
			scope: 'main',
			path,
			mime: 'application/pdf',
			bytes: file.size,
			chars: text.length,
			label: file.name
		});

		return { kind: 'pdf', name: file.name, path, bytes: file.size, text, pages };
	}

	if (isImage) {
		// Downscaled before it ever reaches the wire. A phone photo is several
		// megabytes of base64, it sits in the message history for the rest of the
		// conversation, and it is re-sent — and re-billed — on every turn after.
		const raw = await readAsDataUrl(file);
		const dataUrl = await thumbnail(raw, 1024);
		const path = `/uploads/${base}.png`;

		await assets.put({
			path,
			dataUrl,
			kind: 'image',
			bytes: dataUrl.length,
			createdAt: Date.now(),
			meta: { uploaded: file.name }
		});

		bus.emit({
			kind: 'upload',
			scope: 'main',
			path,
			mime: file.type || 'image/png',
			bytes: file.size,
			chars: 0,
			label: file.name
		});

		return { kind: 'image', name: file.name, path, bytes: file.size, text: '', dataUrl };
	}

	if (!TEXT_EXT.test(file.name) && !file.type.startsWith('text/')) {
		throw new Error(`${file.name} is not something the agent can read. Try a PDF, an image, or text.`);
	}

	const text = await file.text();
	const keepExt = file.name.match(/\.[^.]+$/)?.[0] ?? '.txt';
	const path = `/uploads/${base}${keepExt}`;

	bus.emit({
		kind: 'upload',
		scope: 'main',
		path,
		mime: file.type || 'text/plain',
		bytes: file.size,
		chars: text.length,
		label: file.name
	});

	return { kind: 'text', name: file.name, path, bytes: file.size, text };
}

/** The line appended to the user's message so the agent knows what arrived. */
export function manifest(items: Attachment[]): string {
	if (!items.length) return '';
	const lines = items.map((a) => {
		if (a.kind === 'image') return `- ${a.name} — attached as an image, below.`;
		const what = a.kind === 'pdf' ? 'PDF, text extracted' : 'text file';
		return `- ${a.name} (${what}) → read it at \`${a.path}\` (${a.text.length.toLocaleString()} chars)`;
	});
	return `\n\n[Attached ${items.length} file${items.length > 1 ? 's' : ''}]\n${lines.join('\n')}`;
}
