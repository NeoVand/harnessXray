<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { runTotals, money, compact, TOKEN_LABEL, TOKEN_COLOR } from '$lib/xray/usage';
	import { RATES_VERIFIED, CACHE_WRITE_RATE } from '$lib/agent/models';
	import { tip } from '$lib/hooks/tip';

	/**
	 * What the run actually cost, and which kind of token took the money.
	 *
	 * The lesson of this panel is that "tokens" is not one thing. On the same
	 * model a cached input token and a reasoning token differ by roughly sixty
	 * times, so a count of tokens tells you almost nothing about a bill. Two
	 * bars say it: one splits the *tokens* (nearly all cached, on any turn past
	 * the first — you re-send the whole conversation every time) and one splits
	 * the *spend* (nearly all output and reasoning). They point opposite ways,
	 * and that contradiction is the thing worth teaching.
	 *
	 * The buckets are disjoint and sum to the headline, which takes care: the
	 * provider's own counts overlap, with cache reads and writes inside
	 * `input_tokens` and reasoning inside `output_tokens`. `splitTokens` in
	 * models.ts owns that resolution so this panel and the cost function can
	 * never drift apart.
	 */
	const t = $derived.by(() => {
		void bus.version;
		return runTotals(bus, session.model);
	});

	const freshPct = $derived(t.input ? ((t.input - t.cached) / t.input) * 100 : 0);
	const toolCalls = $derived.by(() => {
		void bus.version;
		return bus.events.filter((e) => e.kind === 'tool_start').length;
	});

	/** Share of total spend, for the bar and the per-row percentage. */
	const share = (usd: number) => (t.costUsd > 0 ? (usd / t.costUsd) * 100 : 0);

	const textPct = $derived(share(t.textUsd));
</script>

<!-- Headerless on purpose: this panel lives behind the `ledger` tab now, and
     an internal title bar would name it a second time an inch below the
     first. The duration joined the totals list instead. -->
