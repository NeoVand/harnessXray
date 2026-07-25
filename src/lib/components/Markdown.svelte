<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	/**
	 * Markdown for agent output.
	 *
	 * The model writes markdown; showing it raw was simply a bug. Sanitised with
	 * DOMPurify because the text is model-authored and, once the research tools
	 * run, partly *paper*-authored — i.e. genuinely untrusted input that has
	 * passed through a language model.
	 *
	 * This is the chat renderer. The paper viewer gets the heavier structural
	 * pipeline (remark → typed blocks → components, no innerHTML at all) when it
	 * lands; that one needs source-offset anchors for provenance, which this
	 * cannot give.
	 */
	let { source, compact = false }: { source: string; compact?: boolean } = $props();

	marked.setOptions({ gfm: true, breaks: true });

	const html = $derived(
		DOMPurify.sanitize(marked.parse(source ?? '', { async: false }) as string, {
			ALLOWED_TAGS: [
				'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
				'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
				'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'sup', 'sub'
			],
			ALLOWED_ATTR: ['href', 'title'],
			ALLOW_DATA_ATTR: false
		})
	);
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised immediately above -->
<div class="md" class:compact>{@html html}</div>

<style>
	.md {
		font-size: 0.875rem;
		line-height: 1.65;
	}
	.md :global(> :first-child) {
		margin-top: 0;
	}
	.md :global(> :last-child) {
		margin-bottom: 0;
	}
	.md :global(p) {
		margin: 0.65em 0;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3),
	.md :global(h4) {
		font-weight: 600;
		line-height: 1.3;
		margin: 1.4em 0 0.5em;
	}
	.md :global(h1) {
		font-size: 1.15em;
	}
	.md :global(h2) {
		font-size: 1.05em;
	}
	.md :global(h3),
	.md :global(h4) {
		font-size: 1em;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0.65em 0;
		padding-left: 1.3em;
	}
	.md :global(li) {
		margin: 0.25em 0;
	}
	.md :global(ul) {
		list-style: disc;
	}
	.md :global(ol) {
		list-style: decimal;
	}
	.md :global(code) {
		font-family: var(--font-mono);
		font-size: 0.86em;
		background: var(--muted);
		padding: 0.1em 0.32em;
		border-radius: 3px;
	}
	.md :global(pre) {
		background: var(--muted);
		padding: 0.7em 0.85em;
		border-radius: var(--radius-sm);
		overflow-x: auto;
		margin: 0.8em 0;
	}
	.md :global(pre code) {
		background: none;
		padding: 0;
		font-size: 0.8em;
		line-height: 1.6;
	}
	.md :global(blockquote) {
		border-left: 2px solid var(--border);
		padding-left: 0.85em;
		margin: 0.8em 0;
		color: var(--muted-foreground);
	}
	.md :global(a) {
		text-decoration: underline;
		text-underline-offset: 2px;
		text-decoration-color: color-mix(in oklab, currentColor 40%, transparent);
	}
	.md :global(table) {
		border-collapse: collapse;
		margin: 0.8em 0;
		font-size: 0.92em;
		display: block;
		overflow-x: auto;
	}
	.md :global(th),
	.md :global(td) {
		border: 1px solid var(--border);
		padding: 0.35em 0.6em;
		text-align: left;
	}
	.md :global(th) {
		font-weight: 600;
		background: color-mix(in oklab, var(--muted) 60%, transparent);
	}
	.md :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 1.2em 0;
	}
	.compact :global(p) {
		margin: 0.4em 0;
	}
</style>
