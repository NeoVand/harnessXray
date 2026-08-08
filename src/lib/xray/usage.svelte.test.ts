import { describe, it, expect } from 'vitest';
import { EventBus } from './bus.svelte';
import { runTotals } from './usage';
import { splitTokens, costOf, rateFor, CACHE_WRITE_RATE } from '$lib/agent/models';

/**
 * The Run panel's arithmetic, pinned.
 *
 * Two things here are easy to get wrong and expensive to get wrong quietly.
 *
 * Image generation shares the wire with the text calls but bills on a different
 * meter; folding it into the text buckets both mispriced it and let a 120-token
 * image prompt overwrite the context gauge.
 *
 * And the provider's counts *overlap* — cache reads and cache writes are inside
 * `input_tokens`, reasoning is inside `output_tokens`. Treating them as siblings
 * double-counts tokens and, since the rates differ by up to sixty times,
 * produces a bill that looks plausible and is wrong.
 */

function exchange(bus: EventBus, url: string, usage: unknown) {
	const req = bus.emit({
		kind: 'http_request',
		scope: 'main',
		url,
		method: 'POST',
		headers: {},
		body: {},
		bytes: 2,
		label: url
	});
	bus.emit({
		kind: 'http_response',
		scope: 'main',
		httpId: req.id,
		status: 200,
		headers: {},
		streamed: true,
		frames: 1,
		ms: 5,
		rawUsage: usage,
		label: '200'
	});
}

describe('runTotals', () => {
	it('keeps image generation on its own meter', () => {
		const bus = new EventBus();
		exchange(bus, 'https://api.openai.com/v1/responses', {
			input_tokens: 1000,
			input_tokens_details: { cached_tokens: 200 },
			output_tokens: 50
		});
		exchange(bus, 'https://api.openai.com/v1/images/generations', {
			input_tokens: 120,
			output_tokens: 4160
		});

		const t = runTotals(bus, 'gpt-5.6-luna');

		// Text buckets see only the text call.
		expect(t.calls).toBe(1);
		expect(t.input).toBe(1000);
		expect(t.output).toBe(50);
		// The context gauge is the last TEXT input, not the image prompt.
		expect(t.lastInput).toBe(1000);

		// The image meter sees only the image call, priced at $30/1M output.
		expect(t.imageCalls).toBe(1);
		expect(t.imageIn).toBe(120);
		expect(t.imageOut).toBe(4160);
		expect(t.imageUsd).toBeCloseTo((4160 * 30) / 1_000_000, 6);

		// The headline is both spends together.
		const textUsd = (800 * 1.0 + 200 * 0.1 + 50 * 6.0) / 1_000_000;
		expect(t.costUsd).toBeCloseTo(textUsd + t.imageUsd, 6);
	});

	it('an image call after a text call does not disturb the gauge', () => {
		const bus = new EventBus();
		exchange(bus, 'https://api.openai.com/v1/responses', {
			input_tokens: 50_000,
			output_tokens: 10
		});
		exchange(bus, 'https://api.openai.com/v1/images/generations', {
			input_tokens: 90,
			output_tokens: 4000
		});
		expect(runTotals(bus, 'gpt-5.6-luna').lastInput).toBe(50_000);
	});
});

describe('splitTokens', () => {
	it('resolves the overlapping counts into disjoint buckets', () => {
		// 1000 input, of which 600 were a cache hit and 150 of the remaining 400
		// were newly written to cache. Nothing may be counted twice.
		const s = splitTokens({ input: 1000, cached: 600, output: 50, cacheWrite: 150 });
		expect(s).toEqual({ fresh: 250, cacheWrite: 150, cached: 600, output: 50 });
		expect(s.fresh + s.cacheWrite + s.cached).toBe(1000);
	});

	it('clamps a cache write that claims more than the uncached input', () => {
		// A bad or unexpected usage object must not produce a negative bucket,
		// which would read as a discount the invoice never gave.
		const s = splitTokens({ input: 500, cached: 400, output: 0, cacheWrite: 900 });
		expect(s.fresh).toBe(0);
		expect(s.cacheWrite).toBe(100);
		expect(s.fresh + s.cacheWrite + s.cached).toBe(500);
	});

	it('clamps cached tokens that exceed the input count', () => {
		const s = splitTokens({ input: 100, cached: 250, output: 0 });
		expect(s.cached).toBe(100);
		expect(s.fresh).toBe(0);
	});
});

