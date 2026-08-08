<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { bus } from '$lib/xray/bus.svelte';
	import { crew } from '$lib/xray/crew';
	import { compact } from '$lib/xray/usage';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	/**
	 * The crew, with the asymmetry made visible.
	 *
	 * The book's claim about subagents is arithmetic: a reader burns forty
	 * thousand tokens on a paper and hands back two hundred words, and the parent
	 * pays only for the two hundred. The app asserted that and never showed it.
	 * Every row here carries both numbers — what the subagent spent inside its own
	 * window, and what actually came back to the parent.
	 *
	 * The roster itself is read off the `task` schema on the wire, which is why it
	 * includes `general-purpose`: the harness appends that one, hands it the main
	 * agent's entire tool set, and nothing in this app declares it.
	 */
	interface Props {
		onjump?: (eventId: string) => void;
	}
	let { onjump }: Props = $props();

	const roster = $derived.by(() => {
		void bus.version;
		return crew(bus);
	});

	const open = new SvelteSet<string>();
	function toggle(name: string) {
		if (!open.delete(name)) open.add(name);
	}

	const dispatched = $derived(roster.reduce((n, m) => n + m.calls.n, 0));
	const spent = $derived(roster.reduce((n, m) => n + m.spent, 0));
</script>

<div class="h-full min-h-0 overflow-y-auto">
	<div class="px-3 pt-3 pb-3">
		{#if !roster.length}
			<p class="text-xs leading-relaxed text-muted-foreground">
				Read off the <span class="font-mono">task</span> schema on the wire, so it needs a wire: after
				the first message this lists every subagent the model may dispatch — including the one the harness
				adds without being asked.
			</p>
		{:else}
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<span class="hx-num text-[15px]" style:color="var(--hx-subagent)">
					{roster.length}
				</span>
				<span class="hx-num text-[10px] text-muted-foreground">
					{dispatched} dispatched · {compact(spent)} spent inside
				</span>
			</div>
			<p class="mb-3 text-[10px] leading-relaxed text-muted-foreground">
				Each runs a whole agent inside one tool call — its own context window, tools and prompt.
				Only the final reply reaches the parent.
			</p>

			{#each roster as m (m.name)}
				{@const isOpen = open.has(m.name)}
				<div class="hx-rule border-b last:border-b-0">
					<button
						class="flex w-full items-center gap-2 py-1.5 text-left transition-colors
						       hover:bg-muted/50"
						onclick={() => toggle(m.name)}
						aria-expanded={isOpen}
					>
						<span
							class="inline-block size-1.5 shrink-0 rounded-full"
							style:background={m.origin === 'ours' ? 'var(--hx-subagent)' : 'var(--hx-interrupt)'}
							style:opacity={m.calls.n ? 1 : 0.5}
						></span>
						<span
							class="min-w-0 flex-1 truncate font-mono text-[11px]"
							class:text-muted-foreground={!m.calls.n}
						>
							{m.name}
						</span>
						{#if m.tools.known}
							<span class="hx-num shrink-0 text-[9px] text-muted-foreground/60">
								{m.tools.count}t
							</span>
						{/if}
						<!-- The trade, on the row: paid inside, received outside. -->
						{#if m.spent || m.returned}
							<span class="hx-num shrink-0 text-[9.5px] whitespace-nowrap">
								<span style:color="var(--hx-subagent)">{compact(m.spent)}</span>
								<span class="text-muted-foreground/50">in ·</span>
								<span class="text-foreground/75">{compact(m.returned)}</span>
								<span class="text-muted-foreground/50">back</span>
							</span>
						{/if}
						<span class="hx-num w-7 shrink-0 text-right text-[10px]">
							{#if m.calls.n}
								<span style:color="var(--hx-subagent)">×{m.calls.n}</span>
							{:else}
								<span class="text-muted-foreground/40">—</span>
							{/if}
						</span>
						<span
							class="shrink-0 text-muted-foreground/50 transition-transform"
							style:transform={isOpen ? 'rotate(0deg)' : 'rotate(-90deg)'}
						>
							<HugeiconsIcon icon={ICON.expand} size={10} strokeWidth={1.5} />
						</span>
					</button>

					{#if isOpen}
						<div class="space-y-2 pb-2.5 pl-5">
							<p class="text-[10.5px] leading-relaxed text-foreground/75">
								{m.description || '(no description on the wire)'}
							</p>

							{#if m.origin === 'harness'}
								<p
									class="hx-rule rounded border px-2 py-1.5 text-[10px] leading-relaxed"
									style:border-color="color-mix(in oklab, var(--hx-interrupt) 40%, transparent)"
								>
									<span class="hx-eyebrow" style:color="var(--hx-interrupt)">not yours</span>
									— <span class="font-mono">createDeepAgent</span> appends this one unless
									<span class="font-mono">generalPurposeSubagent</span>
									is disabled, and hands it the main agent's whole tool set ({m.tools.count} tools) plus
									the harness's own default prompt.
								</p>
							{/if}

							{#if m.toolNames.length}
								<div>
									<p class="hx-eyebrow mb-1">its tools</p>
									<p class="flex flex-wrap gap-1">
										{#each m.toolNames as t (t)}
											<span
												class="hx-rule rounded border px-1.5 py-0.5 font-mono text-[9.5px]
												       text-muted-foreground"
											>
												{t}
											</span>
										{/each}
									</p>
								</div>
							{/if}

							{#if m.spent || m.returned}
								<div>
									<p class="hx-eyebrow mb-1">the trade</p>
									<p class="text-[10px] leading-relaxed text-muted-foreground">
										It read <span class="hx-num text-foreground/80">
											{m.spent.toLocaleString()}
										</span>
										input tokens inside its own window. The parent received
										<span class="hx-num text-foreground/80">
											{m.returned.toLocaleString()}
										</span>
										characters and pays for those on every turn after — everything else was thrown away
										with the window.
									</p>
									<p class="mt-1 text-[9.5px] leading-relaxed text-muted-foreground/60">
										Attributed by dispatch window: `task` is awaited, so model calls landing between
										a dispatch and its result were made by that subagent. The wire itself cannot say
										— the model is built once with scope `main`, so every request is main-scoped
										however deep it originated.{#if m.spentAmbiguous}
											Some calls overlapped concurrent dispatches and are counted against neither.{/if}
									</p>
								</div>
							{/if}

							{#if m.prompt}
								<div>
									<p class="hx-eyebrow mb-1">its own system prompt</p>
									<pre
										class="hx-rule max-h-40 overflow-auto rounded border bg-muted/25 px-2 py-1.5
										       font-mono text-[9.5px] leading-relaxed whitespace-pre-wrap">{m.prompt}</pre>
								</div>
							{/if}

							{#if m.calls.n}
								<button
									class="hx-eyebrow transition-colors hover:text-foreground"
									style:color="var(--hx-subagent)"
									onclick={() => onjump?.(m.calls.last)}
								>
									jump to last dispatch →
								</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>
