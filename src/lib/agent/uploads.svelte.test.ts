import { describe, it, expect } from 'vitest';
import { assets, setAssetScope } from '$lib/storage/assets.svelte';
import { attachStored, manifest } from './uploads';

/**
 * Attaching something the run already produced.
 *
 * The routes are the interesting part and the reason this is tested rather
 * than eyeballed: a text file is already in the graph's `files` channel, so
 * attaching it adds no bytes anywhere and the manifest just names the path;
 * a picture the AGENT drew is no more readable to the model than one you
 * uploaded, so it still has to ride inside the message as a content block.
 * Getting those two backwards would look identical on screen and be wrong on
 * the wire.
 */
describe('attachStored', () => {
	it('points at a text file instead of copying it', async () => {
		const a = await attachStored('/notes/2401.12345.md', '# Notes\nclaim, method, evidence');
		expect(a.kind).toBe('text');
		expect(a.name).toBe('2401.12345.md');
		expect(a.path).toBe('/notes/2401.12345.md');
		expect(a.dataUrl).toBeUndefined();
		// The manifest names the path; the bytes never enter the message.
		expect(manifest([a])).toContain('/notes/2401.12345.md');
		expect(manifest([a])).not.toContain('claim, method, evidence');
	});

	it('carries an image as pixels, because that is the only way in', async () => {
		setAssetScope(`t-attach-${Math.random().toString(36).slice(2)}`);
		await assets.put({
			path: '/figures/1706-03762-fig1.png',
			dataUrl: 'data:image/png;base64,aGk=',
			kind: 'image',
			bytes: 4096,
			createdAt: Date.now(),
			meta: { arxivId: '1706.03762', source: 'extracted' }
		});

		const a = await attachStored('/figures/1706-03762-fig1.png');
		expect(a.kind).toBe('image');
		expect(a.dataUrl).toBe('data:image/png;base64,aGk=');
		expect(a.text).toBe('');
		expect(manifest([a])).toContain('attached as an image');
	});

	it('refuses an SVG rather than sending markup as a picture', async () => {
		setAssetScope(`t-attach-${Math.random().toString(36).slice(2)}`);
		await assets.put({
			path: '/figures/diagram.svg',
			dataUrl: 'data:image/svg+xml;base64,aGk=',
			kind: 'image',
			bytes: 512,
			createdAt: Date.now()
		});
		await expect(attachStored('/figures/diagram.svg')).rejects.toThrow(/SVG/);
	});

	it('says so when the file is gone', async () => {
		setAssetScope(`t-attach-${Math.random().toString(36).slice(2)}`);
		await expect(attachStored('/figures/never-existed.png')).rejects.toThrow(/not in this/);
	});
});
