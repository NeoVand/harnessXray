import type { EventBus } from './bus.svelte';
import type { XrayEvent } from './events';
import { fnv1a } from './wire';

/**
 * Record & replay — the whole demo, canned, with the harness still real.
 *
 * The trick is where the seam sits. Replay does NOT play back the event log
 * as a movie; it replaces the *network* and re-runs everything else for real.
 * The same deepagents graph compiles, the same middleware runs, the same
 * interrupts fire, and the same instrumented fetch captures the same frames —
 * only the transport underneath it answers from a recording instead of the
 * internet. That is why a fixture needs no API key and no wifi, and why every
 * panel of the X-ray keeps working: nothing above the transport can tell.
 *
 * Recording is equally free-riding: the wire plane already holds the literal
 * request bodies, response envelopes and raw SSE frames, so a fixture is a
 * fold over the bus. The only thing captured separately is the retrieval
 * traffic (OpenAlex, arXiv) — deliberately kept off the bus so the timeline
 * stays about the model — which `labFetch` shadows into a side-table as it
 * passes through.
 *
 * Matching is hash-first, order-second. Each recorded exchange is keyed by
 * the FNV-1a of the exact body that was sent (stamped at capture); a live
 * request in replay is answered by the first unserved exchange with the same
 * hash, and when nothing matches — replayed runs can diverge, models are
 * sampled — by the next unserved exchange in recorded order. Faithful when
 * the script is followed; a movie of the original run when it is not.
 */

export interface FixtureExchange {
	hash: string;
	url: string;
	status: number;
	streamed: boolean;
	/** Raw SSE frame blocks, exactly as captured (no trailing blank line). */
	frames?: string[];
	/** Non-streamed responses: the parsed JSON body. */
	body?: unknown;
}

export interface FixtureWebEntry {
	url: string;
	status: number;
	contentType: string;
	/** Text bodies stored as text; binary (PDFs, images) as base64. */
	bodyText?: string;
	bodyB64?: string;
}

export interface Fixture {
	version: 1;
	name: string;
	createdAt: string;
	model: string;
	/** The user messages of the recorded run, in order — the script. */
	script: string[];
	exchanges: FixtureExchange[];
	web: FixtureWebEntry[];
}

/** Per-URL-body cap. A demo should be a download, not an ISO. */
const WEB_BODY_CAP = 4 * 1024 * 1024;

class Replay {
	active = $state(false);
	fixtureName = $state('');
	#fixture: Fixture | null = null;
	#servedExchanges: boolean[] = [];
	#servedWeb: boolean[] = [];

	/** Retrieval traffic recorded as it happens, for the next export. */
	#webRecording: FixtureWebEntry[] = [];

	get fixture(): Fixture | null {
		return this.#fixture;
	}

	start(fixture: Fixture) {
		this.#fixture = fixture;
		this.#servedExchanges = fixture.exchanges.map(() => false);
		this.#servedWeb = fixture.web.map(() => false);
		this.fixtureName = fixture.name;
		this.active = true;
	}

	stop() {
		this.active = false;
		this.fixtureName = '';
		this.#fixture = null;
		this.#servedExchanges = [];
		this.#servedWeb = [];
	}

	/** A new conversation replays the fixture from the top. */
	rewindServing() {
		this.#servedExchanges = this.#servedExchanges.map(() => false);
		this.#servedWeb = this.#servedWeb.map(() => false);
	}

	/** Forget recorded retrieval traffic (a new thread is a new recording). */
	resetWebRecording() {
		this.#webRecording = [];
	}

