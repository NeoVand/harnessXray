import { describe, it, expect } from 'vitest';
import { assets, setAssetScope } from '$lib/storage/assets.svelte';
import { listFiguresTool } from './tools';

/**
 * The agent's eyes on the asset store. Binaries never enter the text
 * filesystem — that is the design — so `ls` showing nothing is not evidence
 * of anything. This tool is the instrument that can actually answer "does
 * this figure exist", and the run that regenerated (and then deleted) a
 * perfectly good image is why it must keep working.
 */
describe('list_figures', () => {
	it('reports generated and extracted images with their provenance', async () => {
		setAssetScope(`t-test-${Math.random().toString(36).slice(2)}`);
		await assets.put({
			path: '/figures/banner.png',
			dataUrl: 'data:image/png;base64,aGk=',
			kind: 'image',
			bytes: 2048,
			createdAt: Date.now(),
			meta: { prompt: 'A technical diagram of a verifier loop' }
		});
		await assets.put({
			path: '/figures/2602-22296-fig1.png',
			dataUrl: 'data:image/png;base64,aGk=',
			kind: 'image',
			bytes: 4096,
			createdAt: Date.now(),
			meta: { arxivId: '2602.22296', caption: 'Gains on Qwen', source: 'extracted' }
		});

		const out = (await listFiguresTool.invoke({})) as string;
		expect(out).toContain('/figures/banner.png');
		expect(out).toContain('generated');
		expect(out).toContain('/figures/2602-22296-fig1.png');
		expect(out).toContain('extracted from arXiv:2602.22296');
	});

	it('says plainly when nothing exists', async () => {
		setAssetScope(`t-empty-${Math.random().toString(36).slice(2)}`);
		const out = (await listFiguresTool.invoke({})) as string;
		expect(out).toContain('No images exist');
	});
});
