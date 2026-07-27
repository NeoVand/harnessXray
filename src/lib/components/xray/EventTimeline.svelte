<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import {
		KIND_LABEL,
		KIND_HELP,
		SKILL_READ_HELP,
		type DisplayKind,
		type XrayEvent
	} from '$lib/xray/events';
	import { KIND_COLOR, iconOf, stamp, summarise } from '$lib/xray/format';
	import EventMedia from './EventMedia.svelte';
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
			<!-- One control, one meaning: selecting drives the inspector, and the
			     inspector is where the payload lives. This row used to expand the
			     same JSON in place — pure repetition, gone. -->
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
				onclick={() => onselect(e.id)}
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
				<div
					class="border-b border-[color-mix(in_oklab,var(--border)_45%,transparent)] px-3 pt-1 pb-2"
					class:pl-8={e.kind !== 'paper_fetched'}
				>
					<EventMedia event={e} onopen={onopenasset} />
				</div>
			{/if}
		{/each}
	</div>
</div>
