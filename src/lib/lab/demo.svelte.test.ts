import { afterEach, expect, it } from 'vitest';
import { base } from '$app/paths';
import { parseFixture, replay } from '$lib/xray/replay.svelte';
import { searchPapers } from '$lib/agent/retrieval';

afterEach(() => replay.stop());

it('replays every bundled search through the current retrieval code', async () => {
	const response = await fetch(`${base}/fixtures/demo.json`);
	expect(response.ok).toBe(true);
	const fixture = parseFixture(await response.text());
	replay.start(fixture);
	const searches = fixture.web.filter(
		(entry) => new URL(entry.url).hostname === 'api.openalex.org'
	);
	expect(searches).toHaveLength(6);
	for (const entry of searches) {
		const params = new URL(entry.url).searchParams;
		const hits = await searchPapers({
			query: params.get('search')!,
			limit: Number(params.get('per_page')) / 3,
			fromYear: Number(/from_publication_date:(\d{4})/.exec(params.get('filter')!)![1]),
			sort: params.get('sort')?.startsWith('publication_')
				? 'recency'
				: params.get('sort') === 'cited_by_count:desc'
					? 'citations'
					: 'relevance'
		});
		expect(hits.length).toBeGreaterThan(0);
	}
});
