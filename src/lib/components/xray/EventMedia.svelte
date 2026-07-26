<script lang="ts">
	import type { XrayEvent } from '$lib/xray/events';
	import PageDeck from '../PageDeck.svelte';

	/**
	 * The visual half of an event.
	 *
	 * Some events are better *seen* than read: a generated figure, the first
	 * pages of a paper the agent just fetched. Rendered inline in the timeline so
	 * the record of a run includes what it produced, not only what it cost.
	 */
	let { event, onopen }: { event: XrayEvent; onopen?: (path: string) => void } = $props();
</script>

{#if event.kind === 'image_partial' || event.kind === 'image_done'}
	{@const settled = event.kind === 'image_done'}
	<button
		class="block w-full text-left"
		onclick={() => settled && onopen?.(event.path)}
		disabled={!settled}
	>
		<img
			src={event.preview}
			alt={event.path}
			class="w-full max-w-[280px] rounded border transition-opacity"
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
{/if}
