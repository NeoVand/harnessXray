<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { bus } from '$lib/xray/bus.svelte';
	import { shotAt } from '$lib/xray/context';
	import { compact } from '$lib/xray/usage';
	import { toolMeta, type ToolMeta } from '$lib/agent/tool-meta';
	import { subagentIcon, subagentColor } from '$lib/agent/subagent-meta';
	import { crew, mainRequest } from '$lib/xray/crew';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON, type IconValue } from '$lib/icons';
	import JsonCode from './JsonCode.svelte';

	/**
	 * The toolbox — every tool in the run, once each, all of them openable.
	 *
	 * The first version of this panel listed the main agent's tools and then, in a
	 * second section underneath, the tools each subagent carries. That was two
	 * mistakes wearing one coat. The second list was flat text, so a tool only a
	 * subagent carries — `generate_image`, `edit_image` — could be named but never
	 * opened: the one place in the app where you could see that a tool exists and
	 * not see what it IS. And the two lists overlapped almost entirely, because
	 * the harness gives every subagent the six file tools, the plan and `task`, so
	 * `ls` and `glob` appeared six times over with no way to tell that they were
	 * the same schema each time.
	 *
	 * So: one index, keyed by tool name, built from every request on the wire —
	 * the parent's and each subagent's. A row appears once and carries the list of
	 * who holds it. The strip at the top filters to one carrier when the question
	 * is "what does paper-reader actually have", which is also where the subagents
	 * tab lands you when you click one of its tools.
	 *
	 * Everything is read off the wire rather than our own registry, for the reason
	 * this whole app exists: the registry says what we MEANT to send. Names we
	 * declared for a subagent that has not run yet are listed as declared and say
	 * so, with no schema to show, because there genuinely isn't one yet.
	 */
	interface Props {
		/** Move the timeline to a tool's most recent call. */
		onjump?: (eventId: string) => void;
		/**
		 * A tool someone elsewhere asked to see — from the subagents tab. A fresh
		 * object each time, so asking twice for the same tool still lands.
		 */
		focus?: { carrier: string; tool: string } | null;
	}
	let { onjump, focus = null }: Props = $props();

	type Piece = NonNullable<ReturnType<typeof shotAt>>['pieces'][number];

	interface Carrier {
		key: string;
		label: string;
		icon: IconValue;
		color: string;
		/** Read off its own request, or merely declared in its spec. */
		measured: boolean;
		count: number;
		total: number;
	}

	interface Row {
		name: string;
		note: string;
		/** The literal schema as it went out. Empty when only declared. */
		schema: string;
		tokens: number;
		chars: number;
		meta: ToolMeta;
		/** Carrier keys holding this tool, in strip order. */
		carriers: string[];
	}

	/**
	 * Calls per tool, per carrier.
	 *
	 * Attributed by LangGraph's stream namespace, not by the wire — which is the
	 * opposite of how token spend has to be attributed, and worth the asymmetry:
	 * a `tool_start` genuinely knows which lane it happened in, so a subagent's
	 * `read_file` calls are not silently added to the parent's.
	 */
	const calls = $derived.by(() => {
		void bus.version;
		const out: Record<string, Record<string, { n: number; last: string }>> = {};
		for (const e of bus.events) {
			if (e.kind !== 'tool_start') continue;
			const key = e.scope === 'main' ? 'main' : (e.lane ?? e.scope.slice(4).split(':')[0]);
			const lane = (out[key] ??= {});
			const c = (lane[e.name] ??= { n: 0, last: '' });
			c.n++;
			c.last = e.id;
		}
		return out;
	});

	/** How many times a tool was called, and where last — under one carrier or all. */
	function callsOf(tool: string, carrier: string): { n: number; last: string } | undefined {
		if (carrier !== 'all') return calls[carrier]?.[tool];
		let n = 0;
		let last = '';
		for (const lane of Object.values(calls)) {
			const c = lane[tool];
			if (!c) continue;
			n += c.n;
			last = c.last;
		}
		return n ? { n, last } : undefined;
	}

	const roster = $derived.by(() => {
		void bus.version;
		return crew(bus);
	});

	function bandOf(id: string): Piece[] {
		const shot = id ? shotAt(bus, id) : undefined;
		return (shot?.pieces ?? []).filter((p) => p.group === 'tools');
	}

	/** The index and the strip, built together in one pass over the carriers. */
	const model = $derived.by(() => {
		void bus.version;
		// A plain record, not a Map: this is scratch, rebuilt from nothing on every
		// derivation and never read reactively, and tool names are non-numeric
		// strings so insertion order is preserved.
		const index: Record<string, Row> = {};
		const carriers: Carrier[] = [];

		const hold = (key: string, name: string) => {
			const row = index[name];
			if (row && !row.carriers.includes(key)) row.carriers.push(key);
			return row;
		};
		const absorb = (key: string, pieces: Piece[]) => {
			for (const p of pieces) {
				if (hold(key, p.label)) continue;
				index[p.label] = {
					name: p.label,
					note: p.note ?? '',
					schema: p.text,
					tokens: p.tokens,
					chars: p.chars,
					meta: toolMeta(p.label),
					carriers: [key]
				};
			}
		};
		const declare = (key: string, names: string[]) => {
			for (const n of names) {
				if (hold(key, n)) continue;
				index[n] = {
					name: n,
					note: '',
					schema: '',
					tokens: 0,
					chars: 0,
					meta: toolMeta(n),
					carriers: [key]
				};
			}
		};

		const main = bandOf(mainRequest(bus));
		absorb('main', main);
		carriers.push({
			key: 'main',
			label: 'main agent',
			icon: ICON.agent,
			color: 'var(--hx-accent)',
			measured: main.length > 0,
			count: main.length,
			total: main.reduce((n, p) => n + p.tokens, 0)
		});

		for (const m of roster) {
			const pieces = m.sampleRequest ? bandOf(m.sampleRequest) : [];
			if (pieces.length) absorb(m.name, pieces);
			else declare(m.name, m.carries);
			carriers.push({
				key: m.name,
				label: m.name,
				icon: subagentIcon(m.name),
				color: subagentColor(m.origin),
				measured: pieces.length > 0,
				count: m.carries.length,
				total: pieces.reduce((n, p) => n + p.tokens, 0)
			});
		}

		return { rows: Object.values(index), carriers };
	});

	/** Which carrier the list is showing. `all` is the union, deduped. */
	let carrier = $state('main');
	const current = $derived(model.carriers.find((c) => c.key === carrier));

	const rows = $derived(
		model.rows
			.filter((r) => carrier === 'all' || r.carriers.includes(carrier))
			// Costliest first: the panel's whole argument is that a schema is a bill
			// on every request, so the biggest bill belongs at the top. Tools with no
			// schema on the wire yet sort last, where "not measured" reads as a state
			// rather than as "free".
			.map((r) => ({ ...r, call: callsOf(r.name, carrier) }))
			.sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name))
	);

	const total = $derived(rows.reduce((n, r) => n + r.tokens, 0));
	const used = $derived(rows.filter((r) => r.call).length);
	/** Widest schema in view, so the share bars have a sensible full scale. */
	const widest = $derived(Math.max(1, ...rows.map((r) => r.tokens)));

	function carrierOf(key: string): Carrier | undefined {
		return model.carriers.find((c) => c.key === key);
	}

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

	/** The tool an arriving `focus` asked for, so its row can pull itself up. */
	let landed = $state('');

	$effect(() => {
		const f = focus;
		if (!f) return;
		untrack(() => {
			carrier = f.carrier;
			open.clear();
			open.add(f.tool);
			landed = f.tool;
		});
	});

	/** Bring the row a jump landed on into view. Re-runs when `active` flips. */
	function reveal(active: boolean) {
		return (node: HTMLElement) => {
			if (active) node.scrollIntoView({ block: 'nearest' });
		};
	}
