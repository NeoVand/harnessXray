<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import Markdown from '../Markdown.svelte';
	import FileTree from './FileTree.svelte';
	import PageDeck from '../PageDeck.svelte';
	import { assets, assetVersion, type Asset } from '$lib/storage/assets.svelte';
	import { svgToDataUrl } from '$lib/paper/svg';
	import { fileType } from '$lib/xray/filetype';
	import { tip } from '$lib/hooks/tip';

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
	 * Staging the file on screen into the next message.
	 *
	 * People kept doing this by pasting the path into the composer, and a path in
	 * prose is a suggestion the model can misread or ignore. As an attachment it
	 * is the same object an upload is — same chip, same manifest line — and the
	 * route it takes still depends on what it is, which is the part worth seeing:
	 * a note is already in the graph's `files` channel and costs nothing to point
	 * at, while a figure the agent drew itself has to ride inside the message as
	 * pixels, exactly like one you uploaded.
	 */
	let attaching = $state(false);
	let attachError = $state('');
	const staged = $derived(!!active && session.attachments.some((a) => a.path === active));

	const attachHint = $derived(
		isImage
			? 'Attach to the next message — pixels ride inside the message itself, and cost tokens on every turn after'
			: isPdf
				? 'Attach to the next message — the text is extracted and the agent reads it at a path'
				: 'Attach to the next message — the agent reads it at its path'
	);

	async function attach() {
		if (!active || staged || attaching) return;
		attaching = true;
		attachError = '';
		try {
			const { attachStored } = await import('$lib/agent/uploads');
			session.attachments.push(await attachStored(active, content));
		} catch (e) {
			attachError = e instanceof Error ? e.message : String(e);
		}
		attaching = false;
	}

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

		<!-- The preview, with a header on the same glass as every other panel's.
		     It floats over the body rather than sitting above it, which is the only
		     way frost means anything: a document scrolling under the bar is what
		     the blur is for. -->
		<div class="relative flex min-h-0 flex-1 flex-col">
			<div
				class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-8 items-center gap-3 border-b
				       px-3"
			>
				<!-- Named and coloured the same way the tree names it. The bar said
				     which path was showing and not what kind of thing it was, so the
				     one row that is entirely about this file was the one place its
				     type went unmarked. -->
				{#if active}
					{@const type = fileType(active)}
					<span class="shrink-0" style:color={type.color}>
						<HugeiconsIcon icon={type.icon} size={12} strokeWidth={1.5} />
					</span>
				{/if}
				<span class="-ml-1.5 min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
					{active}
				</span>
				<!-- Hand this file to the agent, from where you are already looking at
				     it. Stays lit once staged, because the chip it produced is in the
				     composer at the other end of the window. -->
				<button
					class="hx-eyebrow flex shrink-0 items-center gap-1 transition-colors
					       hover:text-foreground disabled:pointer-events-none"
					style:color={staged ? 'var(--hx-accent)' : undefined}
					disabled={staged || attaching}
					onclick={attach}
					{@attach tip(staged ? 'Staged in the composer — send to hand it over' : attachHint)}
				>
					<HugeiconsIcon icon={staged ? ICON.ok : ICON.attach} size={11} strokeWidth={1.5} />
					{staged ? 'attached' : attaching ? 'reading…' : 'attach'}
				</button>
				<!-- The panel is for glancing; reading happens in the viewer. -->
				<button
					class="hx-eyebrow flex shrink-0 items-center gap-1 transition-colors hover:text-foreground"
					onclick={() => active && onread?.(active)}
					{@attach tip('Open this file  ⏎')}
				>
					<HugeiconsIcon icon={ICON.expandView} size={11} strokeWidth={1.5} />
					open
				</button>
			</div>

			{#if attachError}
				<p
					class="hx-rule hx-frost absolute inset-x-0 top-8 z-20 border-b px-3 py-1 text-[10px]"
					style:color="var(--hx-error)"
				>
					{attachError}
				</p>
			{/if}

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
					class="flex min-h-0 flex-1 items-center justify-center p-3 pt-11"
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
				<!-- pt-11, not py-3: the scroller starts under the frosted bar so the
				     document passes beneath it rather than stopping short of it. -->
				<div class="min-h-0 flex-1 overflow-y-auto px-3 pt-11 pb-3">
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
