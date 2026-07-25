<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { KIND_LABEL, type DisplayKind } from '$lib/xray/events';
	import { KIND_COLOR, KIND_ICON, stamp, summarise } from '$lib/xray/format';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	interface Props {
		selectedId: string | null;
		onselect: (id: string) => void;
	}
	let { selectedId, onselect }: Props = $props();

	// SSE frames are the highest-volume event by an order of magnitude and are
	// rarely what you want to scan. They stay in the log — the inspector shows
	// them all — but the timeline folds them by default.
	let showFrames = $state(false);

	const rows = $derived.by(() => {
		void bus.version; // the log is a plain array; this is the reactive edge
		return bus.events.filter((e) => showFrames || e.kind !== 'http_sse_frame');
	});

	const frameCount = $derived.by(() => {
		void bus.version;
		return bus.events.filter((e) => e.kind === 'http_sse_frame').length;
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
	<header class="hx-rule flex items-center justify-between border-b px-3 py-2">
		<span class="hx-eyebrow flex items-center gap-1.5">
			<HugeiconsIcon icon={ICON.time} size={12} strokeWidth={1.5} />
			timeline
		</span>
		<div class="flex items-center gap-2">
			{#if frameCount}
				<button
					class="hx-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
					class:text-foreground={showFrames}
					onclick={() => (showFrames = !showFrames)}
					title="Raw SSE frames — every token exactly as it arrived"
				>
					<HugeiconsIcon icon={ICON.frame} size={11} strokeWidth={1.5} />
					{frameCount}
				</button>
			{/if}
			<span class="hx-eyebrow hx-num">{rows.length}</span>
		</div>
	</header>

	<div bind:this={viewport} onscroll={onScroll} class="min-h-0 flex-1 overflow-y-auto">
		{#if rows.length === 0}
			<p class="px-3 py-6 text-xs text-muted-foreground">
				Nothing yet. Send a message and every byte will appear here.
			</p>
		{/if}

		{#each rows as e (e.id)}
			{@const active = e.id === selectedId}
			<button
				class="group grid w-full grid-cols-[3px_14px_1fr_auto] items-baseline gap-x-2 border-b
				       border-[color-mix(in_oklab,var(--border)_45%,transparent)] px-3 py-[7px]
				       text-left transition-colors hover:bg-muted/50"
				class:bg-muted={active}
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
					<HugeiconsIcon icon={KIND_ICON[e.kind]} size={13} strokeWidth={1.5} />
				</span>

				<span class="min-w-0">
					<span
						class="hx-eyebrow"
						style:color={active ? KIND_COLOR[e.displayKind as DisplayKind] : undefined}
					>
						{KIND_LABEL[e.kind]}
					</span>
					<span class="block truncate text-xs text-foreground/85">{summarise(e)}</span>
				</span>

				<span class="hx-num text-[10px] text-muted-foreground/70">{stamp(e.t)}</span>
			</button>
		{/each}
	</div>
</div>
