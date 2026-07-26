import { describe, it, expect, afterEach } from 'vitest';
import { labFetch } from '$lib/xray/replay.svelte';
import { searchPapersTool } from './tools';

/**
 * The two halves of the "Failed to fetch" fix: the per-host gate that stops
 * a parallel fan-out from stampeding arxiv.org, and the tool-level catch
 * that turns a refused connection into text the model can route around
 * instead of an exception that kills the graph.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

describe('labFetch host gate', () => {
	it('holds concurrent requests to one host at three', async () => {
		let inFlight = 0;
		let maxInFlight = 0;
		let served = 0;
		const releases: (() => void)[] = [];

		globalThis.fetch = (() => {
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			return new Promise<Response>((resolve) => {
				releases.push(() => {
					inFlight--;
					served++;
					resolve(new Response('ok', { status: 200 }));
				});
			});
		}) as typeof fetch;

		const all = Promise.all(
			Array.from({ length: 6 }, (_, i) => labFetch(`https://gate.example/paper/${i}`))
		);
		await new Promise((r) => setTimeout(r, 20));
		expect(maxInFlight).toBe(3);

		// Draining one admits the next; the ceiling never rises.
		while (releases.length) {
			releases.shift()!();
			await new Promise((r) => setTimeout(r, 5));
			expect(maxInFlight).toBe(3);
		}
		await all;
		expect(served).toBe(6);
	});
});

describe('tool network guard', () => {
	it('returns a refused connection as readable text instead of throwing', async () => {
		globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;

		const out = (await searchPapersTool.invoke({
			// Unique query so the search cache cannot answer from disk.
			query: `gate-test-${Math.random().toString(36).slice(2)}`
		})) as string;

		expect(out).toMatch(/^ERROR: the network refused/);
	});
});
