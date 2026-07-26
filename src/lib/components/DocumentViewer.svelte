<script lang="ts">
	import Markdown from './Markdown.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { assets } from '$lib/storage/assets.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { downloadMarkdown, printToPdf } from '$lib/paper/download';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import PdfView from './PdfView.svelte';

	let body = $state<HTMLElement | null>(null);

	/** The rendered DOM is the truth for PDF — it already has math and figures. */
	function asPdf() {
		const html = body?.querySelector('.md')?.innerHTML ?? '';
		if (path) printToPdf(path, html);
	}

	/**
	 * The reading surface.
	 *
	 * The inspector pane is for dissecting things; a finished article wants a
	 * column of comfortable measure and room to breathe. This is a full overlay
	 * rather than another pane, because reading and inspecting are different
	 * modes — trying to do both in a 400px column is what made the file view feel
	 * cramped and scroll oddly against the tree.
	 */
	interface Props {
		path: string | null;
		onclose: () => void;
		onopen: (path: string) => void;
	}
	let { path, onclose, onopen }: Props = $props();

	const isImage = $derived(!!path && /\.(png|jpe?g|webp)$/i.test(path));
	const isPdf = $derived(!!path && /\.pdf$/i.test(path));
	const asset = $derived(path ? assets.peek(path) : undefined);
	const text = $derived(path ? (session.files[path] ?? '') : '');

	let showSource = $state(false);


	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && path) {
			e.stopPropagation();
			onclose();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if path}
	<!-- Scrim. Click-through to close is expected of an overlay. -->
	<div
		class="fixed inset-0 z-40 bg-background/70 backdrop-blur-[2px]"
		onclick={onclose}
		role="presentation"
	></div>

	<div
		class="hx-rule fixed inset-x-0 top-8 bottom-8 z-50 mx-auto flex max-w-[min(920px,92vw)]
		       flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
		role="dialog"
		aria-label={path}
		aria-modal="true"
	>
		<header class="hx-rule flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
			<span
				class="shrink-0"
				style:color={isImage ? 'var(--hx-tool)' : isPdf ? 'var(--hx-memory)' : 'var(--hx-fs)'}
			>
				<HugeiconsIcon
					icon={isImage ? ICON.sparkle : isPdf ? ICON.file : ICON.file}
					size={14}
					strokeWidth={1.5}
				/>
			</span>
			<span class="min-w-0 flex-1 truncate font-mono text-xs">{path}</span>

			{#if !isImage && !isPdf && path.endsWith('.md')}
				<button
					class="hx-eyebrow transition-colors hover:text-foreground"
					class:text-foreground={showSource}
					onclick={() => (showSource = !showSource)}
					title="Toggle raw markdown"
				>
					{showSource ? 'rendered' : 'source'}
				</button>

				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="hx-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
						title="Download"
					>
						<HugeiconsIcon icon={ICON.download} size={13} strokeWidth={1.5} />
						save
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="min-w-40">
						<DropdownMenu.Item onSelect={() => path && downloadMarkdown(path, text)}>
							<span class="font-mono text-xs">Markdown (.md)</span>
						</DropdownMenu.Item>
						<DropdownMenu.Item onSelect={asPdf}>
							<span class="font-mono text-xs">PDF</span>
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={onclose}
				aria-label="Close"
				title="Close (Esc)"
			>
				<HugeiconsIcon icon={ICON.close} size={15} strokeWidth={1.5} />
			</button>
		</header>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if isImage}
				{#if asset}
					<div class="p-6">
						<img src={asset.dataUrl} alt={path} class="hx-rule w-full rounded border" />
						{#if asset.meta?.prompt}
							<p class="hx-eyebrow mt-4 mb-1">prompt</p>
							<p class="text-xs leading-relaxed text-muted-foreground">{asset.meta.prompt}</p>
						{/if}
					</div>
				{:else}
					<p class="p-6 text-xs text-muted-foreground">Not in the asset store.</p>
				{/if}
			{:else if isPdf}
				{#if asset}
					<!-- Rendered by pdf.js rather than handed to an embedded viewer;
					     see PdfView for why. -->
					<PdfView dataUrl={asset.dataUrl} label={path} />
				{:else}
					<p class="p-6 text-xs text-muted-foreground">
						This PDF was not kept. Papers fetched before PDF retention was added are text-only.
					</p>
				{/if}
			{:else if showSource}
				<pre class="p-6 font-mono text-[11px] leading-relaxed whitespace-pre-wrap
				            [overflow-wrap:anywhere] text-foreground/85">{text}</pre>
			{:else}
				<!-- Comfortable measure, generous leading: a document, not a panel. -->
				<article bind:this={body} class="mx-auto max-w-[68ch] px-8 py-10 doc">
					<Markdown source={text} {onopen} />
				</article>
			{/if}
		</div>
	</div>
{/if}

<style>
	.doc :global(.md) {
		font-size: 0.95rem;
		line-height: 1.75;
	}
	.doc :global(.md h1) {
		font-size: 1.6em;
		margin-top: 0;
	}
	.doc :global(.md h2) {
		font-size: 1.22em;
		margin-top: 1.8em;
	}
	.doc :global(.md img) {
		margin: 1.4em 0;
	}
</style>
