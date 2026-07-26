<script lang="ts">
	/**
	 * A hand of cards.
	 *
	 * Fanned from a bottom-centre pivot the way you'd hold a hand: page one at
	 * the far left with the strongest counter-rotation and on top, later pages
	 * rotating away to the right. Hovering opens the fan wider rather than
	 * rearranging it, so the cards never jump under the cursor.
	 *
	 * Shared between the timeline and the file viewer, because a PDF should look
	 * the same wherever you meet it — and because the rendered pages already
	 * exist, showing them beats a row of text saying a PDF is here.
	 */
	interface Props {
		pages: string[];
		onopen?: () => void;
		label?: string;
		/** Cap on the fan's width. The timeline column is narrower than a panel. */
		max?: number;
	}
	let { pages, onopen, label, max = 260 }: Props = $props();
</script>

<div class="flex justify-center">
	<button
		class="deck"
		style:--n={pages.length}
		style:max-width="{max}px"
		onclick={() => onopen?.()}
		disabled={!onopen}
		title={label}
		aria-label={label ?? `${pages.length} pages`}
	>
		{#each pages as page, i (i)}
			<img src={page} alt="page {i + 1}" style:--i={i} style:z-index={pages.length - i} />
		{/each}
	</button>
</div>

<style>
	/*
		The fan has to fit whatever width its column currently is, so every
		dimension is derived from a container query rather than fixed px. At a
		narrow timeline the cards shrink and overlap more; given room they open
		up. Hover widens the spread but never past 100% of the container, which
		is what used to push the deck out past the column edge.
	*/
	.deck {
		container-type: inline-size;
		position: relative;
		display: block;
		width: 100%;
		height: 108px;
		margin: 0.4rem 0 0.55rem;
	}
	.deck img {
		--card: clamp(44px, 30cqw, 72px);
		--step: clamp(12px, 16cqw, 30px);
		--spread: 11deg;
		position: absolute;
		bottom: 0;
		left: calc(50% - (var(--card) + (var(--n) - 1) * var(--step)) / 2 + var(--i) * var(--step));
		width: var(--card);
		border-radius: 5px;
		border: 1px solid color-mix(in oklab, var(--border) 90%, transparent);
		background: #fff;
		box-shadow:
			0 1px 2px oklch(0 0 0 / 0.1),
			0 4px 10px oklch(0 0 0 / 0.13);
		/* Pivot below the card so the fan splays like paper held in a hand
		   rather than pinwheeling about its own middle. */
		transform-origin: 50% 140%;
		transform: rotate(calc((var(--i) - (var(--n) - 1) / 2) * var(--spread)));
		transition:
			transform 0.25s cubic-bezier(0.2, 0.8, 0.3, 1),
			left 0.25s cubic-bezier(0.2, 0.8, 0.3, 1),
			width 0.25s cubic-bezier(0.2, 0.8, 0.3, 1);
	}
	.deck:hover:not(:disabled) img {
		--step: clamp(16px, 21cqw, 38px);
		--spread: 14deg;
	}
	@media (prefers-reduced-motion: reduce) {
		.deck img {
			transition: none;
		}
	}
</style>
