<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { bytes } from '$lib/xray/format';
	import { tip } from '$lib/hooks/tip';

	/**
	 * Everything the agent has written, as a treemap.
	 *
	 * A file tree is the right control for navigating and the wrong one for
	 * seeing: it shows names at uniform weight, hides whatever is below the fold,
	 * and says nothing at all about size — so a run that wrote one enormous
	 * review and eleven stubs looks exactly like a run that wrote twelve of the
	 * same thing.
	 *
	 * A treemap says both at once. Area is bytes, colour is the top-level
	 * directory, and the whole filesystem is always fully on screen because that
	 * is what a treemap is for. Clicking a cell opens it.
	 *
	 * Squarified rather than sliced. Naive slice-and-dice is four lines shorter
	 * and produces slivers — a 40KB review beside a 200-byte stub gives the stub
	 * a cell one pixel wide, which is unclickable and unreadable. Squarifying
	 * keeps aspect ratios near 1 by laying files in rows and starting a new row
	 * whenever adding to the current one would make it worse.
	 */
	interface Props {
		selected?: string | null;
		onopen?: (path: string) => void;
	}
	let { selected = null, onopen }: Props = $props();

	/** Top-level directory → colour, reusing the file-type family. */
	const TONE: Record<string, string> = {
		paper: 'var(--hx-file-doc)',
		notes: 'var(--hx-file-plain)',
		figures: 'var(--hx-file-image)',
		skills: 'var(--hx-accent)',
		memories: 'var(--hx-memory)',
		uploads: 'var(--hx-file-data)'
	};
	const toneOf = (p: string) => TONE[p.split('/').filter(Boolean)[0] ?? ''] ?? 'var(--hx-fs)';

	const files = $derived.by(() => {
		const src = session.files ?? {};
		return Object.entries(src)
			.map(([path, text]) => ({ path, size: Math.max(1, (text ?? '').length) }))
			.sort((a, b) => b.size - a.size);
	});

	const total = $derived(files.reduce((n, f) => n + f.size, 0));

	/**
	 * The shortest label that is still unique.
	 *
	 * Basenames alone are wrong here in the most common case there is: three
	 * skills produce three cells all labelled `SKILL.md`, which is worse than no
	 * label. Where a basename repeats, the parent directory comes along — which
	 * for `/skills/arxiv-review/SKILL.md` is exactly the part that identifies it.
	 */
	const labels = $derived.by(() => {
		// Scratch — rebuilt per derivation, never mutated afterwards. See ToolDial.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const seen = new Map<string, number>();
		for (const f of files) {
			const base = f.path.split('/').pop() ?? f.path;
			seen.set(base, (seen.get(base) ?? 0) + 1);
		}
		const out: Record<string, string> = {};
		for (const f of files) {
			const parts = f.path.split('/').filter(Boolean);
			const base = parts.at(-1) ?? f.path;
			out[f.path] = (seen.get(base) ?? 0) > 1 ? parts.slice(-2).join('/') : base;
		}
		return out;
	});

	interface Cell {
		path: string;
		size: number;
		x: number;
		y: number;
		w: number;
		h: number;
	}

	/**
	 * Squarified treemap over a 100×100 field, in percent.
	 *
	 * `worst` is the standard ratio test from Bruls et al.: adding a rectangle to
	 * the current row is worth it only while the worst aspect ratio in that row
	 * keeps improving.
	 */
	const cells = $derived.by((): Cell[] => {
		if (!files.length || !total) return [];
		const out: Cell[] = [];
		const items = files.map((f) => ({ ...f, area: (f.size / total) * 100 * 100 }));

		let x = 0,
			y = 0,
			w = 100,
			h = 100;
		let row: typeof items = [];
		const side = () => Math.min(w, h);

		const worst = (r: typeof items, s: number) => {
			if (!r.length) return Infinity;
			const sum = r.reduce((n, i) => n + i.area, 0);
			const mx = Math.max(...r.map((i) => i.area));
			const mn = Math.min(...r.map((i) => i.area));
			const s2 = s * s;
			const sum2 = sum * sum;
			return Math.max((s2 * mx) / sum2, sum2 / (s2 * mn));
		};

		const flush = () => {
			const sum = row.reduce((n, i) => n + i.area, 0);
			if (!sum) return;
			const horizontal = w >= h;
			const thick = sum / side();
			let at = 0;
			for (const i of row) {
				const len = i.area / thick;
				out.push(
					horizontal
						? { path: i.path, size: i.size, x, y: y + at, w: thick, h: len }
						: { path: i.path, size: i.size, x: x + at, y, w: len, h: thick }
				);
				at += len;
			}
			if (horizontal) {
				x += thick;
				w -= thick;
			} else {
				y += thick;
				h -= thick;
			}
			row = [];
		};

		for (const item of items) {
			if (row.length && worst(row, side()) < worst([...row, item], side())) flush();
			row.push(item);
		}
		flush();
		return out;
	});
</script>

<div class="hx-field">
	{#each cells as c (c.path)}
		<button
			class="hx-cell"
			class:hx-sel={c.path === selected}
			style:left="{c.x}%"
			style:top="{c.y}%"
			style:width="{c.w}%"
			style:height="{c.h}%"
			style:--c={toneOf(c.path)}
			onclick={() => onopen?.(c.path)}
			{@attach tip(`${c.path} — ${bytes(c.size)}`)}
		>
			<span>{labels[c.path]}</span>
		</button>
	{/each}
	{#if !cells.length}
		<span class="hx-idle">no files yet</span>
	{/if}
</div>

<style>
	.hx-field {
		position: relative;
		height: 100%;
		width: 100%;
		min-height: 0;
		border-radius: 3px;
		overflow: hidden;
		background: color-mix(in oklab, var(--foreground) 4%, transparent);
	}

	.hx-cell {
		position: absolute;
		border: 0;
		padding: 2px 3px;
		overflow: hidden;
		text-align: left;
		/* The hairline is the background showing through, not a drawn border —
		   so cells never add up to a grid of boxes. */
		box-shadow: 0 0 0 1px var(--background) inset;
		background: color-mix(in oklab, var(--c) 30%, transparent);
		color: color-mix(in oklab, var(--c) 45%, var(--foreground));
		transition:
			background 160ms ease,
			color 160ms ease;
	}
	.hx-cell:hover {
		background: color-mix(in oklab, var(--c) 55%, transparent);
	}
	.hx-sel {
		background: color-mix(in oklab, var(--c) 62%, transparent);
		box-shadow:
			0 0 0 1px var(--background) inset,
			0 0 0 1px var(--c);
	}
	.hx-cell span {
		display: block;
		font-family: var(--font-mono);
		font-size: 8px;
		line-height: 1.15;
		letter-spacing: 0.02em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hx-idle {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		opacity: 0.55;
	}
</style>
