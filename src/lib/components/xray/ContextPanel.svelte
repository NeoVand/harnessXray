<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { bus } from '$lib/xray/bus.svelte';
	import { shotStubs, shotAt, groupTotals, type PieceGroup } from '$lib/xray/context';
	import { COMPACT_AT } from '$lib/agent/models';
	import { session } from '$lib/agent/session.svelte';
	import { compact } from '$lib/xray/usage';
	import { bytes } from '$lib/xray/format';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	/**
	 * The context window, opened up.
	 *
	 * Everything here is read back off the request that actually went out, which
	 * is the only version that is true — the alternative, adding up what we think
	 * we sent, is exactly the kind of plausible-but-wrong account this app exists
	 * to replace. So the tool schemas are the ones on the wire, the system prompt
	 * is the assembled one, and the token total is what the provider billed.
	 *
	 * The scrubber matters as much as the breakdown. A context is not a thing,
	 * it is a thing that grows: watching the same three bands swell turn after
	 * turn, and then snap back when the harness compacts, teaches something no
	 * single snapshot does.
	 */

	let {
		/** Groups to leave out. Empty means everything. */
		hidden = new SvelteSet<string>(),
		/** Room for the frosted tab bar floating above us. */
		topPad = '0px'
	}: { hidden?: Set<string>; topPad?: string } = $props();

	const stubs = $derived.by(() => {
		void bus.version;
		return shotStubs(bus);
	});

	/** null means "follow the run". */
	let pinnedId = $state<string | null>(null);

	const currentId = $derived(pinnedId ?? stubs.at(-1)?.id ?? null);
	const shot = $derived.by(() => {
		void bus.version;
		return currentId ? shotAt(bus, currentId) : undefined;
	});

	const index = $derived(stubs.findIndex((s) => s.id === currentId));
	const totals = $derived(shot ? groupTotals(shot) : { system: 0, tools: 0, messages: 0 });

	const used = $derived(shot ? Math.min(1, shot.tokens / shot.limit) : 0);
	/** Anything past this and the harness folds the conversation up. */
	const threshold = COMPACT_AT;

	/**
	 * Where the cache stopped matching, as a row index.
	 *
	 * OpenAI's implicit caching matches a *prefix* of the request, and
	 * `cached_tokens` says how long that prefix was. Rows are shown in request
	 * order, so walking their apportioned sizes until the count is spent finds
	 * the row the boundary lands in. Every number in this is apportioned rather
	 * than measured — which is why the UI says ≈ and shades rather than rules.
	 */
	const cacheEdge = $derived.by(() => {
		if (!shot || !shot.cached || !shot.measured) return -1;
		let remaining = shot.cached;
		for (let i = 0; i < shot.pieces.length; i++) {
			remaining -= shot.pieces[i].tokens;
			if (remaining <= 0) return i;
		}
		return shot.pieces.length - 1;
	});
	const indexOfPiece = $derived(new Map(shot?.pieces.map((p, i) => [p.id, i]) ?? []));

	// A SvelteSet so a row toggling open is a mutation, not a copy of the set.
	const open = new SvelteSet<string>();
	function toggle(id: string) {
		if (!open.delete(id)) open.add(id);
	}

	/**
	 * Two readings of the same call: cut into pieces, or the body whole.
	 *
	 * The raw view exists because the pieces view is an *interpretation* — a
	 * useful one, but you should always be able to fall back to the thing
	 * itself and feel how long the request has actually become.
	 */
	let view = $state<'pieces' | 'raw'>('pieces');

	const rawReq = $derived.by(() => {
		void bus.version;
		const e = currentId ? bus.byId(currentId) : undefined;
		return e && e.kind === 'http_request' ? e : undefined;
	});
	/** Pretty-printed lazily — the pieces view never pays for the stringify. */
	const rawText = $derived(view === 'raw' && rawReq ? JSON.stringify(rawReq.body, null, 2) : '');

	function step(by: number) {
		if (!stubs.length) return;
		const at = Math.max(0, Math.min(stubs.length - 1, (index < 0 ? stubs.length - 1 : index) + by));
		pinnedId = at === stubs.length - 1 ? null : stubs[at].id;
	}

	const GROUPS: { id: PieceGroup; label: string; note: string }[] = [
		{ id: 'system', label: 'system prompt', note: 'one string, assembled from many' },
		{ id: 'tools', label: 'tool schemas', note: 'every schema, every request' },
		{ id: 'messages', label: 'messages', note: 'the conversation so far' }
	];

	const GROUP_COLOR: Record<PieceGroup, string> = {
		system: 'var(--hx-model)',
		tools: 'var(--hx-tool)',
		messages: 'var(--hx-user)'
	};

	const pct = (n: number) => (shot && shot.tokens ? (n / shot.tokens) * 100 : 0);

	/** Height of our own sticky header, so group headings can stack under it. */
	const HEADER = 32;
	const under = $derived(`calc(${topPad} + ${HEADER}px)`);