<div class="h-full min-h-0 overflow-y-auto">
	<div class="px-3 pt-2.5 pb-3">
		{#if t.calls === 0 && t.imageCalls === 0}
			<p class="text-xs text-muted-foreground">
				No model calls yet. Token counts here come from the provider's own usage object on the wire,
				not from an estimate.
			</p>
		{:else}
			<!-- headline -->
			<div class="mb-3 flex items-baseline justify-between">
				<span class="hx-num text-lg" style:color="var(--hx-model)">{money(t.costUsd)}</span>
				<span class="hx-num text-[11px] text-muted-foreground">
					<!-- Image prompt tokens are counted here even though they are not
					     priced: the headline claims a token count, and they were on the
					     wire. The footnote says which of them reached the bill. -->
					{compact(t.total + t.imageIn + t.imageOut)} tokens · {t.calls + t.imageCalls} calls
				</span>
			</div>

			<!-- ── where the money went ─────────────────────────────────────────
			     Disjoint buckets, widest spend first. -->
			<p class="hx-eyebrow mb-1.5">spend by token kind</p>
			<div class="mb-2 flex h-2 overflow-hidden rounded-[2px] bg-muted">
				{#each t.kinds as k (k.kind)}
					<span
						style:width="{share(k.usd)}%"
						style:background={TOKEN_COLOR[k.kind]}
						{@attach tip(
							`${TOKEN_LABEL[k.kind]} — ${money(k.usd)}, ${Math.round(share(k.usd))}% of spend`
						)}
					></span>
				{/each}
			</div>

			<dl class="mb-1 space-y-1 text-[11px]">
				{#each t.kinds as k (k.kind)}
					<div class="flex items-baseline gap-2">
						<dt class="flex min-w-0 flex-1 items-baseline gap-1.5 text-muted-foreground">
							<span
								class="inline-block size-1.5 shrink-0 translate-y-[-1px] rounded-[1px]"
								style:background={TOKEN_COLOR[k.kind]}
							></span>
							<span class="truncate">{TOKEN_LABEL[k.kind]}</span>
							<!-- The rate is the whole explanation for why the two bars
							     disagree, so it is on the row rather than in a footnote. -->
							<span class="hx-num shrink-0 text-[9px] text-muted-foreground/60">
								${k.rate}/M
							</span>
						</dt>
						<dd class="hx-num shrink-0 text-muted-foreground">{compact(k.tokens)}</dd>
						<dd class="hx-num w-14 shrink-0 text-right">{money(k.usd)}</dd>
					</div>
				{/each}
			</dl>

			{#if t.imageCalls}
				<!-- Two meters, stated as two. Image output bills around thirty times a
				     text output token, so a single picture can outweigh a whole
				     conversation — and hiding it inside "output" is how a $0.12 image
				     looks like a rounding error. -->
				<p class="hx-rule mt-2 border-t pt-2 text-[10px] text-muted-foreground">
					<span style:color="var(--hx-model)">text {money(t.textUsd)}</span>
					<span class="opacity-60">({Math.round(textPct)}%)</span>
					·
					<span style:color="var(--hx-tool)">image {money(t.imageUsd)}</span>
					<span class="opacity-60">({Math.round(100 - textPct)}%)</span>
					· {t.imageCalls}
					{t.imageCalls === 1 ? 'picture' : 'pictures'}, {compact(t.imageIn)} prompt tokens not priced
				</p>
			{/if}

			<!-- ── the tokens themselves ────────────────────────────────────────
			     The counterweight to the spend bar: by count, almost everything is
			     a cache hit. -->
			<div class="hx-rule mt-3 border-t pt-2.5">
				<p class="hx-eyebrow mb-1.5">input tokens, new vs re-sent</p>
				<div class="mb-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
					<span style:width="{freshPct}%" style:background="var(--hx-subagent)"></span>
					<span
						style:width="{100 - freshPct}%"
						style:background="var(--hx-state)"
						style:opacity="0.45"
					></span>
				</div>
				<p class="text-[10px] text-muted-foreground">
					<span style:color="var(--hx-subagent)">{compact(t.input - t.cached)} new</span>
					· {compact(t.cached)} cached ({Math.round(100 - freshPct)}% of input re-sent)
				</p>

				<!-- Indented to show containment, because these counts are not
				     siblings: the provider reports cache reads and writes inside
				     input_tokens, and reasoning inside output_tokens. -->
				<dl class="mt-2 space-y-1 text-[11px]">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">input</dt>
						<dd class="hx-num">{compact(t.input)}</dd>
					</div>
					<div class="flex justify-between pl-3">
						<dt class="text-muted-foreground/70">of which cached</dt>
						<dd class="hx-num text-muted-foreground">{compact(t.cached)}</dd>
					</div>
					<div class="flex justify-between pl-3">
						<dt
							class="text-muted-foreground/70"
							{@attach tip(
								`Newly-cached tokens, billed at ${CACHE_WRITE_RATE}× the uncached input rate on this model family`
							)}
						>
							of which written to cache
						</dt>
						<dd class="hx-num text-muted-foreground">{compact(t.cacheWrite)}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">output</dt>
						<dd class="hx-num">{compact(t.output)}</dd>
					</div>
					<div class="flex justify-between pl-3">
						<dt
							class="text-muted-foreground/70"
							{@attach tip(
								'Hidden thinking. It never reaches you, occupies the context window, and bills at the output rate.'
							)}
						>
							of which reasoning
						</dt>
						<dd class="hx-num text-muted-foreground">{compact(t.reasoning)}</dd>
					</div>
				</dl>
			</div>

			<div class="hx-rule mt-3 border-t pt-2.5">
				<dl class="space-y-1 text-[11px]">
					{#each [['duration', (t.ms / 1000).toFixed(1) + 's'], ['context now', compact(t.lastInput)], ['tool calls', String(toolCalls)], ['files', String(session.fileList.length)], ['memories', String(session.memories.length)]] as [k, v] (k)}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">{k}</dt>
							<dd class="hx-num">{v}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/60">
				{session.model} list rates, verified {RATES_VERIFIED}. Every count is the provider's own —
				`cache_write_tokens` is read off the wire, because LangChain's normalised usage drops it.
				Image prompt tokens are counted but not priced.
			</p>
		{/if}
	</div>
</div>