</script>

<div class="h-full min-h-0 overflow-y-auto">
	<div class="px-3 pt-3 pb-3">
		{#if !model.rows.length}
			<p class="text-xs leading-relaxed text-muted-foreground">
				Read off the wire, so it needs a wire: after the first message this lists every tool the
				model was actually offered — the parent's and each subagent's — and what each one costs to
				offer.
			</p>
		{:else}
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<span class="hx-num text-[15px]" style:color="var(--hx-tool)">
					{compact(total)}
				</span>
				<span class="hx-num text-[10px] text-muted-foreground">
					{rows.length} tools · {used} used
				</span>
			</div>
			<p class="mb-2.5 text-[10px] leading-relaxed text-muted-foreground">
				{#if carrier === 'all'}
					Every distinct tool in this run, counted once. Most of them are carried by several agents
					— the harness hands the file tools, the plan and <span class="font-mono">task</span> to every
					subagent it makes.
				{:else}
					Re-sent on <em class="text-foreground/80 not-italic">every</em> request
					{current?.key === 'main' ? 'the parent makes' : `${carrier} makes`}, called or not. A tool
					it never uses still costs this much per turn.
				{/if}
			</p>

			<!-- The carrier strip. Not a second list of tools: the same list, asked a
			     different question. -->
			<div class="mb-2.5 flex flex-wrap items-center gap-1">
				<button
					class="hx-rule flex items-center gap-1 rounded border px-1.5 py-[3px] text-[9.5px]
					       transition-colors hover:bg-muted/60"
					class:bg-muted={carrier === 'all'}
					style:border-color={carrier === 'all' ? 'var(--hx-tool)' : undefined}
					onclick={() => (carrier = 'all')}
				>
					<HugeiconsIcon icon={ICON.tool} size={10} strokeWidth={1.5} />
					<span class="font-mono">all</span>
					<span class="hx-num text-muted-foreground/60">{model.rows.length}</span>
				</button>
				{#each model.carriers as c (c.key)}
					<button
						class="hx-rule flex items-center gap-1 rounded border px-1.5 py-[3px] text-[9.5px]
						       transition-colors hover:bg-muted/60"
						class:bg-muted={carrier === c.key}
						style:border-color={carrier === c.key ? c.color : undefined}
						style:opacity={c.measured ? 1 : 0.6}
						onclick={() => (carrier = c.key)}
					>
						<span style:color={c.color}>
							<HugeiconsIcon icon={c.icon} size={10} strokeWidth={1.5} />
						</span>
						<span class="font-mono">{c.label}</span>
						<span class="hx-num text-muted-foreground/60">{c.count}</span>
					</button>
				{/each}
			</div>

			{#if current && !current.measured}
				<p class="mb-2 text-[9.5px] leading-relaxed text-muted-foreground/70">
					Declared in its spec — <span class="font-mono">{carrier}</span> has not run yet, so
					nothing of its own is on the wire. The harness will add the file tools, the plan and
					<span class="font-mono">task</span> to this list the moment it does.
				</p>
			{/if}

			{#each rows as r (r.name)}
				{@const isOpen = open.has(r.name)}
				<div class="hx-rule border-b last:border-b-0" {@attach reveal(r.name === landed)}>
					<button
						class="flex w-full items-center gap-2 py-1.5 text-left transition-colors
						       hover:bg-muted/50"
						onclick={() => toggle(r.name)}
						aria-expanded={isOpen}
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

						<!-- Who holds it. The whole reason the list is deduped: `ls` is one
						     schema six agents were each handed, not six tools. -->
						{#if carrier === 'all' && r.carriers.length > 1}
							<span class="flex shrink-0 items-center gap-[3px] pr-0.5">
								{#each r.carriers as k (k)}
									{@const c = carrierOf(k)}
									{#if c}
										<span style:color={c.color} style:opacity="0.65">
											<HugeiconsIcon icon={c.icon} size={9} strokeWidth={1.5} />
										</span>
									{/if}
								{/each}
							</span>
						{/if}

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
							{r.tokens ? compact(r.tokens) : '—'}
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
								{r.note || '(not on the wire yet — this carrier has not run)'}
							</p>
							{#if r.note.length > 180}
								<button
									class="hx-eyebrow mt-0.5 transition-colors hover:text-foreground"
									onclick={() => toggleProse(r.name)}
								>
									{proseOpen ? 'less' : 'more'}
								</button>
							{/if}

							{#if r.schema}
								<p class="hx-eyebrow mt-2 mb-1">the schema, as it went out</p>
								<div class="hx-rule max-h-56 overflow-auto rounded border">
									<JsonCode source={r.schema} />
								</div>
							{/if}

							<!-- Carried by, always — including when the list is filtered, because
							     "who else has this" is exactly the thing a filtered view hides. -->
							<p class="hx-eyebrow mt-2 mb-1">carried by</p>
							<p class="flex flex-wrap gap-1">
								{#each r.carriers as k (k)}
									{@const c = carrierOf(k)}
									{#if c}
										<button
											class="hx-rule flex items-center gap-1 rounded border px-1.5 py-0.5
											       font-mono text-[9.5px] transition-colors hover:bg-muted/60"
											class:bg-muted={carrier === k}
											onclick={() => (carrier = k)}
										>
											<span style:color={c.color}>
												<HugeiconsIcon icon={c.icon} size={9} strokeWidth={1.5} />
											</span>
											{c.label}
										</button>
									{/if}
								{/each}
							</p>

							<p class="hx-eyebrow mt-2 flex flex-wrap items-baseline gap-x-3">
								<span>
									{r.meta.origin === 'ours' ? 'written for this agent' : 'supplied by the harness'}
								</span>
								{#if r.chars}
									<span class="hx-num text-[9px] text-muted-foreground">
										{r.chars.toLocaleString()} chars · {compact(r.tokens)} tokens
									</span>
								{/if}
								{#if r.call}
									{@const last = r.call.last}
									<button
										class="hx-eyebrow transition-colors hover:text-foreground"
										style:color="var(--hx-tool)"
										onclick={() => onjump?.(last)}
									>
										jump to last call →
									</button>
								{/if}
							</p>
						</div>
					{/if}
				</div>
			{/each}

			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/60">
				<span style:color="var(--hx-tool)">ochre</span>
				— written for this agent ·
				<span class="text-muted-foreground">grey</span>
				— supplied by the harness. A subagent's tools come from a request
				<em class="not-italic">it</em>
				made, so they appear once it has run.
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
