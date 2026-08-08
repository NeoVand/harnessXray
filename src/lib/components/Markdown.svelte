<script lang="ts">
	import { marked } from 'marked';
	import { splitFrontmatter } from '$lib/paper/frontmatter';
	import Frontmatter from './Frontmatter.svelte';
	import DOMPurify from 'dompurify';
	import { assets, assetVersion } from '$lib/storage/assets.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { svgToDataUrl } from '$lib/paper/svg';
	import {
		extractMath,
		restoreMath,
		linkify,
		isInternalHref,
		internalPath
	} from '$lib/paper/enrich';

	/**
	 * Markdown for agent output.
	 *
	 * Sanitised with DOMPurify because the text is model-authored and — once the
	 * research tools run — partly *paper*-authored, i.e. genuinely untrusted
	 * input that has passed through a language model.
	 *
	 * The pipeline is ordered so each stage sees text the next can handle:
	 *   linkify → resolve figures → extract math → markdown → sanitize → restore math
	 * Math comes out first because KaTeX output is full of `$`, `\` and `_`,
	 * which markdown would mangle; it goes back after sanitising, from a source
	 * we control rather than one we whitelist.
	 */
	interface Props {
		source: string;
		compact?: boolean;
		/** Called when an internal link (a file path) is clicked. */
		onopen?: (path: string) => void;
	}
	let { source, compact = false, onopen }: Props = $props();

	marked.setOptions({ gfm: true, breaks: true });

	/**
	 * Frontmatter comes off the top BEFORE anything else runs.
	 *
	 * Left in, `marked` does the only thing it can with `---`: two horizontal
	 * rules around one running paragraph, so a skill's most structured lines
	 * rendered as its least structured prose. Splitting here also keeps it out of
	 * linkify and the math extractor, neither of which has any business inside a
	 * metadata header.
	 */
	const split = $derived(splitFrontmatter(source ?? ''));

	const prepared = $derived.by(() => {
		void assetVersion.n;
		// Figure paths are virtual. Rasters live in the asset store (a PNG is
		// ~950KB and graph state is checkpointed); an SVG the agent hand-wrote is
		// ordinary text in the files channel, so it resolves from there — through
		// the sanitiser, because model-authored markup is untrusted markup.
		const withFigures = linkify(split.body).replace(
			/!\[([^\]]*)\]\((\/(?:figures|paper|notes|uploads)\/[^)\s]+)\)/g,
			(whole, alt: string, path: string) => {
				const hit = assets.peek(path);
				if (hit) return `![${alt}](${hit.dataUrl})`;
				if (path.endsWith('.svg')) {
					const text = session.files[path];
					const url = typeof text === 'string' ? svgToDataUrl(text) : '';
					if (url) return `![${alt}](${url})`;
				}
				return whole;
			}
		);
		return extractMath(withFigures);
	});

	const html = $derived.by(() => {
		const parsed = marked.parse(prepared.text, { async: false }) as string;
		const clean = DOMPurify.sanitize(parsed, {
			ALLOWED_TAGS: [
				'p',
				'br',
				'strong',
				'em',
				'del',
				'code',
				'pre',
				'blockquote',
				'ul',
				'ol',
				'li',
				'a',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'table',
				'thead',
				'tbody',
				'tr',
				'th',
				'td',
				'hr',
				'sup',
				'sub',
				'img'
			],
			ALLOWED_ATTR: ['href', 'title', 'src', 'alt'],
			ADD_DATA_URI_TAGS: ['img'],
			ALLOW_DATA_ATTR: false,
			// `hx:` is our own scheme for internal file links; without this
			// DOMPurify strips it as an unknown protocol.
			ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|hx):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
		});
		return restoreMath(clean, prepared.nodes);
	});

	/** Intercept internal links; let real URLs behave normally. */
	function onClick(e: MouseEvent) {
		const link = (e.target as HTMLElement)?.closest?.('a');
		const href = link?.getAttribute('href');
		if (!href || !isInternalHref(href)) return;
		e.preventDefault();
		onopen?.(internalPath(href));
	}
</script>

{#if split.frontmatter}
	<Frontmatter source={split.frontmatter} {compact} />
{/if}
<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised immediately above -->
<div class="md" class:compact onclick={onClick} role="presentation">{@html html}</div>

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
		letter-spacing: -0.01em;
	}
	.md :global(h1) {
		font-size: 1.3em;
	}
	.md :global(h2) {
		font-size: 1.1em;
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
		text-decoration-color: color-mix(in oklab, currentColor 35%, transparent);
	}
	.md :global(a:hover) {
		text-decoration-color: currentColor;
	}
	/* Internal links read as app affordances, not web links. */
	.md :global(a[href^='hx:']) {
		color: var(--hx-fs);
		cursor: pointer;
	}
	.md :global(a[href^='hx:'] code) {
		background: color-mix(in oklab, var(--hx-fs) 12%, transparent);
	}
	.md :global(table) {
		border-collapse: collapse;
		margin: 1em 0;
		font-size: 0.92em;
		display: block;
		overflow-x: auto;
		max-width: 100%;
	}
	.md :global(th),
	.md :global(td) {
		border: 1px solid var(--border);
		padding: 0.4em 0.7em;
		text-align: left;
		vertical-align: top;
	}
	.md :global(th) {
		font-weight: 600;
		background: color-mix(in oklab, var(--muted) 60%, transparent);
		white-space: nowrap;
	}
	.md :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: var(--radius-sm);
		margin: 0.9em 0;
		display: block;
	}
	.md :global(hr) {
		border: 0;
		border-top: 1px solid var(--border);
		margin: 1.4em 0;
	}
	/* Long display equations should scroll, not blow out the column. */
	.md :global(.katex-display) {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0.35em 0;
		margin: 0.9em 0;
	}
	.md :global(.katex) {
		font-size: 1.02em;
	}
	.compact :global(p) {
		margin: 0.4em 0;
	}
</style>