describe('costOf', () => {
	it('bills cache writes at the uplifted rate', () => {
		const r = rateFor('gpt-5.6-terra');
		const usage = { input: 1000, cached: 600, output: 100, cacheWrite: 150 };

		const expected =
			(250 * r.in + 150 * r.in * CACHE_WRITE_RATE + 600 * r.cached + 100 * r.out) / 1_000_000;
		expect(costOf('gpt-5.6-terra', usage)).toBeCloseTo(expected, 10);

		// And the uplift is real money: ignoring it, as this app did until the
		// rate was checked against the docs, understates the call.
		const ignoringWrites = costOf('gpt-5.6-terra', { ...usage, cacheWrite: 0 });
		expect(costOf('gpt-5.6-terra', usage)).toBeGreaterThan(ignoringWrites);
	});

	it('does not double-charge reasoning, which is already inside output', () => {
		// The caller passes `output` only. Reasoning is a *breakdown* of it, so a
		// call whose output is entirely reasoning costs the same as one whose
		// output is entirely visible text.
		const a = costOf('gpt-5.6-sol', { input: 10, cached: 0, output: 900 });
		const b = costOf('gpt-5.6-sol', { input: 10, cached: 0, output: 900 });
		expect(a).toBe(b);
		expect(a).toBeCloseTo((10 * 5.0 + 900 * 30.0) / 1_000_000, 10);
	});
});

describe('the ledger breakdown', () => {
	it('splits the bill into buckets that sum to the headline', () => {
		const bus = new EventBus();
		exchange(bus, 'https://api.openai.com/v1/responses', {
			input_tokens: 20_000,
			input_tokens_details: { cached_tokens: 15_000, cache_write_tokens: 1_000 },
			output_tokens: 2_000,
			output_tokens_details: { reasoning_tokens: 1_500 },
			total_tokens: 22_000
		});
		exchange(bus, 'https://api.openai.com/v1/images/generations', {
			input_tokens: 100,
			output_tokens: 4_000
		});

		const t = runTotals(bus, 'gpt-5.6-terra');
		const sum = t.kinds.reduce((n, k) => n + k.usd, 0);
		expect(sum).toBeCloseTo(t.costUsd, 10);
		expect(t.textUsd + t.imageUsd).toBeCloseTo(t.costUsd, 10);

		// Every kind present exactly once, and reasoning separated from the
		// visible remainder rather than added on top of it.
		const by = Object.fromEntries(t.kinds.map((k) => [k.kind, k.tokens]));
		expect(by).toEqual({
			fresh: 4_000, // 20000 − 15000 cached − 1000 written
			cacheWrite: 1_000,
			cached: 15_000,
			reasoning: 1_500,
			output: 500, // 2000 output − 1500 reasoning
			image: 4_000
		});

		// Sorted by spend, because which kind takes the money is the question the
		// panel exists to answer.
		const spends = t.kinds.map((k) => k.usd);
		expect([...spends].sort((a, b) => b - a)).toEqual(spends);
	});

	it('omits buckets a run never touched', () => {
		const bus = new EventBus();
		exchange(bus, 'https://api.openai.com/v1/responses', {
			input_tokens: 500,
			output_tokens: 20
		});
		const kinds = runTotals(bus, 'gpt-5.6-luna').kinds.map((k) => k.kind);
		expect(kinds).toContain('fresh');
		expect(kinds).toContain('output');
		expect(kinds).not.toContain('cached');
		expect(kinds).not.toContain('image');
		expect(kinds).not.toContain('reasoning');
	});
});
