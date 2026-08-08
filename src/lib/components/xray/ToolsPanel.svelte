<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { bus } from '$lib/xray/bus.svelte';
	import { shotStubs, shotAt } from '$lib/xray/context';
	import { compact } from '$lib/xray/usage';
	import { toolMeta } from '$lib/agent/tool-meta';
	import { crew } from '$lib/xray/crew';
	import { tip } from '$lib/hooks/tip';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import JsonCode from './JsonCode.svelte';

	/**
	 * The toolbox, given room.
	 *
	 * It used to live behind a click on the graph's `tools` node, at 236px, which
	 * meant almost nobody found it and it could never show the number that
	 * matters: what each schema COSTS. Every tool's description and parameter
	 * shape is re-sent on every single request whether it is called or not, so a
	 * tool nobody uses is still a bill every turn — the standing cost the book
	 * talks about and the app could not quantify per tool.
	 *
	 * Read off the last request on the wire, like the graph's toolbox was, and
	 * for the same reason: the wire is the only account of the tool set that the
	 * model itself sees. Our own registry would show what we MEANT to send.
	 */
	interface Props {
		/** Move the timeline to a tool's most recent call. */
		onjump?: (eventId: string) => void;
	}
	let { onjump }: Props = $props();

	const shot = $derived.by(() => {
		void bus.version;
		const last = shotStubs(bus).at(-1);
		return last ? shotAt(bus, last.id) : undefined;
	});

	/** Calls per tool name, and the last one, folded from the timeline. */
	const calls = $derived.by(() => {
		void bus.version;
		const out: Record<string, { n: number; last: string }> = {};
		for (const e of bus.events) {
			if (e.kind !== 'tool_start') continue;
			const c = (out[e.name] ??= { n: 0, last: '' });
			c.n++;
			c.last = e.id;
		}
		return out;
	});

	const roster = $derived.by(() => {
		void bus.version;
		return crew(bus);
	});

	const rows = $derived(
		(shot?.pieces ?? [])
			.filter((p) => p.group === 'tools')
			.map((p) => ({
				name: p.label,
				note: p.note ?? '',
				// The literal schema as it went out — description, parameter types,
				// enums, defaults. This is the whole of what the tool IS to the model,
				// and it is what the token count is counting.
				schema: p.text,
				tokens: p.tokens,
				chars: p.chars,
				meta: toolMeta(p.label),
				call: calls[p.label]
			}))
	);

	/**
	 * Which descriptions are open.
	 *
	 * These were tooltips at first, which was a mistake worth recording: a tool's
	 * description is not a hint, it is a document — write_todos alone is three
	 * thousand tokens of instructions — and a bubble that size follows the pointer
	 * around covering the panel it is meant to annotate. A description you want to
	 * READ belongs in the flow of the page, at a size you chose.
	 */
	const open = new SvelteSet<string>();
	function toggle(name: string) {
		if (!open.delete(name)) open.add(name);
	}

	/**
	 * Descriptions opened past their first few lines.
	 *
	 * Two levels, deliberately. Opening a tool should answer "what is this and
	 * what does it cost" at a glance; write_todos' description alone is three
	 * thousand tokens and would bury the schema underneath it. So the prose is
	 * clamped and the schema — the part that is actually structural — sits
	 * directly beneath, one click from the row rather than two.
	 */
	const openProse = new SvelteSet<string>();
	function toggleProse(name: string) {
		if (!openProse.delete(name)) openProse.add(name);
	}

	const total = $derived(rows.reduce((n, r) => n + r.tokens, 0));
	const used = $derived(rows.filter((r) => r.call).length);
	/** Widest schema, so the share bars have a sensible full scale. */
	const widest = $derived(Math.max(1, ...rows.map((r) => r.tokens)));
</script>

