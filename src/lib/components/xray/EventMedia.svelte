<script lang="ts">
	import type { XrayEvent } from '$lib/xray/events';
	import PageDeck from '../PageDeck.svelte';
	import { assets, assetVersion } from '$lib/storage/assets.svelte';

	/**
	 * The visual half of an event.
	 *
	 * Some events are better *seen* than read: a generated figure, the first
	 * pages of a paper the agent just fetched. Rendered inline in the timeline so
	 * the record of a run includes what it produced, not only what it cost.
	 */
	let { event, onopen }: { event: XrayEvent; onopen?: (path: string) => void } = $props();

	/**
	 * Settled media renders from the asset store, not the event.
	 *
	 * Events live for the whole run, so they carry a ~320px thumbnail — which
	 * goes soft the moment the image fills a panel-width row. The store already
	 * holds the full frame under the same path; resolving it at paint time costs
	 * a map lookup and keeps the event objects small. Streaming partials have no
	 * settled asset yet, so they stay on their frame preview — soft is honest
	 * for a picture that is still arriving.
	 */
	const full = $derived.by(() => {
		void assetVersion.n;
		const path = event.kind === 'image_done' || event.kind === 'figure_extracted' ? event.path : '';
		return path ? assets.peek(path)?.dataUrl : undefined;
	});
</script>

{#if event.kind === 'image_partial' || event.kind === 'image_done'}
	{@const settled = event.kind === 'image_done'}
	<button
		class="block w-full text-left"
		onclick={() => settled && onopen?.(event.path)}
		disabled={!settled}
	>
		<img
			src={full ?? event.preview}
			alt={event.path}
			class="w-full rounded border transition-opacity"
			style:border-color="color-mix(in oklab, var(--border) 70%, transparent)"
			style:opacity={settled ? 1 : 0.75}
		/>
		<span class="hx-eyebrow mt-1 block">
			{settled ? event.path : `rendering — frame ${event.index + 1}`}
		</span>
	</button>
{:else if event.kind === 'paper_fetched' && event.pages.length}
	<!-- No caption: the row directly above already names the paper and its
	     source. A second label under the cards was just repetition. -->
	<PageDeck
		pages={event.pages}
		label="Open {event.arxivId}"
		onopen={() => onopen?.(`/papers/${event.arxivId.replace(/\//g, '-')}.pdf`)}
	/>
{:else if event.kind === 'figure_extracted'}
	<button class="block w-full text-left" onclick={() => onopen?.(event.path)}>
		<img
			src={full ?? event.preview}
			alt={event.caption || event.path}
			class="w-full rounded border"
			style:border-color="color-mix(in oklab, var(--border) 70%, transparent)"
		/>
		{#if event.caption}
			<span class="mt-1 block text-[10px] leading-snug text-muted-foreground">
				{event.caption.slice(0, 140)}{event.caption.length > 140 ? '…' : ''}
			</span>
		{/if}
	</button>
{/if}
