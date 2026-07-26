import { bus } from '$lib/xray/bus.svelte';
import { keys } from '$lib/state/keys.svelte';
import { createInstrumentedFetch } from '$lib/xray/wire';
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
	usage?: { input_tokens?: number; output_tokens?: number };
}

const ENDPOINT = 'https://api.openai.com/v1/images/generations';

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
	// wire plane rather than being invisible.
	const instrumented = createInstrumentedFetch(bus, 'main');

	const res = await instrumented(ENDPOINT, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${keys.require()}`,
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
		usage: meta.usage as GeneratedImage['usage']
	};
}
