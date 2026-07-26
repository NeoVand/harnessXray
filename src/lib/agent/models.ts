import { ChatOpenAI } from '@langchain/openai';
import { keys } from '$lib/state/keys.svelte';
import { createInstrumentedFetch } from '$lib/xray/wire';
import type { EventBus } from '$lib/xray/bus.svelte';
import type { Scope } from '$lib/xray/events';

/**
 * The model seam.
 *
 * Everything goes through LangChain rather than the OpenAI SDK directly, so
 * adding Azure later is a branch in this one function — `AzureChatOpenAI` takes
 * the same `configuration` shape, so the wire capture keeps working unchanged.
 *
 * Note `dangerouslyAllowBrowser` belongs inside `configuration`; a top-level key
 * of that name is silently ignored. LangChain already defaults it to true here,
 * but it is stated explicitly because it is a real decision: with no server, the
 * user's key is sent from their own page, which is the honest trade for "your
 * key never leaves your browser".
 */

/** USD per 1M tokens. Verified 2026-07; shown in-app with that caveat. */
export const MODELS = [
	{ id: 'gpt-5.6-luna', label: 'luna', blurb: 'fastest', in: 1.0, cached: 0.1, out: 6.0 },
	{ id: 'gpt-5.6-terra', label: 'terra', blurb: 'balanced', in: 2.5, cached: 0.25, out: 15.0 },
	{ id: 'gpt-5.6-sol', label: 'sol', blurb: 'deepest', in: 5.0, cached: 0.5, out: 30.0 }
] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const RATES_VERIFIED = '2026-07';

/**
 * How many tokens fit in one request.
 *
 * The whole gpt-5.6 family shares an input window, so this is a single number
 * rather than a per-model field. It is the *input* limit specifically — output
 * is budgeted separately — which is the one that matters here, because the
 * context gauge is measuring what we send.
 *
 * It is stated once, in the open, because everything downstream is relative to
 * it: the fill bar, the donut in the status rail, and the threshold at which
 * the harness compacts. If the family's window changes, this line changes and
 * the rest follows.
 */
export const INPUT_LIMIT = 272_000;

/** Compact when the next request would cross this share of the window. */
export const COMPACT_AT = 0.9;

export function rateFor(model: string) {
	return MODELS.find((m) => m.id === model) ?? MODELS[1];
}

/**
 * Cost of one call.
 *
 * Cached input is billed at a different (much lower) rate, so it must be
 * subtracted from the input count rather than counted twice — getting this
 * wrong overstates a long conversation by an order of magnitude, since almost
 * all of its input is cache hits.
 */
export function costOf(
	model: string,
	usage: { input: number; cached: number; output: number }
): number {
	const r = rateFor(model);
	const fresh = Math.max(0, usage.input - usage.cached);
	return (fresh * r.in + usage.cached * r.cached + usage.output * r.out) / 1_000_000;
}

export interface ModelOptions {
	model?: ModelId | string;
	scope?: Scope;
	temperature?: number;
	streaming?: boolean;
}

export function makeModel(bus: EventBus, opts: ModelOptions = {}) {
	const { model = 'gpt-5.6-terra', scope = 'main', temperature, streaming = true } = opts;

	return new ChatOpenAI({
		model,
		streaming,
		// The gpt-5.6 family are reasoning models, and OpenAI rejects function
		// tools for them on /v1/chat/completions:
		//   "400 Function tools with reasoning_effort are not supported for
		//    gpt-5.6-terra in /v1/chat/completions. To use function tools, use
		//    /v1/responses or set reasoning_effort to 'none'."
		// An agent without tools is not an agent, so we take the Responses API
		// rather than switching reasoning off. Two things follow, both good:
		// reasoning summaries become available, and the exact token-count
		// endpoint (/v1/responses/input_tokens) now measures the *same* body we
		// actually send, instead of a translated approximation.
		useResponsesApi: true,
		...(temperature !== undefined ? { temperature } : {}),
		apiKey: keys.require(),
		configuration: {
			dangerouslyAllowBrowser: true,
			fetch: createInstrumentedFetch(bus, scope)
		}
	});
}
