import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateImage, editImage } from './images';
import { assets, setAssetScope } from '$lib/storage/assets.svelte';
import { keys } from '$lib/state/keys.svelte';
import { bus } from '$lib/xray/bus.svelte';

let dataUrl: string;
let scope: string;

beforeEach(() => {
	scope = `image-migration-${crypto.randomUUID()}`;
	setAssetScope(scope);
	bus.clear();
	vi.spyOn(keys, 'require').mockReturnValue('sk-test-image-migration');
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 2;
	dataUrl = canvas.toDataURL('image/png');
});

afterEach(async () => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await assets.dropThread(scope);
	setAssetScope('');
	bus.clear();
});

describe('Flare through the image tools and wire recorder', () => {
	it('streams generation frames and saves the completed image', async () => {
		const frame = (type: string) =>
			`data: ${JSON.stringify({
				type,
				b64_json: dataUrl.split(',')[1],
				output_format: 'png',
				size: '1024x1024',
				quality: 'medium',
				usage: { input_tokens: 10, output_tokens: 20 }
			})}\n\n`;
		const transport = vi
			.fn<typeof fetch>()
			.mockResolvedValue(
				new Response(
					frame('image_generation.partial_image') + frame('image_generation.completed'),
					{ headers: { 'content-type': 'text/event-stream' } }
				)
			);
		vi.stubGlobal('fetch', transport);

		const result = await generateImage({ prompt: 'A research diagram', path: '/figures/test.png' });
		const [url, init] = transport.mock.calls[0];
		expect(url).toBe('https://api.openai.com/v1/images/generations');
		expect(JSON.parse(init!.body as string)).toMatchObject({
			model: 'gpt-image-2.5-flare',
			stream: true,
			partial_images: 2
		});
		expect(result).toMatchObject({ partials: 1, replaced: false, usage: { output_tokens: 20 } });
		expect((await assets.get(result.path))?.dataUrl).toBe(dataUrl);
		expect(bus.events.filter((e) => e.kind === 'image_partial')).toHaveLength(1);
		expect(bus.events.filter((e) => e.kind === 'image_done')).toHaveLength(1);
		const request = bus.events.find((e) => e.kind === 'http_request');
		expect(request?.body).toMatchObject({ model: 'gpt-image-2.5-flare' });
		expect(JSON.stringify(request)).not.toContain('sk-test-image-migration');
	});

	it('edits with Flare multipart input and preserves the original and provenance', async () => {
		await assets.put({
			path: '/figures/source.png',
			dataUrl,
			kind: 'image',
			bytes: 10,
			createdAt: Date.now()
		});
		const transport = vi.fn<typeof fetch>().mockResolvedValue(
			Response.json({
				data: [{ b64_json: dataUrl.split(',')[1] }],
				output_format: 'png',
				size: '1536x1024',
				quality: 'high',
				usage: { output_tokens: 30 }
			})
		);
		vi.stubGlobal('fetch', transport);

		const result = await editImage({
			from: '/figures/source.png',
			path: '/figures/styled.png',
			prompt: 'Simplify the labels'
		});
		const [url, init] = transport.mock.calls[0];
		const form = init!.body as FormData;
		expect(url).toBe('https://api.openai.com/v1/images/edits');
		expect(form.get('model')).toBe('gpt-image-2.5-flare');
		expect(form.get('image')).toBeInstanceOf(File);
		expect((form.get('image') as File).type).toBe('image/png');
		expect(new Headers(init?.headers).has('content-type')).toBe(false);
		expect(result).toMatchObject({ size: '1536x1024', quality: 'high', partials: 0 });
		expect((await assets.get(result.path))?.meta?.editOf).toBe('/figures/source.png');
		expect((await assets.list()).map((a) => a.path)).toEqual([
			'/figures/source.png',
			'/figures/styled.png'
		]);
		expect(bus.events.filter((e) => e.kind === 'image_done')).toHaveLength(1);
	});
});
