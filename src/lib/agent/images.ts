import { bus } from '$lib/xray/bus.svelte';
import { keys } from '$lib/state/keys.svelte';
import { createInstrumentedFetch } from '$lib/xray/wire';
import { replay, replayTransport } from '$lib/xray/replay.svelte';
import { assets, thumbnail } from '$lib/storage/assets.svelte';

/**
 * Image generation.
 *
 * This is the one place the app talks to OpenAI without LangChain in the
 * middle, because there is no `gpt-image-2` wrapper to go through. It is kept
 * behind this single function so the Azure swap later is one file, and it still
 * goes through the instrumented fetch — so the X-ray sees this traffic exactly
 * like it sees the model calls.
 *
 * Event shapes verified against a live streamed call, not the docs (which do
 * not list them):
 *   event: image_generation.partial_image
 *     { type, b64_json, partial_image_index, sequence_number, size, quality,
 *       output_format, background, created_at }
 *   event: image_generation.completed
 *     { …same…, usage: { input_tokens, input_tokens_details, output_tokens } }
 */

export type ImageSize = '1024x1024' | '1536x1024' | '1024x1536' | 'auto';
export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface GenerateImageOptions {
	prompt: string;
	path: string;
	size?: ImageSize;
	quality?: ImageQuality;
	/** How many progressive frames to stream before the final image (0–3). */
	partials?: number;
	signal?: AbortSignal;
}

export interface GeneratedImage {
	path: string;
	bytes: number;
	size: string;
	quality: string;
	partials: number;
	/** An image already lived at this path and was overwritten. */
	replaced: boolean;
	usage?: { input_tokens?: number; output_tokens?: number };
}

const ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits';

export async function generateImage(opts: GenerateImageOptions): Promise<GeneratedImage> {
	const { prompt, path, size = '1024x1024', quality = 'medium', partials = 2, signal } = opts;

	const started = performance.now();
	bus.emit({
		kind: 'image_start',
		scope: 'main',
		path,
		prompt,
		size,
		quality,
		label: path
	});

	// The same interceptor the model calls use, so image traffic appears on the
	// wire plane rather than being invisible — and replays like everything else.
	const instrumented = createInstrumentedFetch(
		bus,
		'main',
		replay.active ? replayTransport : undefined
	);

	const res = await instrumented(ENDPOINT, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${replay.active ? 'sk-replay-fixture' : keys.require()}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model: 'gpt-image-2',
			prompt,
			size,
			quality,
			stream: true,
			partial_images: partials
		}),
		signal
	});

	if (!res.ok || !res.body) {
		const detail = await res.text().catch(() => '');
		throw new Error(
			res.status === 403
				? 'gpt-image-2 requires API organization verification on your OpenAI account.'
				: `Image generation failed (HTTP ${res.status}). ${detail.slice(0, 200)}`
		);
	}

	const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = '';
	let final = '';
	let partialCount = 0;
	let meta: Record<string, unknown> = {};

	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += value;

		let cut: number;
		while ((cut = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, cut);
			buffer = buffer.slice(cut + 2);
			const data = frame
				.split('\n')
				.find((l) => l.startsWith('data:'))
				?.slice(5)
				.trim();
			if (!data || data === '[DONE]') continue;

			let evt: Record<string, unknown>;
			try {
				evt = JSON.parse(data);
			} catch {
				continue;
			}

			const b64 = evt.b64_json as string | undefined;
			if (!b64) continue;
			const dataUrl = `data:image/${evt.output_format ?? 'png'};base64,${b64}`;

			if (evt.type === 'image_generation.partial_image') {
				partialCount++;
				// Thumbnail, not the frame: a partial is ~950KB and the event log
				// keeps it for the life of the run.
				bus.emit({
					kind: 'image_partial',
					scope: 'main',
					path,
					index: (evt.partial_image_index as number) ?? partialCount - 1,
					preview: await thumbnail(dataUrl, 240),
					label: `${path} · frame ${partialCount}`
				});
			} else if (evt.type === 'image_generation.completed') {
				final = dataUrl;
				meta = evt;
			}
		}
	}

	if (!final) throw new Error('Image stream ended without a completed image.');

	const bytes = Math.round((final.length * 3) / 4);
	const replaced = !!(await assets.get(path));
	await assets.put({
		path,
		dataUrl: final,
		kind: 'image',
		bytes,
		createdAt: Date.now(),
		meta: { prompt, size, quality }
	});

	bus.emit({
		kind: 'image_done',
		scope: 'main',
		path,
		preview: await thumbnail(final, 320),
		bytes,
		ms: performance.now() - started,
		label: path
	});

	return {
		path,
		bytes,
		size: String(meta.size ?? size),
		quality: String(meta.quality ?? quality),
		partials: partialCount,
		replaced,
		usage: meta.usage as GeneratedImage['usage']
	};
}

