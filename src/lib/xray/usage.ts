import type { EventBus } from './bus.svelte';
import { costOf, IMAGE_OUT_RATE } from '$lib/agent/models';

/**
 * Run accounting, folded from the wire.
 *
 * Read off `rawUsage` — the provider's own object — rather than LangChain's
 * normalised `usage_metadata`, because the normalised form drops
 * `cache_write_tokens` entirely. The wire is the only place the full picture
 * exists, which is the whole reason the wire plane is worth having.
 *
 * Field names verified against a live Responses API reply:
 *   { input_tokens, input_tokens_details: { cached_tokens, cache_write_tokens },
 *     output_tokens, output_tokens_details: { reasoning_tokens }, total_tokens }
 */
export interface RunTotals {
	calls: number;
	input: number;
	cached: number;
	cacheWrite: number;
	output: number;
	reasoning: number;
	total: number;
	/** Text and image spend together — the headline number. */
	costUsd: number;
	/** Input tokens on the most recent *text* call — i.e. the live context size. */
	lastInput: number;
	ms: number;
	/** Image generation, kept out of the text buckets — different animal, different rates. */
	imageCalls: number;
	imageIn: number;
	imageOut: number;
	imageUsd: number;
}

interface RawUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
	output_tokens_details?: { reasoning_tokens?: number };
}

export function runTotals(bus: EventBus, model: string): RunTotals {
	const t: RunTotals = {
		calls: 0,
		input: 0,
		cached: 0,
		cacheWrite: 0,
		output: 0,
		reasoning: 0,
		total: 0,
		costUsd: 0,
		lastInput: 0,
		ms: 0,
		imageCalls: 0,
		imageIn: 0,
		imageOut: 0,
		imageUsd: 0
	};

	// A usage object alone does not say what kind of call it priced — the URL
	// does, and the URL lives on the request the response is paired with.
	const urlOf = new Map<string, string>();
	for (const e of bus.events) if (e.kind === 'http_request') urlOf.set(e.id, e.url);

	for (const e of bus.events) {
		if (e.kind === 'run_end') t.ms += e.ms;
		if (e.kind !== 'http_response' || !e.rawUsage) continue;

		const u = e.rawUsage as RawUsage;
		const input = u.input_tokens ?? 0;
		const cached = u.input_tokens_details?.cached_tokens ?? 0;
		const output = u.output_tokens ?? 0;

		// Image generation is billed on a different meter entirely. Folding it
		// into the text buckets both mispriced it (image output is ~$30/1M) and
		// let a 120-token image prompt overwrite the context gauge.
		if (urlOf.get(e.httpId)?.includes('/images/')) {
			t.imageCalls += 1;
			t.imageIn += input;
			t.imageOut += output;
			t.imageUsd += (output * IMAGE_OUT_RATE) / 1_000_000;
			t.costUsd += (output * IMAGE_OUT_RATE) / 1_000_000;
			continue;
		}

		t.calls += 1;
		t.input += input;
		t.cached += cached;
		t.cacheWrite += u.input_tokens_details?.cache_write_tokens ?? 0;
		t.output += output;
		t.reasoning += u.output_tokens_details?.reasoning_tokens ?? 0;
		t.total += u.total_tokens ?? input + output;
		t.costUsd += costOf(model, { input, cached, output });
		t.lastInput = input;
	}

	return t;
}

export function money(usd: number): string {
	if (usd === 0) return '$0.00';
	if (usd < 0.01) return `$${usd.toFixed(4)}`;
	return `$${usd.toFixed(3)}`;
}

export function compact(n: number): string {
	if (n < 1000) return String(n);
	if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
	return `${(n / 1_000_000).toFixed(2)}M`;
}
