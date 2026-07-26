<script lang="ts">
	/**
	 * A PDF viewer we own.
	 *
	 * The obvious approach — `<iframe src=blob:…>` — relies on the host having a
	 * built-in PDF plugin. It reported `pdfViewerEnabled: true` and still painted
	 * a black rectangle in the embedded browser, and "works in some browsers" is
	 * not a viewer. pdf.js is already a dependency for text extraction and page
	 * thumbnails, so rendering the pages ourselves costs nothing extra, looks
	 * like the rest of the app, and behaves identically everywhere.
	 *
	 * Pages render lazily as they scroll into view: an arXiv paper is 30+ pages
	 * and rendering them all up front stalls the main thread for seconds.
	 */
	let { dataUrl, label }: { dataUrl: string; label?: string } = $props();

	let container = $state<HTMLElement | null>(null);
	let pageCount = $state(0);
	let error = $state('');
	let scale = $state(1.25);

	function bytesOf(url: string) {
		const n = Math.round((url.length * 3) / 4);
		return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
	}

	$effect(() => {
		const url = dataUrl;
		const host = container;
		const zoom = scale;
		if (!url || !host) return;

		let cancelled = false;
		let observer: IntersectionObserver | null = null;
		let task: { destroy: () => Promise<void> } | null = null;

		(async () => {
			try {
				const pdfjs = await import('pdfjs-dist');
				const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
				pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

				const bin = atob(url.split(',')[1]);
				const bytes = new Uint8Array(bin.length);
				for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

				const loading = pdfjs.getDocument({ data: bytes });
				task = loading;
				const doc = await loading.promise;
				if (cancelled) return;
				pageCount = doc.numPages;

				host.replaceChildren();
				observer = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (!entry.isIntersecting) continue;
							const el = entry.target as HTMLCanvasElement;
							if (el.dataset.rendered) continue;
							el.dataset.rendered = '1';
							observer?.unobserve(el);
							void renderPage(doc, Number(el.dataset.page), el, zoom);
						}
					},
					{ root: host.parentElement, rootMargin: '600px' }
				);

				// Placeholders first, sized from page one so the scrollbar is honest
				// before anything has rendered.
				const first = await doc.getPage(1);
				const ratio =
					first.getViewport({ scale: 1 }).height / first.getViewport({ scale: 1 }).width;

				for (let i = 1; i <= doc.numPages; i++) {
					const canvas = document.createElement('canvas');
					canvas.dataset.page = String(i);
					canvas.className = 'page';
					canvas.style.aspectRatio = String(1 / ratio);
					host.appendChild(canvas);
					observer.observe(canvas);
				}
			} catch (e) {
				if (!cancelled) error = e instanceof Error ? e.message : String(e);
			}
		})();

		return () => {
			cancelled = true;
			observer?.disconnect();
			void task?.destroy();
		};
	});

	interface RenderablePage {
		getViewport: (o: { scale: number }) => { width: number; height: number };
		render: (o: unknown) => { promise: Promise<void> };
	}

	async function renderPage(
		doc: { getPage: (n: number) => Promise<unknown> },
		n: number,
		canvas: HTMLCanvasElement,
		zoom: number
	) {
		const page = (await doc.getPage(n)) as RenderablePage;
		// Render at device resolution so text is crisp, then let CSS size it down.
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const viewport = page.getViewport({ scale: zoom * dpr });
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		await page.render({ canvas, canvasContext: ctx, viewport }).promise;
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="hx-rule flex shrink-0 items-center gap-3 border-b px-4 py-1.5">
		<span class="hx-eyebrow">
			{pageCount ? `${pageCount} pages` : 'loading…'} · {bytesOf(dataUrl)}
		</span>
		<div class="ml-auto flex items-center gap-1.5">
			<button
				class="hx-eyebrow transition-colors hover:text-foreground"
				onclick={() => (scale = Math.max(0.6, +(scale - 0.25).toFixed(2)))}
				aria-label="Zoom out">−</button
			>
			<span class="hx-num text-[10px] text-muted-foreground">{Math.round(scale * 100)}%</span>
			<button
				class="hx-eyebrow transition-colors hover:text-foreground"
				onclick={() => (scale = Math.min(3, +(scale + 0.25).toFixed(2)))}
				aria-label="Zoom in">+</button
			>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto bg-muted/40 px-4 py-4">
		{#if error}
			<p class="text-xs" style:color="var(--hx-error)">{error}</p>
		{/if}
		<div bind:this={container} class="pages" aria-label={label}></div>
	</div>
</div>

<style>
	.pages {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.9rem;
	}
	.pages :global(.page) {
		width: 100%;
		max-width: 780px;
		height: auto;
		background: #fff;
		border-radius: 3px;
		box-shadow: 0 1px 3px oklch(0 0 0 / 0.16);
	}
</style>
