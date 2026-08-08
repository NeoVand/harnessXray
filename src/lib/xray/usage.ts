import type { EventBus } from './bus.svelte';
import { costOf, rateOf, splitTokens, IMAGE_OUT_RATE, type TokenKind } from '$lib/agent/models';

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
 *
 * The counts overlap: `cached_tokens` and `cache_write_tokens` are parts of
 * `input_tokens`, and `reasoning_tokens` is part of `output_tokens`. Adding them
 * up as siblings double-counts, which is why everything here goes through
 * `splitTokens` before it is either priced or displayed.
 */

/** One disjoint bucket of the bill: what it is, how big, what it cost. */
export interface KindTotal {
	kind: TokenKind | 'image';
	tokens: number;
	usd: number;
	/** USD per 1M tokens, so the panel can show *why* the buckets differ. */
	rate: number;
}

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
	/** Text-model spend alone. */
	textUsd: number;
	/** Input tokens on the most recent *text* call — i.e. the live context size. */
	lastInput: number;
	ms: number;
	/** Image generation, kept out of the text buckets — different animal, different rates. */
	imageCalls: number;
	imageIn: number;
	imageOut: number;
	imageUsd: number;
	/**
	 * The bill, cut into buckets that do not overlap and do sum to `costUsd`.
	 *
	 * In canonical order — the two meters, dearest kind first within each — and
	 * *not* sorted by spend, because the panel draws these same buckets twice
	 * (once by money, once by count) and two bars can only be compared if their
	 * segments appear in the same order in both.
	 */
	kinds: KindTotal[];
	/** The same buckets, grouped into the meters they are billed on. */
	meters: Meter[];
}

/** One meter: a family of token kinds billed together, with its own subtotal. */
export interface Meter {
	id: 'input' | 'output' | 'image';
	label: string;
	/** Billed tokens — the disjoint sum of `rows`, so it never double-counts. */
	tokens: number;
	usd: number;
	rows: KindTotal[];
	/** Counted but deliberately unpriced, with the reason. Image prompts only. */
	unpriced?: { tokens: number; note: string };
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
		textUsd: 0,
		lastInput: 0,
		ms: 0,
		imageCalls: 0,
		imageIn: 0,
		imageOut: 0,
		imageUsd: 0,
		kinds: [],
		meters: []
	};

	// Disjoint token counts, accumulated across the run so the breakdown is
	// summed from per-call splits rather than re-split from run sums — a run sum
	// of `cacheWrite` against a run sum of `input` would let one call's write
	// borrow another call's uncached headroom.
	let fresh = 0;
	let cacheWrite = 0;

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
		const written = u.input_tokens_details?.cache_write_tokens ?? 0;

		// Image generation is billed on a different meter entirely. Folding it
		// into the text buckets both mispriced it (image output is ~$30/1M) and
		// let a 120-token image prompt overwrite the context gauge.
		if (urlOf.get(e.httpId)?.includes('/images/')) {
			t.imageCalls += 1;
			t.imageIn += input;
			t.imageOut += output;
			t.imageUsd += (output * IMAGE_OUT_RATE) / 1_000_000;
			continue;
		}

		const s = splitTokens({ input, cached, output, cacheWrite: written });
		fresh += s.fresh;
		cacheWrite += s.cacheWrite;

		t.calls += 1;
		t.input += input;
		t.cached += cached;
		t.cacheWrite += written;
		t.output += output;
		t.reasoning += u.output_tokens_details?.reasoning_tokens ?? 0;
		t.total += u.total_tokens ?? input + output;
		t.textUsd += costOf(model, { input, cached, output, cacheWrite: written });
		t.lastInput = input;
	}

	t.costUsd = t.textUsd + t.imageUsd;

	// Reasoning is a *part* of output, so the visible-output bucket is what is
	// left after it. Splitting them is the most useful line in the panel: a
	// reply of two hundred visible words can carry ten thousand tokens of
	// thinking, billed identically, and nothing else in the app shows that.
	const visible = Math.max(0, t.output - t.reasoning);
	const usd = (n: number, kind: TokenKind) => (n * rateOf(model, kind)) / 1_000_000;

	const row = (kind: TokenKind, tokens: number): KindTotal => ({
		kind,
		tokens,
		usd: usd(tokens, kind),
		rate: rateOf(model, kind)
	});

	// Dearest first inside each meter, so the spend bar opens with the expensive
	// kinds and the token bar shows those same leading segments as slivers. The
	// two bars trading places is the whole reading.
	const inputRows = [
		row('cacheWrite', cacheWrite),
		row('fresh', fresh),
		row('cached', t.cached)
	].filter((r) => r.tokens > 0);
	const outputRows = [row('reasoning', t.reasoning), row('output', visible)].filter(
		(r) => r.tokens > 0
	);
	const imageRows: KindTotal[] = t.imageOut
		? [{ kind: 'image', tokens: t.imageOut, usd: t.imageUsd, rate: IMAGE_OUT_RATE }]
		: [];

	const meters: Meter[] = [
		{
			id: 'input' as const,
			label: 'input',
			tokens: t.input,
			usd: sum(inputRows),
			rows: inputRows
		},
		{
			id: 'output' as const,
			label: 'output',
			tokens: t.output,
			usd: sum(outputRows),
			rows: outputRows
		},
		{
			id: 'image' as const,
			label: 'image',
			tokens: t.imageOut,
			usd: t.imageUsd,
			rows: imageRows,
			// Stated rather than silently dropped: only the output rate was ever
			// verified, and inventing an input rate to make a column add up would
			// be the exact species of plausible-but-wrong number this app exists
			// to replace.
			...(t.imageIn ? { unpriced: { tokens: t.imageIn, note: 'prompt, rate unverified' } } : {})
		}
	].filter((m) => m.rows.length > 0);

	t.meters = meters;
	t.kinds = meters.flatMap((m) => m.rows);

	return t;
}

const sum = (rows: KindTotal[]) => rows.reduce((n, r) => n + r.usd, 0);

/** Human labels for the buckets. Kept next to the maths, not in the markup. */
export const TOKEN_LABEL: Record<TokenKind | 'image', string> = {
	cacheWrite: 'written to cache',
	fresh: 'new',
	cached: 're-sent from cache',
	output: 'visible',
	reasoning: 'reasoning',
	image: 'generated'
};

/**
 * Bucket colours — the ledger's own family, declared in layout.css.
 *
 * Explicitly NOT the event palette. That one is tuned so nine kinds can sit
 * quietly on a timeline at a single lightness, which makes neighbouring hues
 * indistinguishable the moment they become adjacent segments of one bar. Here
 * each meter gets a hue and each kind's lightness carries its rate. Named
 * TOKEN_* rather than KIND_* because `KIND_COLOR` in format.ts is the event
 * palette, and two things called KIND_COLOR is one too many.
 */
export const TOKEN_COLOR: Record<TokenKind | 'image', string> = {
	cacheWrite: 'var(--hx-tok-write)',
	fresh: 'var(--hx-tok-new)',
	cached: 'var(--hx-tok-cached)',
	output: 'var(--hx-tok-out)',
	reasoning: 'var(--hx-tok-reason)',
	image: 'var(--hx-tok-image)'
};

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
