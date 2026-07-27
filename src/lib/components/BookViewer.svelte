<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { CHAPTERS } from '$lib/book/chapters';

	/**
	 * The teaching book.
	 *
	 * Docked exactly like DocumentViewer, and for the same reason: a modal made
	 * reading and talking mutually exclusive, which is backwards for a book you
	 * teach from. It takes the X-ray's half; the conversation stays live beside
	 * it, so a class can run the agent on the left while a chapter explains the
	 * mechanism on the right.
	 */
	interface Props {
		/** The open chapter's id. Bindable, so the rail and prev/next own it. */
		page: string | null;
		onclose: () => void;
	}
	let { page = $bindable(), onclose }: Props = $props();

	// An unknown id falls back to the first chapter rather than a blank pane —
	// the book has no empty state worth designing.
	const index = $derived(
		Math.max(
			0,
			CHAPTERS.findIndex((c) => c.id === page)
		)
	);
	const chapter = $derived(CHAPTERS[index]);
	const Body = $derived(chapter.component);
	const prev = $derived(index > 0 ? CHAPTERS[index - 1] : undefined);
	const next = $derived(index < CHAPTERS.length - 1 ? CHAPTERS[index + 1] : undefined);

	let scroller = $state<HTMLElement | null>(null);
	// A chapter opens at its own top; carrying scroll position between chapters
	// reads as the page being broken, not as continuity.
	$effect(() => {
		void page;
		scroller?.scrollTo(0, 0);
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && page) {
			e.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="flex h-full min-h-0 flex-col bg-background" aria-label="The book">
	<header class="hx-rule flex h-10 shrink-0 items-center gap-3 border-b px-4">
		<HugeiconsIcon icon={ICON.help} size={14} strokeWidth={1.5} />
		<span class="hx-eyebrow shrink-0">the book</span>
		<span class="min-w-0 flex-1 truncate text-sm">{chapter.title}</span>
		<span class="hx-num shrink-0 text-[10px] text-muted-foreground">
			{index + 1}/{CHAPTERS.length}
		</span>
		<button
			class="text-muted-foreground transition-colors hover:text-foreground"
			onclick={onclose}
			aria-label="Close"
			title="Close (Esc)"
		>
			<HugeiconsIcon icon={ICON.close} size={15} strokeWidth={1.5} />
		</button>
	</header>

	<div class="flex min-h-0 flex-1">
		<nav class="hx-rule w-[190px] shrink-0 overflow-y-auto border-r py-2" aria-label="Chapters">
			{#each CHAPTERS as c, i (c.id)}
				<button
					class="hx-eyebrow flex w-full items-center gap-2 px-4 py-[7px] text-left
					       transition-colors hover:text-foreground"
					style:color={c.id === chapter.id ? 'var(--hx-accent, var(--hx-model))' : undefined}
					aria-current={c.id === chapter.id ? 'page' : undefined}
					aria-label="Chapter {i + 1}: {c.title}"
					onclick={() => (page = c.id)}
				>
					<HugeiconsIcon icon={c.icon} size={13} strokeWidth={1.5} />
					<span class="min-w-0 flex-1 truncate">{c.label}</span>
					<span class="hx-num text-[9px] opacity-50">{String(i + 1).padStart(2, '0')}</span>
				</button>
			{/each}
		</nav>

		<div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto">
			<article class="bk mx-auto max-w-[72ch] px-8 py-10">
				<p class="hx-eyebrow mb-2" style:color="var(--hx-accent, var(--hx-model))">
					chapter {index + 1} · {chapter.label}
				</p>
				<!-- The one loud element on the page. Everything under it defers. -->
				<h1 class="bk-title">{chapter.title}</h1>
				<Body />

				<div class="hx-rule mt-12 flex items-center justify-between border-t pt-4">
					{#if prev}
						<button
							class="hx-eyebrow flex items-center gap-1.5 transition-colors hover:text-foreground"
							onclick={() => (page = prev.id)}
						>
							<span class="rotate-180"
								><HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} /></span
							>
							{prev.label}
						</button>
					{:else}
						<span></span>
					{/if}
					{#if next}
						<button
							class="hx-eyebrow flex items-center gap-1.5 transition-colors hover:text-foreground"
							onclick={() => (page = next.id)}
						>
							{next.label}
							<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} />
						</button>
					{/if}
				</div>
			</article>
		</div>
	</div>
</div>

<style>
	/* A page presented, not read: the title carries the chapter, the figures
	   carry the teaching, and the prose is a quiet caption track in the app's
	   own type — smaller and dimmer than chat, never competing with a slide. */
	.bk {
		font-size: 0.855rem;
		line-height: 1.75;
		color: color-mix(in oklab, var(--foreground) 82%, var(--muted-foreground));
	}
	.bk-title {
		font-size: 1.55rem;
		font-weight: 650;
		letter-spacing: -0.015em;
		line-height: 1.25;
		color: var(--foreground);
		margin: 0 0 1.4em;
	}
	.bk :global(p) {
		margin: 0 0 1.2em;
	}
	.bk :global(em) {
		font-style: normal;
		font-weight: 550;
	}
	.bk :global(ul) {
		margin: 0 0 1.2em;
		padding-left: 1.2em;
		list-style: none;
	}
	.bk :global(ul li) {
		position: relative;
		margin: 0 0 0.65em;
	}
	.bk :global(ul li)::before {
		content: '—';
		position: absolute;
		left: -1.2em;
		color: var(--muted-foreground);
	}
	/* The chapter's closing pointer into the app: set like an instrument label,
	   because that is exactly what it is pointing at. */
	.bk :global(p.live) {
		margin: 2.4em 0 0;
		padding-top: 1em;
		border-top: 1px solid color-mix(in oklab, var(--border) 60%, transparent);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		line-height: 1.7;
		color: var(--muted-foreground);
	}

	/* ── the plates ─────────────────────────────────────────────────────────
	   Chapters 2–10 open on a generated editorial illustration (gpt-image-2,
	   static/book/). Every plate is painted on midnight's own page colour
	   (#131316) — the default theme — so in dark themes the artwork sits
	   directly on the page, borderless, as if drawn there. Light themes get
	   the hairline frame back, because there the plate really is a dark
	   print tipped into a pale page. width/height attributes reserve the box
	   before the bytes arrive. */
	.bk :global(img.plate) {
		display: block;
		width: 100%;
		height: auto;
		margin: 0.4em 0 2.6em;
		border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
		border-radius: 4px;
	}
	:global(.dark) .bk :global(img.plate) {
		border-color: transparent;
		border-radius: 0;
		/* The plates are painted on midnight's #131316, but a generated black
		   is never exact and JPEG wobbles it further. Lighten-blending makes
		   the page win wherever the plate is darker, so the background melts
		   into ANY dark theme pixel-perfectly and only the luminous artwork
		   stays. Light themes keep normal rendering — there the plate is a
		   framed print, not part of the page. */
		mix-blend-mode: lighten;
	}
</style>
