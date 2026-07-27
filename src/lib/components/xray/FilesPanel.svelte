<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import Markdown from '../Markdown.svelte';
	import FileTree from './FileTree.svelte';
	import PageDeck from '../PageDeck.svelte';
	import { assets, assetVersion, type Asset } from '$lib/storage/assets.svelte';
	import { svgToDataUrl } from '$lib/paper/svg';

	interface Props {
		openPath?: string | null;
		/** Hand a path to the full-screen reader. */
		onread?: (path: string) => void;
		/** Padding inside the tree's scroller, so rows slide under the frosted
		 * bar above instead of clipping at it. */
		topPad?: string;
	}
	let { openPath = $bindable<string | null>(null), onread, topPad = '0px' }: Props = $props();

	let selected = $state<string | null>(null);

	/**
	 * Two stores, one tree.
	 *
	 * Text files live in the agent's virtual filesystem (a checkpointed graph
	 * channel); figures and papers live in the asset store (IndexedDB, because a
	 * PNG is ~950KB and a PDF is megabytes). To a reader they are one document
	 * tree, so the split shows up as an icon, not as separate navigation.
	 */
	let binaries = $state<Asset[]>([]);
	$effect(() => {
		void assetVersion.n;
		assets.list().then((all) => (binaries = all.filter((a) => a.kind !== 'thumb')));
	});

	const entries = $derived([
		...session.fileList.map((p) => ({
			path: p,
			bytes: session.files[p]?.length ?? 0,
			kind: 'text' as const
		})),
		...binaries.map((a) => ({ path: a.path, bytes: a.bytes, kind: 'image' as const }))
	]);

	const paths = $derived(entries.map((e) => e.path));

	$effect(() => {
		if (openPath && paths.includes(openPath)) selected = openPath;
	});

	const active = $derived(selected && paths.includes(selected) ? selected : (paths[0] ?? null));
	const isImage = $derived(!!active && /\.(png|jpe?g|webp)$/i.test(active));
	const isPdf = $derived(!!active && /\.pdf$/i.test(active));
	const isSvg = $derived(!!active && /\.svg$/i.test(active));
	const asset = $derived(active ? binaries.find((f) => f.path === active) : undefined);
	const content = $derived(active ? (session.files[active] ?? '') : '');
	/** Agent-written SVG is text in the files channel; sanitise, then show. */
	const svgUrl = $derived(isSvg ? (asset?.dataUrl ?? (content ? svgToDataUrl(content) : '')) : '');
	/** Renderable picture, whichever store it came from. Empty means the
	 * selection is a document (or a picture we cannot show safely). */
	const picture = $derived(isImage ? (asset?.dataUrl ?? '') : isSvg ? svgUrl : '');

	/**
	 * Page previews for the selected PDF.
	 *
	 * Whatever the asset already carries, else rendered from the bytes we still
	 * hold and written back. A PDF should look like a PDF wherever you meet it,
	 * and "open it to find out what it is" is not a preview.
	 */
	let pdfPages = $state<string[]>([]);
	$effect(() => {
		const path = active;
		// Read into a local, never back off `pdfPages` — an effect that reads the
		// state it writes registers itself as its own dependency and Svelte stops
		// it as a loop.
		const known = (asset?.meta?.pages as string[] | undefined) ?? [];
		if (!isPdf || !path) {
			pdfPages = [];
			return;
		}
		let live = true;
		pdfPages = known;
		if (!known.length) {
			void import('$lib/agent/pdf').then(({ pagesOf }) =>
				pagesOf(path).then((p) => {
					if (live) pdfPages = p;
				})
			);
		}
		return () => {
			live = false;
		};
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	{#if entries.length === 0}
		<p class="px-3 py-3 text-xs text-muted-foreground" style:margin-top={topPad}>
			The filesystem is empty. It is not a disk — it is a channel in the graph's state, which is why
			it survives a reload and can be diffed like any other state.
		</p>
	{:else}
		<div class="hx-rule max-h-[42%] shrink-0 overflow-y-auto border-b" style:padding-top={topPad}>
			<FileTree {entries} {active} onselect={(p) => (selected = p)} />
		</div>

		<div class="flex min-h-0 flex-1 flex-col">
			<div class="hx-rule flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
				<span class="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
					{active}
				</span>
				<!-- The panel is for glancing; reading happens in the viewer. -->
				<button
					class="hx-eyebrow flex shrink-0 items-center gap-1 transition-colors hover:text-foreground"
					onclick={() => active && onread?.(active)}
					title="Open (⏎)"
				>
					<HugeiconsIcon icon={ICON.expandView} size={11} strokeWidth={1.5} />
					open
				</button>
			</div>

			{#if picture}
				<!--
					A viewer, not a page.

					Pictures fit the pane and centre instead of going full-width and
					scrolling: the scrollbar gutter is reserved at all times (see the
					scrollbar rules in layout.css), so a scrolling image sat 12px from
					the left edge and 22px from the right — a lopsided frame you cannot
					unsee around a bordered figure. Fitting the pane means no scrollbar
					can exist, and a wide figure genuinely spans the panel.

					SVG keeps the reader's two fences — sanitised markup in an <img>,
					white ground because posters are authored against light.
				-->
				<button
					class="flex min-h-0 flex-1 items-center justify-center p-3"
					onclick={() => active && onread?.(active)}
				>
					<img
						src={picture}
						alt={active}
						class="hx-rule max-h-full max-w-full rounded border"
						class:bg-white={isSvg}
					/>
				</button>
			{:else}
				<div class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
					{#if isPdf}
						<!-- The pages were rendered when the PDF arrived, so showing them
						     costs nothing and beats a line of text claiming a PDF is here. -->
						{#if pdfPages.length}
							<PageDeck
								pages={pdfPages}
								max={300}
								label="Open {active}"
								onopen={() => active && onread?.(active)}
							/>
							<p class="hx-eyebrow mt-1 text-center">
								{asset ? `${(asset.bytes / 1024 / 1024).toFixed(1)} MB` : ''} · click to read
							</p>
						{:else}
							<button
								class="hx-rule flex w-full items-center gap-2 rounded border px-3 py-2 text-left
								       text-xs transition-colors hover:bg-muted"
								onclick={() => active && onread?.(active)}
							>
								<HugeiconsIcon icon={ICON.file} size={14} strokeWidth={1.5} />
								Read it · {asset ? (asset.bytes / 1024 / 1024).toFixed(1) : '?'} MB
							</button>
						{/if}
					{:else if isSvg}
						<p class="text-xs text-muted-foreground">
							This SVG could not be rendered safely — open it to read the source.
						</p>
					{:else if isImage}
						<p class="text-xs text-muted-foreground">Not in the asset store.</p>
					{:else}
						<Markdown source={content} onopen={(p) => (selected = p)} />
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>
