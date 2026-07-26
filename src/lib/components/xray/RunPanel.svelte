<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { runTotals, money, compact } from '$lib/xray/usage';
	import { RATES_VERIFIED } from '$lib/agent/models';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	/**
	 * What the run actually cost.
	 *
	 * The bar is the point of the panel. On any turn past the first, almost all
	 * input is a cache hit — you are re-sending the entire conversation every
	 * time, and only the sliver on the left is new. That is the single most
	 * useful thing to understand about paying for an agent, and it is invisible
	 * everywhere else.
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
</script>

<div class="relative h-full min-h-0">
	<!-- Floating over the numbers rather than sitting above them, so the run
	     accounting slides under it as you scroll. -->
	<header
		class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-7 items-center
		       justify-between border-y px-3"
	>
		<span class="hx-eyebrow flex items-center gap-1.5">
			<HugeiconsIcon icon={ICON.tokens} size={12} strokeWidth={1.5} />
			run
		</span>
		<span class="hx-num text-[10px] text-muted-foreground">
			{(t.ms / 1000).toFixed(1)}s
		</span>
	</header>

	<div class="h-full overflow-y-auto px-3 pt-9 pb-2.5">
		{#if t.calls === 0}
			<p class="text-xs text-muted-foreground">
				No model calls yet. Token counts here come from the provider's own usage object on the wire,
				not from an estimate.
			</p>
		{:else}
			<!-- headline -->
			<div class="mb-3 flex items-baseline justify-between">
				<span class="hx-num text-lg" style:color="var(--hx-model)">{money(t.costUsd)}</span>
				<span class="hx-num text-[11px] text-muted-foreground">
					{compact(t.total)} tokens · {t.calls} calls
				</span>
			</div>

			<!-- fresh vs cached input -->
			<div class="mb-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
				<span style:width="{freshPct}%" style:background="var(--hx-model)"></span>
				<span
					style:width="{100 - freshPct}%"
					style:background="var(--hx-state)"
					style:opacity="0.45"
				></span>
			</div>
			<p class="mb-4 text-[10px] text-muted-foreground">
				<span style:color="var(--hx-model)">{compact(t.input - t.cached)} new</span>
				· {compact(t.cached)} cached ({Math.round(100 - freshPct)}% of input re-sent)
			</p>

			<dl class="space-y-1 text-[11px]">
				{#each [['input', compact(t.input)], ['cached', compact(t.cached)], ['cache write', compact(t.cacheWrite)], ['output', compact(t.output)], ['reasoning', compact(t.reasoning)]] as [k, v] (k)}
					<div class="flex justify-between">
						<dt class="text-muted-foreground">{k}</dt>
						<dd class="hx-num">{v}</dd>
					</div>
				{/each}
				{#if t.imageCalls}
					<!-- A different meter, kept visibly separate: image output is billed
					     around 30× a text token, and hiding it inside "output" is how a
					     $0.12 picture looks like a rounding error. -->
					<div class="flex justify-between">
						<dt class="text-muted-foreground">image gen</dt>
						<dd class="hx-num">
							{t.imageCalls} × · {compact(t.imageOut)} tok · {money(t.imageUsd)}
						</dd>
					</div>
				{/if}
			</dl>

			<div class="hx-rule mt-3 border-t pt-2.5">
				<dl class="space-y-1 text-[11px]">
					{#each [['context now', compact(t.lastInput)], ['tool calls', String(toolCalls)], ['files', String(session.fileList.length)], ['memories', String(session.memories.length)]] as [k, v] (k)}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">{k}</dt>
							<dd class="hx-num">{v}</dd>
						</div>
					{/each}
				</dl>
			</div>

			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/60">
				Cost uses {session.model} list rates verified {RATES_VERIFIED}. `cache_write_tokens` is read
				from the wire — LangChain's normalised usage drops it.
			</p>
		{/if}
	</div>
</div>
