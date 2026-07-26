<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { KIND_LABEL, type DisplayKind } from '$lib/xray/events';
	import { KIND_COLOR, iconOf, stamp, summarise, detailOf } from '$lib/xray/format';
	import JsonCode from './JsonCode.svelte';
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

	const rows = $derived.by(() => {
		void bus.version; // the log is a plain array; this is the reactive edge
		return bus.events.filter(
			(e) =>
				(showFrames || e.kind !== 'http_sse_frame') && !hidden.has(e.displayKind)
		);
	});

	/** Expanded in place — selection drives the inspector, this is a peek. */
	let expandedId = $state<string | null>(null);

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
		class="min-h-0 flex-1 overflow-y-auto"
		style:padding-top={topPad}
	>
		{#if rows.length === 0}
			<p class="px-3 py-6 text-xs text-muted-foreground">
				Nothing yet. Send a message and every byte will appear here.
			</p>
		{/if}

		{#each rows as e (e.id)}
			{@const active = e.id === selectedId}
			<!-- Two sibling controls, not nested ones: selecting drives the
			     inspector, expanding peeks in place. A button inside a button is
			     invalid HTML and unreachable by keyboard. -->
			<div
				class="flex w-full items-stretch border-b
				       border-[color-mix(in_oklab,var(--border)_45%,transparent)] transition-colors
				       hover:bg-muted/50"
				class:bg-muted={active}
			>
				<button
					class="grid min-w-0 flex-1 grid-cols-[3px_14px_1fr_auto] items-baseline gap-x-2
					       py-[7px] pr-1 pl-3 text-left"
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
							style:color={active ? KIND_COLOR[e.displayKind as DisplayKind] : undefined}
						>
							{e.kind === 'tool_start' && e.skill
								? 'skill'
								: e.kind === 'tool_end' && e.skill
									? 'skill'
									: KIND_LABEL[e.kind]}
						</span>
						<span class="block truncate text-xs text-foreground/85">{summarise(e)}</span>
					</span>

					<span class="hx-num text-[10px] text-muted-foreground/70">{stamp(e.t)}</span>
				</button>

				<button
					class="shrink-0 px-2 text-muted-foreground/40 transition-colors hover:text-foreground"
					onclick={() => (expandedId = expandedId === e.id ? null : e.id)}
					aria-label={expandedId === e.id ? 'Collapse event' : 'Expand event'}
					aria-expanded={expandedId === e.id}
				>
					<span
						class="inline-block transition-transform"
						style:transform={expandedId === e.id ? 'rotate(0deg)' : 'rotate(-90deg)'}
					>
						<HugeiconsIcon icon={ICON.expand} size={11} strokeWidth={1.5} />
					</span>
				</button>
			</div>

			{#if e.kind === 'image_partial' || e.kind === 'image_done' || e.kind === 'paper_fetched'}
				<div
					class="border-b border-[color-mix(in_oklab,var(--border)_45%,transparent)] px-3 pt-1 pb-2"
					class:pl-8={e.kind !== 'paper_fetched'}
				>
					<EventMedia event={e} onopen={onopenasset} />
				</div>
			{/if}

			{#if expandedId === e.id}
				<!-- The detail the chat used to duplicate. Kept here, where the whole
				     history lives, so the conversation can stay a conversation. -->
				<div
					class="border-b border-[color-mix(in_oklab,var(--border)_45%,transparent)] bg-muted/25
					       px-3 py-2 pl-8"
				>
					<JsonCode source={JSON.stringify(detailOf(e))} />
				</div>
			{/if}
		{/each}
	</div>
</div>
