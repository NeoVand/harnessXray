<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { runTotals, money, compact, TOKEN_LABEL, TOKEN_COLOR } from '$lib/xray/usage';
	import { RATES_VERIFIED, CACHE_WRITE_RATE } from '$lib/agent/models';
	import { tip } from '$lib/hooks/tip';

	/**
	 * What the run cost, and which kind of token took the money.
	 *
	 * One figure and one table, deliberately — an earlier draft had a bar for
	 * spend and a second, separate bar for tokens, and two headed sections in one
	 * small panel read as two panels that had been stapled together.
	 *
	 * The figure is the whole argument. The same buckets, in the same order, are
	 * drawn twice: once by money, once by count. By count almost everything is a
	 * cache hit, because the entire conversation is re-sent every turn. By money
	 * almost nothing is. The segments visibly trade places between the two rows,
	 * and holding both readings at once is the thing worth learning — no single
	 * number can show it.
	 *
	 * The table then reads as a bill: one line per meter with a subtotal, its
	 * kinds indented beneath at their own rates. The indentation is load-bearing.
	 * The provider's counts overlap — cache reads and writes are inside
	 * `input_tokens`, reasoning is inside `output_tokens` — so listing them flat
	 * would read as additive and double the run. `splitTokens` in models.ts owns
	 * that resolution for both this panel and the cost function, so they cannot
	 * drift apart.
	 */
	const t = $derived.by(() => {
		void bus.version;
		return runTotals(bus, session.model);
	});

	const toolCalls = $derived.by(() => {
		void bus.version;
		return bus.events.filter((e) => e.kind === 'tool_start').length;
	});

	/** Billed tokens across both meters — the denominator for the token row. */
	const billedTokens = $derived(t.kinds.reduce((n, k) => n + k.tokens, 0));

	const spendPct = (usd: number) => (t.costUsd > 0 ? (usd / t.costUsd) * 100 : 0);
	const tokenPct = (n: number) => (billedTokens > 0 ? (n / billedTokens) * 100 : 0);

	/** Rates print as $2.5/M, not $2.500/M — trailing zeros are noise here. */
	const rate = (n: number) => `$${Number(n.toFixed(4))}/M`;

	const summary = $derived([
		['calls', String(t.calls + t.imageCalls)],
		['duration', `${(t.ms / 1000).toFixed(1)}s`],
		['context now', compact(t.lastInput)],
		['tool calls', String(toolCalls)],
		['files', String(session.fileList.length)],
		['memories', String(session.memories.length)]
	]);
</script>

<!-- Headerless on purpose: this panel lives behind the `ledger` tab, and an
     internal title bar would name it a second time an inch below the first. -->
