import { ChatOpenAI } from '@langchain/openai';
import { keys } from '$lib/state/keys.svelte';
import { createInstrumentedFetch } from '$lib/xray/wire';
import { replay, replayTransport } from '$lib/xray/replay.svelte';
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
 * gpt-image-2 output, USD per 1M tokens. Verified 2026-07 (PLAN D7). Only the
 * output rate was verified; image *input* tokens are counted in the Run panel
 * but not priced, which errs a few hundredths of a cent low rather than
 * inventing a rate.
 */
export const IMAGE_OUT_RATE = 30;

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
 * What a cache write costs, as a multiple of the uncached input rate.
 *
 * Free on model families before gpt-5.6; billed from gpt-5.6 onwards, which is
 * every model this app offers. The docs put it plainly: "On GPT-5.6 models and
 * later model families, cache writes are billed at 1.25× the uncached input
 * token rate and reported in `cache_write_tokens`."
 *
 * https://developers.openai.com/api/docs/guides/prompt-caching
 */
export const CACHE_WRITE_RATE = 1.25;

/**
 * The five token kinds, and what each one costs per token.
 *
 * This is the whole of the pricing model, in one place, because the lesson of
 * the ledger is that "tokens" is not one thing: a cached input token and a
 * reasoning token differ by a factor of sixty on the same model. Rates are
 * relative to the model's own table above.
 */
export type TokenKind = 'fresh' | 'cacheWrite' | 'cached' | 'output' | 'reasoning';

export function rateOf(model: string, kind: TokenKind): number {
	const r = rateFor(model);
	switch (kind) {
		case 'fresh':
			return r.in;
		case 'cacheWrite':
			return r.in * CACHE_WRITE_RATE;
		case 'cached':
			return r.cached;
		// Reasoning tokens are billed as output tokens, at the same rate. They are
		// not a separate line on the bill — only a separate line in the usage
		// object, which is the only reason we can tell them apart at all.
		case 'output':
		case 'reasoning':
			return r.out;
	}
}

/**
 * Cost of one call.
 *
 * Three subset relationships have to be respected or the arithmetic quietly
 * drifts, and all three are documented provider behaviour rather than guesses:
 *
 *   cached ⊆ input          — cache reads are part of the input count, billed
 *                             at the (much lower) cached rate, so they must be
 *                             subtracted rather than counted twice. Getting
 *                             this wrong overstates a long conversation by an
 *                             order of magnitude, since almost all of its input
 *                             is cache hits.
 *   cacheWrite ⊆ input−cached — the newly-seen prefix is processed fresh *and*
 *                             written to cache, so those same tokens are billed
 *                             at 1.25× instead of 1×. It is an uplift on tokens
 *                             you already pay for, not an extra count.
 *   reasoning ⊆ output      — "they still occupy space in the model's context
 *                             window and are billed as output tokens", so
 *                             `output` is already the full generated total.
 */
export function costOf(
	model: string,
	usage: { input: number; cached: number; output: number; cacheWrite?: number }
): number {
	const s = splitTokens(usage);
	return (
		(s.fresh * rateOf(model, 'fresh') +
			s.cacheWrite * rateOf(model, 'cacheWrite') +
			s.cached * rateOf(model, 'cached') +
			s.output * rateOf(model, 'output')) /
		1_000_000
	);
}

/**
 * The provider's overlapping counts, resolved into disjoint buckets that sum to
 * the billed total. Exported because both the cost function and the ledger's
 * breakdown need exactly the same split, and two implementations of this would
 * be two chances to disagree with the invoice.
 */
export function splitTokens(usage: {
	input: number;
	cached: number;
	output: number;
	cacheWrite?: number;
}) {
	const cached = Math.min(usage.cached, usage.input);
	const uncached = Math.max(0, usage.input - cached);
	// Clamped rather than trusted: a provider that ever reports a write larger
	// than the uncached input would otherwise produce a negative fresh bucket
	// and an invented discount.
	const cacheWrite = Math.min(usage.cacheWrite ?? 0, uncached);
	return {
		fresh: uncached - cacheWrite,
		cacheWrite,
		cached,
		output: usage.output
	};
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
		// In replay there is no network, so there is nothing a key would protect;
		// the SDK just needs a string to put in a header nobody will read.
		apiKey: replay.active ? 'sk-replay-fixture' : keys.require(),
		configuration: {
			dangerouslyAllowBrowser: true,
			fetch: createInstrumentedFetch(bus, scope, replay.active ? replayTransport : undefined)
		}
	});
}