	/**
	 * Shadow one live retrieval response into the side-table.
	 * Bounded: an oversized body is skipped and that URL simply cannot replay.
	 */
	async recordWeb(url: string, res: Response): Promise<void> {
		try {
			const buf = await res.clone().arrayBuffer();
			if (buf.byteLength > WEB_BODY_CAP) return;
			const contentType = res.headers.get('content-type') ?? 'text/plain';
			const isText = /json|text|html|xml/.test(contentType);
			this.#webRecording.push({
				url,
				status: res.status,
				contentType,
				...(isText ? { bodyText: new TextDecoder().decode(buf) } : { bodyB64: b64of(buf) })
			});
		} catch {
			/* an unrecordable response only means this URL will not replay */
		}
	}

	/** The recorded web entry for a URL — first unserved match wins. */
	serveWeb(url: string): Response {
		const list = this.#fixture?.web ?? [];
		for (let i = 0; i < list.length; i++) {
			if (this.#servedWeb[i] || list[i].url !== url) continue;
			this.#servedWeb[i] = true;
			return webResponse(list[i]);
		}
		// A second read of the same URL can reuse a served entry — caches miss
		// on reload, and refusing a repeat would break an otherwise clean run.
		const again = list.find((w) => w.url === url);
		if (again) return webResponse(again);
		return new Response(`harnessXray replay: no recording for ${url}`, { status: 404 });
	}

	/** The recorded model exchange for a request body — hash, then order. */
	serveExchange(bodyText: string): Response {
		const fx = this.#fixture;
		if (!fx) return replayMiss('replay mode is on but no fixture is loaded');

		const hash = fnv1a(bodyText);
		let pick = -1;
		for (let i = 0; i < fx.exchanges.length; i++) {
			if (!this.#servedExchanges[i] && fx.exchanges[i].hash === hash) {
				pick = i;
				break;
			}
		}
		if (pick < 0) pick = this.#servedExchanges.findIndex((served) => !served);
		if (pick < 0) return replayMiss('the fixture has no unserved exchanges left');

		this.#servedExchanges[pick] = true;
		const ex = fx.exchanges[pick];
		if (!ex.streamed) {
			return new Response(JSON.stringify(ex.body ?? {}), {
				status: ex.status,
				headers: { 'content-type': 'application/json' }
			});
		}
		return new Response(frameStream(ex.frames ?? []), {
			status: ex.status,
			headers: { 'content-type': 'text/event-stream' }
		});
	}

	/**
	 * Fold the current run into a fixture.
	 *
	 * Everything model-plane comes off the bus; retrieval comes from the
	 * side-table this module recorded as the run happened.
	 */
	build(bus: EventBus, name: string, model: string, script: string[]): Fixture {
		const exchanges: FixtureExchange[] = [];
		for (const e of bus.events) {
			if (e.kind !== 'http_request' || !e.bodyHash) continue;
			const response = bus.events.find(
				(r): r is Extract<XrayEvent, { kind: 'http_response' }> =>
					r.kind === 'http_response' && r.httpId === e.id
			);
			if (!response) continue;
			if (response.streamed) {
				exchanges.push({
					hash: e.bodyHash,
					url: e.url,
					status: response.status,
					streamed: true,
					frames: bus
						.framesOf(e.id)
						.map((f) => (f.kind === 'http_sse_frame' ? f.raw : ''))
						.filter(Boolean)
				});
			} else {
				exchanges.push({
					hash: e.bodyHash,
					url: e.url,
					status: response.status,
					streamed: false,
					body: response.body
				});
			}
		}
		return {
			version: 1,
			name,
			createdAt: new Date().toISOString(),
			model,
			script,
			exchanges,
			web: [...this.#webRecording]
		};
	}
}

function b64of(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	const CHUNK = 0x8000;
	let out = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(out);
}

function webResponse(w: FixtureWebEntry): Response {
	const body = w.bodyText ?? Uint8Array.from(atob(w.bodyB64 ?? ''), (c) => c.charCodeAt(0));
	return new Response(body, { status: w.status, headers: { 'content-type': w.contentType } });
}

/** 4xx so LangChain reports it instead of retrying it into the ground. */
function replayMiss(why: string): Response {
	return new Response(JSON.stringify({ error: { message: `harnessXray replay: ${why}.` } }), {
		status: 400,
		headers: { 'content-type': 'application/json' }
	});
}

/**
 * The recorded frames as a stream, paced enough to look alive.
 *
 * Paced only while the tab is visible, and only every few frames: background
 * tabs clamp timers to a second, and a per-frame 4ms setTimeout turned a
 * replayed run into a slideshow the moment the tab lost focus. Hidden tabs
 * get the frames at full speed — nobody is watching the animation.
 */
function frameStream(frames: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	let i = 0;
	return new ReadableStream({
		async pull(controller) {
			if (i >= frames.length) {
				controller.close();
				return;
			}
			const watching = typeof document !== 'undefined' && document.visibilityState === 'visible';
			if (watching && i % 4 === 0) await new Promise((r) => setTimeout(r, 8));
			controller.enqueue(enc.encode(frames[i++] + '\n\n'));
		}
	});
}

export const replay = new Replay();

// In dev, reachable from the console as `__hx.replay` — same standing as the
// bus and the session: a lab about inspection should be inspectable.
if (import.meta.env.DEV && typeof window !== 'undefined') {
	const w = window as unknown as { __hx?: Record<string, unknown> };
	w.__hx = { ...(w.__hx ?? {}), replay };
}

/**
 * The transport the instrumented fetch uses in replay mode.
 * Same shape as fetch; answers from the fixture instead of the network.
 */
export function replayTransport(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const body = typeof init?.body === 'string' ? init.body : '';
	return Promise.resolve(replay.serveExchange(body));
}

/**
 * At most this many in-flight requests per host.
 *
 * Five parallel paper-readers each fetching a paper AND its figures is a
 * burst of dozens of simultaneous hits on arxiv.org, and arXiv answers bursts
 * with dropped connections — a bare "Failed to fetch" with no status to read.
 * A small gate turns the stampede into a queue; nobody notices the wait and
 * the refusals stop happening.
 */
const HOST_LIMIT = 3;
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- plumbing state, never rendered
const hostGates = new Map<string, { active: number; queue: (() => void)[] }>();

async function withHostGate<T>(url: string, run: () => Promise<T>): Promise<T> {
	let host = '';
	try {
		host = new URL(url).host;
	} catch {
		/* unparseable url — let fetch produce the real error */
	}
	if (!host) return run();
	let gate = hostGates.get(host);
	if (!gate) {
		gate = { active: 0, queue: [] };
		hostGates.set(host, gate);
	}
	if (gate.active >= HOST_LIMIT) await new Promise<void>((r) => gate.queue.push(r));
	gate.active++;
	try {
		return await run();
	} finally {
		gate.active--;
		gate.queue.shift()?.();
	}
}

/**
 * The retrieval seam. In live mode this IS `fetch` (behind the per-host
 * gate), plus a shadow copy into the recording side-table; in replay mode it
 * answers from the fixture. The agent's tools call this instead of the
 * global — a network seam, not telemetry: nothing about the observation
 * rides through it.
 */
export async function labFetch(url: string, init?: RequestInit): Promise<Response> {
	if (replay.active) return replay.serveWeb(url);
	const res = await withHostGate(url, () => fetch(url, init));
	if (res.ok) void replay.recordWeb(url, res);
	return res;
}

/** Serialize and hand the fixture to the user as a download. */
export function downloadFixture(fixture: Fixture) {
	const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `${fixture.name.replace(/[^\w-]+/g, '-') || 'run'}.hxray.json`;
	a.click();
	URL.revokeObjectURL(a.href);
}

/** Parse and sanity-check a fixture file. Throws with a readable reason. */
export function parseFixture(text: string): Fixture {
	const fx = JSON.parse(text) as Fixture;
	if (fx.version !== 1) throw new Error(`Unsupported fixture version: ${String(fx.version)}`);
	if (!Array.isArray(fx.exchanges) || !Array.isArray(fx.web) || !Array.isArray(fx.script))
		throw new Error('Not a harnessXray fixture — missing exchanges, web or script.');
	return fx;
}
