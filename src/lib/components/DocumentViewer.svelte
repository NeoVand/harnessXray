<script lang="ts">
	import Markdown from './Markdown.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { assets } from '$lib/storage/assets.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { downloadMarkdown, printToPdf } from '$lib/paper/download';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import PdfView from './PdfView.svelte';
	import { fileType } from '$lib/xray/filetype';

	let body = $state<HTMLElement | null>(null);

	/** The rendered DOM is the truth for PDF — it already has math and figures. */
	function asPdf() {
		const html = body?.querySelector('.md')?.innerHTML ?? '';
		if (path) printToPdf(path, html);
	}

	/**
	 * The reading surface.
	 *
	 * Reading and inspecting are different modes, so this replaces the
	 * instruments rather than sharing a 400px column with them — that is what
	 * made the old in-tree preview feel cramped. But it is *not* a modal: the
	 * conversation stays live beside it, because the thing you most want to do
	 * with a paper you are reading is ask about it.
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
	const kind = $derived(fileType(path ?? ''));

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
	<!--
		Docked, not floating.

		A modal over the whole app made reading and chatting mutually exclusive —
		you had to dismiss the paper to ask about it, which is exactly backwards
		for a tool whose point is discussing what you are reading. It takes the
		X-ray's half of the screen instead; the conversation stays live beside it,
		and closing gives the timeline and inspector back.
	-->
	<div class="flex h-full min-h-0 flex-col bg-background" aria-label={path}>
		<header class="hx-rule flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
			<span class="shrink-0" style:color={kind.color} title={kind.label}>
				<HugeiconsIcon icon={kind.icon} size={14} strokeWidth={1.5} />
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
				<pre
					class="p-6 font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]
				            whitespace-pre-wrap text-foreground/85">{text}</pre>
			{:else}
				<!-- Comfortable measure, generous leading: a document, not a panel. -->
				<article bind:this={body} class="doc mx-auto max-w-[68ch] px-8 py-10">
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