<div class="h-full min-h-0 overflow-y-auto">
	<div class="px-3 pt-3 pb-3">
		{#if t.kinds.length === 0}
			<p class="text-xs text-muted-foreground">
				No model calls yet. Every count here comes from the provider's own usage object on the wire,
				never from an estimate.
			</p>
		{:else}
			<!-- ── the headline ─────────────────────────────────────────────── -->
			<div class="mb-3.5 flex items-baseline justify-between gap-2">
				<span class="hx-num text-[22px] leading-none tracking-tight" style:color="var(--hx-model)">
					{money(t.costUsd)}
				</span>
				<span class="hx-num text-[10px] text-muted-foreground">
					{compact(billedTokens)} billed tokens
				</span>
			</div>

			<!-- ── the figure ───────────────────────────────────────────────────
			     Two readings of one set of buckets. Same order, same colours, so
			     the eye can only read the difference in width. -->
			<div class="mb-4 space-y-1">
				{#each [{ id: 'spend', label: 'spend', of: (k: { usd: number }) => spendPct(k.usd) }, { id: 'tokens', label: 'tokens', of: (k: { tokens: number }) => tokenPct(k.tokens) }] as bar (bar.id)}
					<div class="flex items-center gap-2">
						<span class="hx-eyebrow w-[42px] shrink-0 text-[9px]">{bar.label}</span>
						<div class="flex h-2.5 flex-1 overflow-hidden rounded-[2px] bg-muted">
							{#each t.kinds as k (k.kind)}
								{@const pct = bar.of(k)}
								<span
									style:width="{pct}%"
									style:background={TOKEN_COLOR[k.kind]}
									{@attach tip(
										`${TOKEN_LABEL[k.kind]} — ${Math.round(pct)}% of ${bar.label} (${compact(k.tokens)} tokens, ${money(k.usd)})`
									)}
								></span>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- ── the bill ─────────────────────────────────────────────────────
			     One line per meter, its kinds indented beneath. -->
			<div class="space-y-2.5">
				{#each t.meters as m (m.id)}
					<div>
						<div
							class="hx-rule flex items-baseline gap-2 border-b pb-1 text-[11px] font-medium
							       text-foreground"
						>
							<span class="min-w-0 flex-1 truncate">{m.label}</span>
							<span class="hx-num shrink-0 text-muted-foreground">{compact(m.tokens)}</span>
							<span class="hx-num w-[52px] shrink-0 text-right">{money(m.usd)}</span>
						</div>

						{#each m.rows as k (k.kind)}
							<div class="mt-1 flex items-baseline gap-2 text-[11px]">
								<span
									class="mt-[3px] inline-block size-1.5 shrink-0 self-start rounded-[1px]"
									style:background={TOKEN_COLOR[k.kind]}
								></span>
								<span class="min-w-0 flex-1 truncate text-muted-foreground">
									{TOKEN_LABEL[k.kind]}
								</span>
								<!-- The rate is the entire explanation for why the two bars
								     disagree, so it sits on the row, not in a footnote. -->
								<span class="hx-num shrink-0 text-[9px] text-muted-foreground/55">
									{rate(k.rate)}
								</span>
								<span class="hx-num w-[38px] shrink-0 text-right text-muted-foreground">
									{compact(k.tokens)}
								</span>
								<span class="hx-num w-[52px] shrink-0 text-right">{money(k.usd)}</span>
							</div>
						{/each}

						{#if m.unpriced}
							<div class="mt-1 flex items-baseline gap-2 text-[11px]">
								<span class="size-1.5 shrink-0"></span>
								<span
									class="min-w-0 flex-1 truncate text-muted-foreground/55"
									{@attach tip(
										'Counted on the wire but not priced — only the image output rate was ever verified, and inventing an input rate to make the column add up is exactly the plausible-but-wrong number this app exists to replace.'
									)}
								>
									{m.unpriced.note}
								</span>
								<span class="hx-num w-[38px] shrink-0 text-right text-muted-foreground/55">
									{compact(m.unpriced.tokens)}
								</span>
								<span class="hx-num w-[52px] shrink-0 text-right text-muted-foreground/40">—</span>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- ── the notes ────────────────────────────────────────────────────
			     Two facts that make the table above readable rather than merely
			     numeric, and only shown when the run actually contains them. -->
			<div class="mt-3.5 space-y-1 text-[10px] leading-relaxed text-muted-foreground/70">
				{#if t.cacheWrite}
					<p>
						<span style:color="var(--hx-tok-write)">Cache writes</span>
						are new tokens on their way into the cache, billed at {CACHE_WRITE_RATE}× the uncached
						rate — dearer than fresh input, and the reason a first turn costs more than it looks.
					</p>
				{/if}
				{#if t.reasoning}
					<p>
						<span style:color="var(--hx-tok-reason)">Reasoning</span>
						is thinking you never see. It bills as output and occupies the window all the same.
					</p>
				{/if}
			</div>

			<!-- ── the run ──────────────────────────────────────────────────── -->
			<div class="hx-rule mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2.5">
				{#each summary as [k, v] (k)}
					<div class="flex items-baseline justify-between gap-2 text-[10px]">
						<span class="truncate text-muted-foreground">{k}</span>
						<span class="hx-num shrink-0">{v}</span>
					</div>
				{/each}
			</div>

			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/55">
				{session.model} list rates, verified {RATES_VERIFIED}. `cache_write_tokens` is read off the
				wire because LangChain's normalised usage drops it.
			</p>
		{/if}
	</div>
</div>