</script>

<!--
	One scroll container, not a fixed head and a scrolling tail.

	The gauge is the biggest block here and pinning it would cost a third of the
	panel on every glance — and it does not need pinning, because the same number
	is already in the tab bar and the status rail. Letting it scroll means the
	whole panel passes under the frosted chrome, which is where the layering
	reads.
-->
<div class="h-full min-h-0 overflow-y-auto">
	<!--
		A spacer, not padding on the scroller.

		Sticky offsets and the scroller's own padding stack: `padding-top: 36px`
		with `top: 36px` puts the header 72px down, which reads as a band of dead
		space above the controls. A plain block of the same height leaves the
		sticky arithmetic unambiguous — the header's resting position and its stuck
		position are the same number.
	-->
	<div style:height={topPad}></div>

	<header
		class="hx-rule hx-frost sticky z-20 flex items-center gap-3 border-b px-3"
		style:top={topPad}
		style:height="{HEADER}px"
	>
		{#if stubs.length > 1}
			<!-- No title here: the tab immediately above already says `context`,
			     and an icon repeating it was the third time in two inches. -->
			<div class="flex items-center gap-1">
				<button
					class="px-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
					onclick={() => step(-1)}
					disabled={index <= 0}
					aria-label="Previous model call"
				>
					<span class="inline-block rotate-180"
						><HugeiconsIcon icon={ICON.next} size={12} strokeWidth={1.5} /></span
					>
				</button>
				<span class="hx-num text-[10px] text-muted-foreground">
					{index < 0 ? stubs.length : index + 1}/{stubs.length}
				</span>
				<button
					class="px-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
					onclick={() => step(1)}
					disabled={index === stubs.length - 1 || index < 0}
					aria-label="Next model call"
				>
					<HugeiconsIcon icon={ICON.next} size={12} strokeWidth={1.5} />
				</button>
				<span class="hx-eyebrow ml-1">model calls</span>
			</div>
		{/if}

		<div class="ml-auto flex items-center gap-3">
			{#if stubs.length}
				<!-- The same request, two readings: interpreted, or verbatim. -->
				<div class="flex items-center gap-1.5">
					<button
						class="hx-eyebrow transition-colors {view === 'pieces'
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (view = 'pieces')}
						aria-pressed={view === 'pieces'}
						title="The request cut into system prompt, schemas and messages"
					>
						pieces
					</button>
					<span class="text-[10px] text-muted-foreground/40">·</span>
					<button
						class="hx-eyebrow transition-colors {view === 'raw'
							? 'text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (view = 'raw')}
						aria-pressed={view === 'raw'}
						title="The exact request body, whole — every byte the model saw"
					>
						raw
					</button>
				</div>
			{/if}

			<button
				class="hx-eyebrow flex items-center gap-1 transition-colors hover:text-foreground
				       disabled:opacity-30"
				onclick={() => session.compact()}
				disabled={session.busy || session.compacting || session.messages.length < 3}
				title="Fold the earlier conversation into a summary"
			>
				<HugeiconsIcon icon={ICON.compact} size={11} strokeWidth={1.5} />
				{session.compacting ? 'folding…' : 'compact'}
			</button>
		</div>
	</header>

	{#if !shot}
		<p class="px-3 py-6 text-xs leading-relaxed text-muted-foreground">
			Nothing sent yet. Every model call is one assembled string plus a list of tool schemas — this
			panel takes the last one apart and shows you what it was made of.
		</p>
	{:else}
		<!-- The gauge. Two bars, because they answer different questions: how much
		     room is left, and what is taking up the room. -->
		<div class="hx-rule border-b px-3 py-3">
			<div class="mb-1.5 flex items-baseline gap-2">
				<span class="hx-num text-[13px] tabular-nums">{shot.tokens.toLocaleString()}</span>
				<span class="hx-eyebrow">of {compact(shot.limit)} tokens</span>
				<span class="hx-num ml-auto text-[11px] text-muted-foreground">
					{(used * 100).toFixed(used < 0.1 ? 1 : 0)}%
				</span>
			</div>

			<div class="relative h-1.5 w-full overflow-hidden rounded-[2px] bg-muted">
				<div
					class="h-full transition-[width] duration-300"
					style:width="{used * 100}%"
					style:background="var(--hx-model)"
				></div>
				<!-- Where the harness starts folding the conversation up. -->
				<span
					class="absolute inset-y-0 w-px"
					style:left="{threshold * 100}%"
					style:background="var(--hx-interrupt)"
					title="{Math.round(threshold * 100)}% — the harness compacts past here"
				></span>
			</div>

			<p class="mt-1.5 mb-3 text-[10px] text-muted-foreground">
				{#if shot.measured}
					billed{#if shot.cached}, {compact(shot.cached)} of it a cache hit{/if} · rows below are apportioned
					by size
				{:else}
					estimated — the reply has not come back yet
				{/if}
			</p>

			<div class="flex h-2 w-full overflow-hidden rounded-[2px]">
				{#each GROUPS as g (g.id)}
					<span
						style:width="{pct(totals[g.id])}%"
						style:background={GROUP_COLOR[g.id]}
						title="{g.label} · {totals[g.id].toLocaleString()} tokens"
					></span>
				{/each}
			</div>
			<div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
				{#each GROUPS as g (g.id)}
					<span class="flex items-baseline gap-1.5 text-[10px]">
						<span
							class="inline-block size-1.5 translate-y-[-1px] rounded-[1px]"
							style:background={GROUP_COLOR[g.id]}
						></span>
						<span class="text-muted-foreground">{g.label}</span>
						<span class="hx-num">{compact(totals[g.id])}</span>
					</span>
				{/each}
			</div>
		</div>

		{#if view === 'raw' && rawReq}
			<div
				class="hx-rule hx-frost sticky z-10 flex items-baseline gap-2 border-b px-3 py-1.5"
				style:top={under}
			>
				<span class="hx-eyebrow">the request, whole</span>
				<span class="hx-num text-[10px] text-muted-foreground">
					{bytes(rawReq.bytes)} on the wire
				</span>
				<span class="ml-auto text-[10px] text-muted-foreground/70">pretty-printed below</span>
			</div>

			<pre
				class="px-3 py-2 font-mono text-[10.5px] leading-relaxed [overflow-wrap:anywhere]
				       whitespace-pre-wrap text-foreground/80">{rawText}</pre>

			<p class="px-3 py-3 text-[10px] leading-relaxed text-muted-foreground/80">
				The entire body of this model call — system prompt, every tool schema, every message, one
				JSON object. The pieces view cuts exactly these bytes apart; this view is for feeling how
				long the whole thing has become.
			</p>
		{:else}
			<div>
				{#each GROUPS.filter((g) => !hidden.has(g.id)) as g (g.id)}
					{@const rows = shot.pieces.filter((p) => p.group === g.id)}
					{#if rows.length}
						<div
							class="hx-rule hx-frost sticky z-10 flex items-baseline gap-2 border-b px-3 py-1.5"
							style:top={under}
						>
							<span class="hx-eyebrow">{g.label}</span>
							<span class="hx-num text-[10px] text-muted-foreground">
								{rows.length} · {totals[g.id].toLocaleString()}
							</span>
							<span class="ml-auto text-[10px] text-muted-foreground/70">{g.note}</span>
						</div>

						{#each rows as p (p.id)}
							{@const isOpen = open.has(p.id)}
							{@const at = indexOfPiece.get(p.id) ?? -1}
							{@const cachedRow = cacheEdge >= 0 && at < cacheEdge}
							{@const edgeRow = at === cacheEdge}
							<button
								class="flex w-full items-baseline gap-2 border-b
							       border-[color-mix(in_oklab,var(--border)_40%,transparent)] px-3 py-1.5
							       text-left transition-colors hover:bg-muted/50"
								style:background={cachedRow
									? 'color-mix(in oklab, var(--hx-state) 5%, transparent)'
									: edgeRow
										? 'linear-gradient(to bottom, color-mix(in oklab, var(--hx-state) 5%, transparent), transparent)'
										: undefined}
								title={cachedRow
									? 'inside the cached prefix — billed at a tenth (apportioned, not exact)'
									: edgeRow
										? '≈ the cache boundary lands in this row'
										: undefined}
								onclick={() => toggle(p.id)}
								aria-expanded={isOpen}
							>
								<span
									class="w-1 shrink-0 self-stretch rounded-full"
									style:background={p.color}
									style:opacity={isOpen ? 1 : 0.5}
								></span>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-mono text-[11px]">{p.label}</span>
									{#if p.note}
										<span class="block truncate text-[10px] text-muted-foreground">{p.note}</span>
									{/if}
								</span>
								<!-- The share bar is the point of the row: a tool result that is
							     forty times the system prompt should look forty times bigger. -->
								<span class="hidden h-1 w-16 shrink-0 self-center bg-muted sm:block">
									<span
										class="block h-full"
										style:width="{Math.max(2, pct(p.tokens))}%"
										style:background={p.color}
									></span>
								</span>
								<span class="hx-num w-12 shrink-0 text-right text-[10px] text-muted-foreground">
									{compact(p.tokens)}
								</span>
							</button>

							{#if isOpen}
								<pre
									class="hx-rule border-b bg-muted/25 px-3 py-2 font-mono text-[10.5px]
							            leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap
							            text-foreground/80">{p.text}</pre>
							{/if}
						{/each}
					{/if}
				{/each}

				<p class="px-3 py-3 text-[10px] leading-relaxed text-muted-foreground/80">
					Every row here is re-sent on the next call too. That is what makes a long conversation
					expensive, and why the harness eventually folds the older half into a summary.
				</p>
			</div>
		{/if}
	{/if}
</div>
