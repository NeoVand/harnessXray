<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import {
		KIND_LABEL,
		KIND_HELP,
		SKILL_READ_HELP,
		type DisplayKind,
		type XrayEvent
	} from '$lib/xray/events';
	import { KIND_COLOR, iconOf, stamp, summarise, detailOf, bytes } from '$lib/xray/format';
	import EventMedia from './EventMedia.svelte';
	import JsonView from './JsonView.svelte';
	import RawView from './RawView.svelte';
	import { explanations, explain } from '$lib/lab/sidecar.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	interface Props {
		selectedId: string | null;
		onselect: (id: string) => void;
		onopenasset?: (path: string) => void;
		/**
		 * SSE frames are the highest-volume event by an order of magnitude and
		 * are rarely what you want to scan. They stay in the log — the inspector
		 * shows them all — but the timeline folds them by default. The toggle
		 * lives in the tab bar above, so it is owned there.
		 */
		showFrames?: boolean;
		/** Display kinds to leave out. Empty means everything. */
		hidden?: Set<string>;
		/** Room to leave at the top for the frosted header floating over us. */
		topPad?: string;
	}
	let {
		selectedId,
		onselect,
		onopenasset,
		showFrames = false,
		hidden = new Set<string>(),
		topPad = '0px'
	}: Props = $props();

	interface Row {
		e: XrayEvent;
		/** This event came from inside a subagent's own run. */
		sub: boolean;
		/** First row of a consecutive subagent stretch — gets the lane header. */
		laneStart: boolean;
		laneLabel: string;
	}

	/**
	 * Rows plus lane bookkeeping in one pass.
	 *
	 * Events from a subagent carry `scope: sub:<namespace>`; consecutive rows
	 * from the same namespace render as one indented lane under a single header
	 * naming the subagent. Fan-out then *looks* like fan-out: the parent's rows
	 * stay on the spine and each delegate's work hangs off it.
	 */
	const rows = $derived.by(() => {
		void bus.version; // the log is a plain array; this is the reactive edge
		const out: Row[] = [];
		let prevScope = '';
		for (const e of bus.events) {
			if ((!showFrames && e.kind === 'http_sse_frame') || hidden.has(e.displayKind)) continue;
			const sub = e.scope !== 'main';
			out.push({
				e,
				sub,
				laneStart: sub && e.scope !== prevScope,
				laneLabel: e.lane ?? (sub ? e.scope.slice(4).split(':')[0] : '')
			});
			prevScope = e.scope;
		}
		return out;
	});

	/**
	 * The detail lives here now, under the row that names it.
	 *
	 * There used to be a detail tab across the app; clicking a row and reading
	 * its payload two panes away split one act of attention in half. Expansion
	 * is strictly click-driven — the follow-the-run selection never opens a
	 * row, or a live run would be a zipper of payloads opening themselves.
	 */
	let expandedId = $state<string | null>(null);
	/** The expanded row's second reading: the literal wire. Resets per row. */
	let rawMode = $state(false);

	function open(e: XrayEvent) {
		onselect(e.id);
		if (expandedId === e.id) {
			expandedId = null;
		} else {
			expandedId = e.id;
			rawMode = false;
		}
	}

	/** Frames belonging to an expanded exchange, for raw mode and the count. */
	function framesFor(e: XrayEvent): XrayEvent[] {
		const httpId =
			e.kind === 'http_request'
				? e.id
				: 'httpId' in e
					? (e.httpId as string | undefined)
					: undefined;
		return httpId ? bus.framesOf(httpId) : [];
	}

	let viewport = $state<HTMLElement | null>(null);
	let pinned = $state(true);

	$effect(() => {
		void rows.length;
		if (pinned && viewport) viewport.scrollTop = viewport.scrollHeight;
	});

	function onScroll() {
		if (!viewport) return;
		const gap = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
		pinned = gap < 32;
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<!-- The padding is inside the scroller, not above it, so rows pass beneath
	     the frosted header rather than stopping short of it. -->
	<div
		bind:this={viewport}
		onscroll={onScroll}
		class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
		style:padding-top={topPad}
	>
		{#if rows.length === 0}
			<p class="px-3 py-6 text-xs text-muted-foreground">
				Nothing yet. Send a message and every byte will appear here.
			</p>
		{/if}

		{#each rows as r (r.e.id)}
			{@const e = r.e}
			{@const active = e.id === selectedId}
			{@const skillRow = (e.kind === 'tool_start' || e.kind === 'tool_end') && !!e.skill}
			{#if r.laneStart}
				<div
					class="flex items-center gap-1.5 border-b
					       border-[color-mix(in_oklab,var(--border)_45%,transparent)] py-1 pl-5"
				>
					<HugeiconsIcon icon={ICON.subagent} size={11} strokeWidth={1.5} />
					<span class="hx-eyebrow" style:color="var(--hx-subagent)">
						{r.laneLabel || 'subagent'}
					</span>
					<span class="hx-eyebrow text-muted-foreground/60">— its own context window</span>
				</div>
			{/if}
			<!-- The lane indent is a margin, so width must give those 12px back —
			     w-full plus the margin was a permanent horizontal scrollbar. -->
			<button
				class="grid min-w-0 grid-cols-[3px_14px_1fr_auto] items-baseline gap-x-2 border-b
				       border-[color-mix(in_oklab,var(--border)_45%,transparent)] px-3 py-[7px] text-left
				       transition-colors hover:bg-muted/50"
				class:bg-muted={active}
				style:width={r.sub ? 'calc(100% - 12px)' : '100%'}
				style:border-left={r.sub
					? '2px solid color-mix(in oklab, var(--hx-subagent) 55%, transparent)'
					: undefined}
				style:margin-left={r.sub ? '12px' : undefined}
				onclick={() => open(e)}
				aria-expanded={expandedId === e.id}
			>
				<span
					class="h-full min-h-[14px] self-stretch rounded-full"
					style:background={KIND_COLOR[e.displayKind as DisplayKind]}
					style:opacity={active ? 1 : 0.55}
				></span>

				<span
					class="translate-y-[2px]"
					style:color={KIND_COLOR[e.displayKind as DisplayKind]}
					style:opacity={active ? 1 : 0.75}
				>
					<HugeiconsIcon icon={iconOf(e)} size={13} strokeWidth={1.5} />
				</span>

				<span class="min-w-0">
					<span
						class="hx-eyebrow"
						title={skillRow ? SKILL_READ_HELP : KIND_HELP[e.kind]}
						style:color={active ? KIND_COLOR[e.displayKind as DisplayKind] : undefined}
					>
						{skillRow ? 'skill' : KIND_LABEL[e.kind]}
					</span>
					<span class="block truncate text-xs text-foreground/85">{summarise(e)}</span>
				</span>

				<span class="hx-num text-[10px] text-muted-foreground/70">{stamp(e.t)}</span>
			</button>

			{#if e.kind === 'image_partial' || e.kind === 'image_done' || e.kind === 'paper_fetched' || e.kind === 'figure_extracted'}
				<!-- Full row width, even padding — a figure hung in the icon gutter's
				     hanging indent read as shoved into the corner. Sub-lane media keeps
				     the lane's rule and the same give-back-the-margin width as its row. -->
				<div
					class="border-b border-[color-mix(in_oklab,var(--border)_45%,transparent)] px-3 pt-1 pb-2"
					style:width={r.sub ? 'calc(100% - 12px)' : '100%'}
					style:border-left={r.sub
						? '2px solid color-mix(in oklab, var(--hx-subagent) 55%, transparent)'
						: undefined}
					style:margin-left={r.sub ? '12px' : undefined}
				>
					<EventMedia event={e} onopen={onopenasset} />
				</div>
			{/if}

			{#if expandedId === e.id}
				{@const frames = framesFor(e)}
				{@const ex = explanations.get(e.id)}
				<!-- The payload, exactly where the click was. Two readings and the
				     tutor ride along, same grammar as every other panel. -->
				<div
					class="border-b border-[color-mix(in_oklab,var(--border)_45%,transparent)] bg-muted/25"
				>
					<div class="flex items-center gap-2 px-3 pt-2 text-muted-foreground">
						<button
							class="transition-colors hover:text-foreground"
							style:color={!rawMode ? 'var(--hx-accent)' : undefined}
							onclick={() => (rawMode = false)}
							aria-pressed={!rawMode}
							title="Detail — the payload, decomposed"
							aria-label="Detail view"
						>
							<HugeiconsIcon icon={ICON.state} size={12} strokeWidth={1.5} />
						</button>
						<button
							class="transition-colors hover:text-foreground"
							style:color={rawMode ? 'var(--hx-accent)' : undefined}
							onclick={() => (rawMode = true)}
							aria-pressed={rawMode}
							title="Raw — the literal wire, frame by frame"
							aria-label="Raw view"
						>
							<HugeiconsIcon icon={ICON.code} size={12} strokeWidth={1.5} />
						</button>
						{#if !rawMode}
							<button
								class="hx-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
								onclick={() => explain(e)}
								title="Have the lab explain this event — one small luna call, outside the agent"
							>
								<HugeiconsIcon icon={ICON.sparkle} size={11} strokeWidth={1.5} />
								explain
							</button>
						{/if}
						<span class="hx-num ml-auto text-[10px] text-muted-foreground/70">
							{#if e.kind === 'http_request'}{bytes(e.bytes)}{/if}
							{#if e.kind === 'http_response'}{Math.round(e.ms)}ms · {frames.length} frames{/if}
						</span>
					</div>

					{#if rawMode}
						<RawView event={e} {frames} />
					{:else}
						{#if ex}
							<div class="hx-rule mx-3 mt-2 border-b pb-2">
								<p class="hx-eyebrow mb-1 flex items-center gap-1.5" style:color="var(--hx-state)">
									<HugeiconsIcon icon={ICON.sparkle} size={11} strokeWidth={1.5} />
									{ex.status === 'thinking' ? 'explaining…' : 'explained'}
									<span class="text-muted-foreground/60">— the lab, not the agent</span>
								</p>
								{#if ex.status === 'thinking'}
									<p class="text-xs text-muted-foreground">Reading the payload…</p>
								{:else}
									<p
										class="max-w-[64ch] text-xs leading-relaxed whitespace-pre-wrap"
										class:text-muted-foreground={ex.status === 'error'}
									>
										{ex.text}
									</p>
								{/if}
							</div>
						{/if}
						<div class="px-3 py-2">
							<JsonView value={detailOf(e)} openTo={2} root />
						</div>
						{#if frames.length && e.kind !== 'http_response'}
							<p class="hx-eyebrow px-3 pb-2 text-muted-foreground/60">
								{frames.length} stream frames — raw walks them
							</p>
						{/if}
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>