/**
 * Editing an image that already exists.
 *
 * The whole reason this is worth having: an extracted figure is *evidence* and
 * also someone else's copyrighted artwork. Redrawing it in a house style gives a
 * document something publishable without either inventing data or reproducing
 * the original — and doing that with a tool, rather than by hand, is what makes
 * it reliable enough for an agent to reach for.
 *
 * Two paths exist and this takes the direct one. The Responses API can carry an
 * `input_image` in JSON — which the wire plane would show completely, and which
 * was tempting for exactly that reason — but it routes the decision through a
 * model that chooses whether to generate or edit, and it bills as a text call so
 * the ledger's image meter would stop seeing image spend. `/v1/images/edits` is
 * deterministic, and the multipart body it needs is now described on the wire
 * (see describeForm in wire.ts) rather than dropped.
 *
 * Multipart also means no streaming: the edits endpoint does not document
 * `stream: true`, and asking for it returns the whole image in one JSON reply.
 * So there are no partial frames here, and the timeline says so instead of
 * pretending a progressive render happened.
 */
export interface EditImageOptions {
	/** Asset-store path of the image to edit. Must already exist. */
	from: string;
	/** Where to save the result. Same path overwrites; a new path keeps both. */
	path: string;
	prompt: string;
	size?: ImageSize;
	quality?: ImageQuality;
	signal?: AbortSignal;
}

export async function editImage(opts: EditImageOptions): Promise<GeneratedImage> {
	const { from, path, prompt, size = 'auto', quality = 'high', signal } = opts;

	const source = await assets.get(from);
	if (!source) {
		// A miss here is almost always the blind-agent trap: `ls` cannot see the
		// asset store, so an agent that checked with ls concluded the figure was
		// absent. Say which instrument to use instead of just failing.
		throw new Error(
			`No image at ${from}. Images live in the asset store, not the text ` +
				`filesystem — call list_figures to see what actually exists.`
		);
	}

	const started = performance.now();
	bus.emit({
		kind: 'image_start',
		scope: 'main',
		path,
		prompt: `edit of ${from} — ${prompt}`,
		size,
		quality,
		label: path
	});

	const instrumented = createInstrumentedFetch(
		bus,
		'main',
		replay.active ? replayTransport : undefined
	);

	const form = new FormData();
	form.append('model', 'gpt-image-2');
	form.append('prompt', prompt);
	// Named so the field reads as a filename in the multipart description; the
	// extension has to match the blob's type or the API rejects it.
	const blob = await dataUrlToBlob(source.dataUrl);
	form.append('image', blob, fileNameFor(from, blob.type));
	if (size !== 'auto') form.append('size', size);
	if (quality !== 'auto') form.append('quality', quality);

	const res = await instrumented(EDIT_ENDPOINT, {
		method: 'POST',
		// No content-type: the browser must set the multipart boundary itself.
		headers: { authorization: `Bearer ${replay.active ? 'sk-replay-fixture' : keys.require()}` },
		body: form,
		signal
	});

	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(
			res.status === 403
				? 'gpt-image-2 requires API organization verification on your OpenAI account.'
				: `Image edit failed (HTTP ${res.status}). ${detail.slice(0, 200)}`
		);
	}

	// Response shape verified against a live call, not the docs:
	//   { created, background, data: [{ b64_json }], output_format, quality, size,
	//     usage: { input_tokens, input_tokens_details: { image_tokens, text_tokens },
	//              output_tokens, output_tokens_details, total_tokens } }
	const json = (await res.json()) as {
		data?: { b64_json?: string }[];
		output_format?: string;
		usage?: GeneratedImage['usage'];
	};
	const b64 = json.data?.[0]?.b64_json;
	if (!b64) throw new Error('Image edit returned no image.');

	// The reported format, not an assumed one. It answers png today; hardcoding
	// that would mislabel the data URL the moment a request asks for webp, and a
	// mislabelled data URL fails silently in an <img> rather than loudly here.
	const final = `data:image/${json.output_format ?? 'png'};base64,${b64}`;
	const bytes = Math.round((final.length * 3) / 4);
	const replaced = !!(await assets.get(path));
	await assets.put({
		path,
		dataUrl: final,
		kind: 'image',
		bytes,
		createdAt: Date.now(),
		// `editOf` is the provenance a caption needs: a stylised figure must still
		// be attributable to the paper it came from.
		meta: { prompt, size, quality, editOf: from }
	});

	bus.emit({
		kind: 'image_done',
		scope: 'main',
		path,
		preview: await thumbnail(final, 320),
		bytes,
		ms: performance.now() - started,
		label: path
	});

	return {
		path,
		bytes,
		// What the API actually did, which for size: 'auto' is the only way to know.
		size: String((json as { size?: string }).size ?? size),
		quality: String((json as { quality?: string }).quality ?? quality),
		partials: 0,
		replaced,
		usage: json.usage
	};
}

/** data: URL → Blob, without a fetch round-trip through the URL. */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
	const comma = dataUrl.indexOf(',');
	const header = dataUrl.slice(0, comma);
	const type = /data:([^;,]+)/.exec(header)?.[1] ?? 'image/png';
	const binary = atob(dataUrl.slice(comma + 1));
	const buf = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
	return new Blob([buf], { type });
}

/** A filename whose extension matches the blob, since the API validates it. */
function fileNameFor(path: string, type: string): string {
	const stem =
		path
			.split('/')
			.pop()
			?.replace(/\.[^.]+$/, '') || 'image';
	const ext = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png';
	return `${stem}.${ext}`;
}
