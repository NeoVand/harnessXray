<script lang="ts">
	import { tokenizeYaml } from '$lib/paper/frontmatter';

	/**
	 * A document's YAML frontmatter, set like the metadata it is.
	 *
	 * Colours are borrowed from JsonCode on purpose: keys teal, strings sage,
	 * numbers ochre, booleans clay, punctuation dim. Two panes rendering
	 * structured data in two different palettes would be two conventions to
	 * learn, and a skill's frontmatter is the same *kind* of thing as a request
	 * body — a machine-readable header the reader is being shown verbatim.
	 *
	 * Tokens, not innerHTML: the text comes from files a model wrote, and this
	 * builds real elements so nothing has to be whitelisted.
	 */
	interface Props {
		source: string;
		/** Preview density — tighter, and clipped to a few lines. */
		compact?: boolean;
	}
	let { source, compact = false }: Props = $props();

	const lines = $derived(tokenizeYaml(source));
</script>

<div class="hx-rule fm mb-3 overflow-x-auto rounded border" class:compact>
	<pre>{#each lines as tokens, i (i)}<span class="ln"
				>{#each tokens as t, j (j)}<span class={t.kind}>{t.text}</span>{/each}</span
			>{/each}</pre>
</div>

<style>
	/* A slab, not a card: hairline border and the muted wash the app uses for
	   every other verbatim payload. */
	.fm {
		background: color-mix(in oklab, var(--muted) 25%, transparent);
	}
	.fm pre {
		margin: 0;
		padding: 0.5rem 0.7rem;
		font-family: var(--font-mono);
		font-size: 10.5px;
		line-height: 1.65;
		/* Wrap rather than scroll: a description key is one long line, and a
		   horizontal scrollbar on the first thing in a document reads as broken.
		   The container still scrolls for anything genuinely unwrappable. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.ln {
		display: block;
	}
	/* Preview: enough to identify the document, never enough to bury it. */
	.compact pre {
		font-size: 10px;
		padding: 0.4rem 0.6rem;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 4;
		line-clamp: 4;
		overflow: hidden;
	}

	.key {
		color: var(--hx-model);
	}
	.string {
		color: var(--hx-fs);
	}
	.number {
		color: var(--hx-tool);
	}
	.boolean {
		color: var(--hx-memory);
	}
	.dash,
	.plain {
		color: color-mix(in oklab, var(--muted-foreground) 80%, transparent);
	}
	.comment {
		color: color-mix(in oklab, var(--muted-foreground) 65%, transparent);
		font-style: italic;
	}
</style>
