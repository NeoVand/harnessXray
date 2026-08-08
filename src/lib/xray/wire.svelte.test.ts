import { describe, it, expect } from 'vitest';
import { EventBus } from './bus.svelte';
import { createInstrumentedFetch } from './wire';

/**
 * The wire plane's promise is that you can see what was sent. Image editing is
 * the one request in the app that cannot be JSON — `/v1/images/edits` takes
 * multipart/form-data — and the capture used to record only string bodies, so
 * the single request carrying a picture was the single request whose payload
 * showed as `null`.
 *
 * These pin the compromise: fields and their values are kept, blobs are
 * replaced by type and size. A megabyte of base64 in the event log would be the
 * same mistake the app already refuses to make with graph state.
 */

const ok = () => Promise.resolve(new Response('{}', { status: 200 }));

describe('multipart capture', () => {
	it('describes form fields instead of dropping the body', async () => {
		const bus = new EventBus();
		const fetchLike = createInstrumentedFetch(bus, 'main', ok);

		const form = new FormData();
		form.append('model', 'gpt-image-2');
		form.append('prompt', 'Redraw as a clean editorial diagram.');
		form.append('image', new Blob([new Uint8Array(2048)], { type: 'image/png' }), 'fig1.png');

		await fetchLike('https://api.openai.com/v1/images/edits', { method: 'POST', body: form });

		const req = bus.events.find((e) => e.kind === 'http_request');
		expect(req).toBeTruthy();
		const body = (req as { body?: Record<string, unknown> }).body;

		// Text fields survive verbatim — the prompt is the interesting part and it
		// is what a reader is checking.
		expect(body?.model).toBe('gpt-image-2');
		expect(body?.prompt).toBe('Redraw as a clean editorial diagram.');

		// The blob is described, never carried.
		expect(String(body?.image)).toMatch(/image\/png/);
		expect(String(body?.image)).toMatch(/2 KB/);
		expect(JSON.stringify(body).length).toBeLessThan(500);
	});

	it('counts the blob toward the request size', async () => {
		const bus = new EventBus();
		const fetchLike = createInstrumentedFetch(bus, 'main', ok);
		const form = new FormData();
		form.append('image', new Blob([new Uint8Array(4096)], { type: 'image/png' }), 'x.png');

		await fetchLike('https://api.openai.com/v1/images/edits', { method: 'POST', body: form });

		const req = bus.events.find((e) => e.kind === 'http_request') as { bytes?: number };
		// Otherwise the ledger and the timeline would call a 1MB upload a 0-byte
		// request, which is worse than saying nothing.
		expect(req.bytes).toBeGreaterThanOrEqual(4096);
	});

	it('leaves ordinary JSON requests exactly as they were', async () => {
		const bus = new EventBus();
		const fetchLike = createInstrumentedFetch(bus, 'main', ok);
		await fetchLike('https://api.openai.com/v1/responses', {
			method: 'POST',
			body: JSON.stringify({ model: 'gpt-5.6-terra', input: 'hi' })
		});
		const req = bus.events.find((e) => e.kind === 'http_request') as {
			body?: { model?: string };
			bodyHash?: string;
		};
		expect(req.body?.model).toBe('gpt-5.6-terra');
		// The hash is taken from the literal string and only exists for real bodies.
		expect(req.bodyHash).toBeTruthy();
	});
});
