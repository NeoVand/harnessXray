import type { EventBus } from './bus.svelte';
import type { Scope } from './events';

/**
 * The wire plane — the only place in the app that sees literal bytes.
 *
 * This is handed to `ChatOpenAI` as `configuration.fetch`, which the OpenAI SDK
 * uses for the real call. That is a supported hook, and it is emphatically *not*
 * a `window.fetch` monkey-patch: patching globally would also swallow our arXiv
 * and OpenAlex traffic and would make the capture impossible to reason about.
 *
 * Two rules that are easy to get wrong and fatal when you do:
 *
 *  1. A `Response` body can be read once. For non-streamed replies we read a
 *     `clone()` and return the original untouched.
 *  2. For SSE we `tee()` the stream: one branch to the SDK, one to us. Verified
 *     that this does not disturb LangChain's parsing — the resulting message,
 *     usage and finish_reason are all still correct.
 */

const REDACTED = new Set(['authorization', 'x-api-key', 'openai-organization', 'cookie']);

/** Never let a key into the event log — the log is rendered on screen. */
function redact(value: string): string {
	const tail = value.trim().slice(-4);
	return value.trim().startsWith('Bearer ') ? `Bearer sk-…${tail}` : `…${tail}`;
}

function headerMap(init: HeadersInit | Headers | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!init) return out;
	new Headers(init).forEach((v, k) => {
		out[k] = REDACTED.has(k.toLowerCase()) ? redact(v) : v;
	});
	return out;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

/**
 * FNV-1a, 32-bit, as eight hex chars.
 *
 * The replay key. It only has to be stable and cheap — this is matching a
 * request to its own recording, not defending against an adversary — and
 * FNV-1a is both in six lines with no imports.
 */
export function fnv1a(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, '0');
}

export function createInstrumentedFetch(
	bus: EventBus,
	scope: Scope = 'main',
	/**
	 * What actually answers the request. Defaults to the real network; replay
	 * passes a fixture-server here. Everything above this seam — capture, tee,
	 * frame events — runs identically either way, which is the entire point:
	 * the X-ray cannot tell a recording from the internet.
	 */
	transport?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): typeof fetch {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: (input as Request).url;
		const body = typeof init?.body === 'string' ? init.body : undefined;

		const request = bus.emit({
			kind: 'http_request',
			scope,
			url,
			method: init?.method ?? 'GET',
			headers: headerMap(init?.headers),
			body: body ? safeJson(body) : null,
			bytes: body?.length ?? 0,
			// Hashed from the literal string, before any parse — see fnv1a.
			...(body ? { bodyHash: fnv1a(body) } : {}),
			label: new URL(url, 'http://x').pathname
		});
		const httpId = request.id;

		const started = performance.now();
		let res: Response;
		try {
			res = await (transport ?? fetch)(input, init);
		} catch (err) {
			bus.emit({
				kind: 'http_error',
				scope,
				httpId,
				url,
				message: err instanceof Error ? err.message : String(err),
				// A rejected key and an unplugged network look identical from here.
				maybeRejectedKey: err instanceof TypeError && url.includes('api.openai.com'),
				label: 'request failed'
			});
			throw err;
		}

		const headers = headerMap(res.headers);
		const isSse = (res.headers.get('content-type') ?? '').includes('text/event-stream');

		if (!isSse || !res.body) {
			// Read a clone so the SDK still gets an unconsumed body.
			res
				.clone()
				.text()
				.then((text) => {
					const parsed = safeJson(text);
					bus.emit({
						kind: 'http_response',
						scope,
						httpId,
						status: res.status,
						headers,
						body: parsed,
						streamed: false,
						ms: performance.now() - started,
						rawUsage: (parsed as { usage?: unknown } | null)?.usage,
						label: `${res.status}`
					});
				})
				.catch(() => {});
			return res;
		}

		const [toSdk, toXray] = res.body.tee();

		void (async () => {
			const reader = toXray.pipeThrough(new TextDecoderStream()).getReader();
			let buffer = '';
			let i = 0;
			let ttfbMs: number | undefined;
			let lastUsage: unknown;

			try {
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					ttfbMs ??= performance.now() - started;
					buffer += value;

					let cut: number;
					while ((cut = buffer.indexOf('\n\n')) !== -1) {
						const raw = buffer.slice(0, cut);
						buffer = buffer.slice(cut + 2);
						const data = raw
							.split('\n')
							.find((l) => l.startsWith('data:'))
							?.slice(5)
							.trim();
						const parsed = data && data !== '[DONE]' ? safeJson(data) : undefined;
						// Two shapes, because the two APIs disagree: Chat Completions puts
						// usage at the top of the frame, the Responses API nests it under
						// `response`. Reading only the first silently loses every token
						// count on the path we actually use.
						const p = parsed as { usage?: unknown; response?: { usage?: unknown } } | undefined;
						if (p?.usage) lastUsage = p.usage;
						else if (p?.response?.usage) lastUsage = p.response.usage;
						bus.emit({ kind: 'http_sse_frame', scope, httpId, i: i++, raw, parsed });
					}
				}
			} catch {
				/* the SDK owns the real error path; we only observe */
			}

			bus.emit({
				kind: 'http_response',
				scope,
				httpId,
				status: res.status,
				headers,
				streamed: true,
				frames: i,
				ms: performance.now() - started,
				ttfbMs,
				rawUsage: lastUsage,
				label: `${res.status} · ${i} frames`
			});
		})();

		// Rebuild the response around our branch of the tee. `content-encoding`
		// and `content-length` must not be copied: fetch already decoded the body,
		// so re-advertising gzip would make a consumer try to inflate plain text.
		const forwarded = new Headers(res.headers);
		forwarded.delete('content-encoding');
		forwarded.delete('content-length');

		return new Response(toSdk, {
			status: res.status,
			statusText: res.statusText,
			headers: forwarded
		});
	};
}