<div class="h-full min-h-0 overflow-y-auto">
	<div class="px-3 pt-3 pb-3">
		{#if !rows.length}
			<p class="text-xs leading-relaxed text-muted-foreground">
				Read off the wire, so it needs a wire: after the first message this lists every tool the
				model was actually offered, and what each one costs to offer.
			</p>
		{:else}
			<div class="mb-3 flex items-baseline justify-between gap-2">
				<span class="hx-num text-[15px]" style:color="var(--hx-tool)">
					{compact(total)}
				</span>
				<span class="hx-num text-[10px] text-muted-foreground">
					{rows.length} tools · {used} used
				</span>
			</div>
			<p class="mb-3 text-[10px] leading-relaxed text-muted-foreground">
				Re-sent on <em class="text-foreground/80 not-italic">every</em> request, called or not. A tool
				you never use still costs this much per turn.
			</p>

			{#each rows as r (r.name)}
				{@const isTask = r.name === 'task' && roster.length > 0}
				{@const isOpen = open.has(r.name)}
				<div class="hx-rule border-b last:border-b-0">
					<button
						class="flex w-full items-center gap-2 py-1.5 text-left transition-colors
						       hover:bg-muted/50"
						onclick={() => toggle(r.name)}
						aria-expanded={isOpen}
						{@attach tip(r.meta.blurb || 'the schema the model is shown')}
					>
						<span
							class="shrink-0"
							style:color={r.meta.origin === 'ours' ? 'var(--hx-tool)' : 'var(--muted-foreground)'}
							style:opacity={r.call ? 1 : 0.5}
						>
							<HugeiconsIcon icon={r.meta.icon} size={12} strokeWidth={1.5} />
						</span>
						<span
							class="min-w-0 flex-1 truncate font-mono text-[11px]"
							class:text-muted-foreground={!r.call}
						>
							{r.name}
						</span>

						<!-- The schema's share of the tool band. The point of the row: a
						     description twenty times longer than its neighbour's is a
						     twentyfold bill, every turn, forever. -->
						<span class="hidden h-1 w-14 shrink-0 bg-muted sm:block">
							<span
								class="block h-full"
								style:width="{Math.max(3, (r.tokens / widest) * 100)}%"
								style:background={r.meta.origin === 'ours'
									? 'var(--hx-tool)'
									: 'var(--muted-foreground)'}
								style:opacity={r.call ? 0.9 : 0.4}
							></span>
						</span>
						<span class="hx-num w-10 shrink-0 text-right text-[10px] text-muted-foreground">
							{compact(r.tokens)}
						</span>
						<span class="hx-num w-7 shrink-0 text-right text-[10px]">
							{#if r.call}
								<span style:color="var(--hx-tool)">×{r.call.n}</span>
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
						{@const proseOpen = openProse.has(r.name)}
						<div class="pb-2 pl-6">
							<!-- The description the model reads when deciding whether the tool
							     applies — clamped, because some of these are documents. -->
							<p
								class="text-[10.5px] leading-relaxed whitespace-pre-wrap text-foreground/75"
								class:clamped={!proseOpen}
							>
								{r.note || '(no description on the wire)'}
							</p>
							{#if (r.note?.length ?? 0) > 180}
								<button
									class="hx-eyebrow mt-0.5 transition-colors hover:text-foreground"
									onclick={() => toggleProse(r.name)}
								>
									{proseOpen ? 'less' : 'more'}
								</button>
							{/if}

							<p class="hx-eyebrow mt-2 mb-1">the schema, as it went out</p>
							<div class="hx-rule max-h-56 overflow-auto rounded border">
								<JsonCode source={r.schema} />
							</div>

							<p class="hx-eyebrow mt-1.5 flex flex-wrap items-baseline gap-x-3">
								<span>
									{r.meta.origin === 'ours' ? 'written for this agent' : 'supplied by the harness'}
								</span>
								<span class="hx-num text-[9px] text-muted-foreground">
									{r.chars.toLocaleString()} chars · {compact(r.tokens)} tokens
								</span>
								{#if r.call}
									<button
										class="hx-eyebrow transition-colors hover:text-foreground"
										style:color="var(--hx-tool)"
										onclick={() => onjump?.(r.call.last)}
									>
										jump to last call →
									</button>
								{/if}
							</p>
						</div>
					{/if}

					{#if isTask}
						<!-- The crew, under the one tool that dispatches it. Not a separate
						     panel: which subagents exist is a property of the task schema,
						     and this is where you are already looking at that schema. -->
						{#each roster as m (m.name)}
							<button
								class="flex w-full items-center gap-2 py-1 pl-6 text-left transition-colors
								       hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent"
								disabled={!m.calls.n}
								onclick={() => m.calls.n && onjump?.(m.calls.last)}
								{@attach tip(
									m.origin === 'harness'
										? "Added by the harness, not declared by this app — it carries the main agent's whole tool set"
										: 'a subagent this app declares'
								)}
							>
								<span
									class="inline-block size-1 shrink-0 rounded-full"
									style:background={m.origin === 'ours'
										? 'var(--hx-subagent)'
										: 'var(--hx-interrupt)'}
									style:opacity={m.calls.n ? 1 : 0.5}
								></span>
								<span
									class="min-w-0 flex-1 truncate font-mono text-[10px]"
									class:text-muted-foreground={!m.calls.n}
								>
									{m.name}
								</span>
								{#if m.tools.known}
									<span class="hx-num shrink-0 text-[9px] text-muted-foreground/60">
										{m.tools.count} tools
									</span>
								{/if}
								<span class="hx-num w-7 shrink-0 text-right text-[10px]">
									{#if m.calls.n}
										<span style:color="var(--hx-subagent)">×{m.calls.n}</span>
									{:else}
										<span class="text-muted-foreground/40">—</span>
									{/if}
								</span>
							</button>
						{/each}
					{/if}
				</div>
			{/each}

			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/60">
				<span style:color="var(--hx-tool)">ochre</span>
				— written for this agent ·
				<span class="text-muted-foreground">grey</span>
				— supplied by the harness{#if roster.some((m) => m.origin === 'harness')}
					·
					<span style:color="var(--hx-interrupt)">amber</span>
					— a subagent the harness added{/if}. A row jumps to its last call.
			</p>
		{/if}
	</div>
</div>

<style>
	/* Four lines is enough to tell a search tool from a citation tool; past that
	   it is a document, and documents get a "more". */
	.clamped {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		overflow: hidden;
	}
</style>
