import { assets, toBase64, thumbnail, fromDataUrl } from '$lib/storage/assets.svelte';
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

const TEXT_EXT =
	/\.(md|markdown|txt|csv|tsv|json|ya?ml|tex|bib|py|ts|js|html?|css|sql|sh|toml|ini|log)$/i;

/** Filesystem-safe, collision-resistant, still recognisable. */
function slug(name: string): string {
	return (
		name
			.replace(/\.[^.]+$/, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'file'
	);
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
		throw new Error(
			`${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the cap is 24 MB.`
		);
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
			/* the initialiser already is the fallback */
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
		throw new Error(
			`${file.name} is not something the agent can read. Try a PDF, an image, or text.`
		);
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

/**
 * Attach something the app already holds.
 *
 * The counterpart to `ingest`, for a file the run itself produced — a note, an
 * extracted figure, a paper it downloaded. Pointing at one of those in the
 * files panel and saying "this one" is a thing people kept trying to do by
 * pasting the path into the message, and a path in prose is a suggestion the
 * model can misread. Staging it as an attachment makes it the same object an
 * upload is, with the same manifest line.
 *
 * The three routes are the ones `ingest` documents, and the reason they still
 * apply is the point worth seeing: a picture the agent MADE is no more readable
 * to the model than one you uploaded. It still has to ride inside the message
 * as a content block, and it still costs tokens on every turn afterwards. A
 * text file, meanwhile, is already in the graph's `files` channel — attaching
 * it adds no bytes to anything, it just tells the agent which one you mean.
 *
 * `text` is passed in rather than read from the session so this module stays
 * ignorant of the session (which imports it). Nothing is emitted on the
 * timeline: an upload crosses a boundary and earns a row, while this is a file
 * the run already has.
 */
export async function attachStored(path: string, text?: string): Promise<Attachment> {
	const name = path.split('/').pop() || path;

	// A text file in the virtual filesystem, including agent-written SVG.
	if (typeof text === 'string' && text.length) {
		return { kind: 'text', name, path, bytes: text.length, text };
	}

	const asset = await assets.get(path);
	if (!asset) throw new Error(`${path} is not in this conversation any more.`);

	if (asset.kind === 'image') {
		if (/\.svg$/i.test(path)) {
			throw new Error(
				`${name} is an SVG — the model reads it as markup, so open it and attach the source instead.`
			);
		}
		return { kind: 'image', name, path, bytes: asset.bytes, text: '', dataUrl: asset.dataUrl };
	}

	if (asset.kind === 'pdf') {
		// Extracted here rather than at send, for the same reason `ingest` does it
		// on pick: the chip can then say how much text the agent actually gets.
		const { extractPdfText } = await import('./pdf');
		const body = await extractPdfText(fromDataUrl(asset.dataUrl));
		return {
			kind: 'pdf',
			name,
			path,
			bytes: asset.bytes,
			text: body,
			pages: (asset.meta?.pages as string[] | undefined) ?? []
		};
	}

	throw new Error(`${name} is not something the agent can read.`);
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
