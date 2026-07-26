<script lang="ts">
	import { tokenizeJson, prettyJson } from '$lib/xray/highlight';

	interface Props {
		source: string;
		/** Pretty-print before highlighting. Off when showing literal bytes. */
		pretty?: boolean;
		wrap?: boolean;
	}
	let { source, pretty = true, wrap = true }: Props = $props();

	// Highlighting a megabyte of JSON character-by-character is not worth a
	// frozen tab. Past this, show it plain and say so.
	const LIMIT = 200_000;
	const tooBig = $derived(source.length > LIMIT);
	const text = $derived(pretty && !tooBig ? prettyJson(source) : source);
	const tokens = $derived(tooBig ? [] : tokenizeJson(text));
</script>

{#if tooBig}
	<p class="hx-eyebrow mb-1">
		{(source.length / 1024).toFixed(0)} KB — shown unhighlighted
	</p>
	<pre class="code" class:wrap>{source}</pre>
{:else}
	<pre class="code" class:wrap>{#each tokens as t, i (i)}<span class={t.kind}>{t.text}</span
			>{/each}</pre>
{/if}

<style>
	.code {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.65;
		tab-size: 2;
	}
	.wrap {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
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
	.boolean,
	.null {
		color: var(--hx-memory);
		font-style: italic;
	}
	.punct {
		color: color-mix(in oklab, var(--muted-foreground) 80%, transparent);
	}
</style>
