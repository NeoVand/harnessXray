import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from './bus.svelte';
import { fnv1a } from './wire';
import { replay, parseFixture, type Fixture } from './replay.svelte';

/**
 * Record/replay round trip, without a network in sight: capture-shaped events
 * go onto a bus, `build` folds them into a fixture, and the fixture serves the
 * same bytes back — hash-matched first, in recorded order when the hash
 * misses, and a readable 400 when the tape runs out.
 */

function busWithOneExchange(body: string, frames: string[]): EventBus {
	const bus = new EventBus();
	const req = bus.emit({
		kind: 'http_request',
		scope: 'main',
		url: 'https://api.openai.com/v1/responses',
		method: 'POST',
		headers: {},
		body: JSON.parse(body),
		bytes: body.length,
		bodyHash: fnv1a(body),
		label: '/v1/responses'
	});
	frames.forEach((raw, i) =>
		bus.emit({ kind: 'http_sse_frame', scope: 'main', httpId: req.id, i, raw })
	);
	bus.emit({
		kind: 'http_response',
		scope: 'main',
		httpId: req.id,
		status: 200,
		headers: {},
		streamed: true,
		frames: frames.length,
		ms: 12,
		label: '200'
	});
	return bus;
}

async function textOf(res: Response): Promise<string> {
	return await res.text();
}

describe('record/replay', () => {
	afterEach(() => replay.stop());

	it('folds the bus into a fixture and serves it back by hash', async () => {
		const body = JSON.stringify({
			model: 'gpt-5.6-luna',
			input: [{ role: 'user', content: 'hi' }]
		});
		const frames = ['data: {"delta":"hel"}', 'data: {"delta":"lo"}', 'data: [DONE]'];
		const fixture = replay.build(busWithOneExchange(body, frames), 'test', 'gpt-5.6-luna', ['hi']);

		expect(fixture.exchanges).toHaveLength(1);
		expect(fixture.exchanges[0].frames).toEqual(frames);
		expect(fixture.script).toEqual(['hi']);

		replay.start(fixture);
		const res = replay.serveExchange(body);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toContain('event-stream');
		const text = await textOf(res);
		expect(text).toBe(frames.map((f) => f + '\n\n').join(''));
	});

	it('falls back to recorded order when the hash misses, then runs dry with a 400', async () => {
		const body = JSON.stringify({ model: 'gpt-5.6-luna', input: [] });
		const fixture = replay.build(busWithOneExchange(body, ['data: [DONE]']), 't', 'm', []);
		replay.start(fixture);

		// A diverged request still gets the next unserved exchange…
		const res = replay.serveExchange('{"something":"else entirely"}');
		expect(res.status).toBe(200);

		// …and once the tape is spent, the miss is a readable 400, not a retryable 5xx.
		const miss = replay.serveExchange(body);
		expect(miss.status).toBe(400);
		expect(await textOf(miss)).toContain('replay');
	});

	it('serves recorded web traffic by URL and 404s the never-recorded', async () => {
		const fixture: Fixture = {
			version: 1,
			name: 't',
			createdAt: 'now',
			model: 'm',
			script: [],
			exchanges: [],
			web: [
				{
					url: 'https://api.openalex.org/works?q=x',
					status: 200,
					contentType: 'application/json',
					bodyText: '{"results":[]}'
				}
			]
		};
		replay.start(fixture);
		const hit = replay.serveWeb('https://api.openalex.org/works?q=x');
		expect(hit.status).toBe(200);
		expect(await textOf(hit)).toBe('{"results":[]}');
		expect(replay.serveWeb('https://elsewhere.example/').status).toBe(404);
	});

	it('rejects fixtures from the future or from another app', () => {
		expect(() => parseFixture('{"version":2}')).toThrow(/version/);
		expect(() => parseFixture('{"version":1}')).toThrow(/fixture/);
	});
});
