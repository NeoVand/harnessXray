import { describe, it, expect } from 'vitest';
import { EventBus } from './bus.svelte';
import { runTotals } from './usage';

/**
 * The Run panel's arithmetic, pinned. The subtle case is image generation:
 * it shares the wire with the text calls but bills on a different meter, and
 * folding it into the text buckets both mispriced it and let a 120-token
 * image prompt overwrite the context gauge.
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
