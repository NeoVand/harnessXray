<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { fileType } from '$lib/xray/filetype';

	/**
	 * A real tree, not a list of full paths.
	 *
	 * The agent's filesystem is genuinely hierarchical — /notes, /paper,
	 * /figures, /memories — and flattening it to eleven long strings loses the
	 * one thing a viewer is for: seeing how the work is organised. Directories
	 * are derived from the paths themselves, since nothing stores them.
	 */
	interface Entry {
		path: string;
		bytes: number;
		kind: 'text' | 'image';
	}

	interface Props {
		entries: Entry[];
		active: string | null;
		onselect: (path: string) => void;
	}
	let { entries, active, onselect }: Props = $props();

	interface Node {
		name: string;
		path: string;
		children: Map<string, Node>;
		leaf?: Entry;
	}

	const root = $derived.by(() => {
		const r: Node = { name: '', path: '', children: new Map() };
		for (const entry of entries) {
			const parts = entry.path.split('/').filter(Boolean);
			let node = r;
			parts.forEach((part, i) => {
				const path = '/' + parts.slice(0, i + 1).join('/');
				if (!node.children.has(part)) {
					node.children.set(part, { name: part, path, children: new Map() });
				}
				node = node.children.get(part)!;
				if (i === parts.length - 1) node.leaf = entry;
			});
		}
		return r;
	});

	// Directories start open — this is a working tree, not a file manager, and
	// it is small enough that hiding anything costs more than it saves.
	let collapsed = $state<Set<string>>(new Set());
	function toggle(path: string) {
		const next = new Set(collapsed);
		next.has(path) ? next.delete(path) : next.add(path);
		collapsed = next;
	}

	function size(n: number) {
		return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
	}

	/** Sort directories first, then alphabetically — the usual expectation. */
	function ordered(node: Node): Node[] {
		return [...node.children.values()].sort((a, b) => {
			const ad = a.children.size > 0;
			const bd = b.children.size > 0;
			if (ad !== bd) return ad ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
	}
</script>

{#snippet branch(node: Node, depth: number)}
	{#each ordered(node) as child (child.path)}
		{@const isDir = child.children.size > 0}
		{@const open = !collapsed.has(child.path)}
		{#if isDir}
			<button
				class="flex w-full items-center gap-1.5 py-[3px] pr-2 text-left transition-colors hover:bg-muted/50"
				style:padding-left="{depth * 12 + 8}px"
				onclick={() => toggle(child.path)}
			>
				<span
					class="shrink-0 text-muted-foreground/50 transition-transform"
					style:transform={open ? 'rotate(0deg)' : 'rotate(-90deg)'}
				>
					<HugeiconsIcon icon={ICON.expand} size={10} strokeWidth={1.5} />
				</span>
				<span class="font-mono text-[11px] text-muted-foreground">{child.name}</span>
			</button>
			{#if open}
				{@render branch(child, depth + 1)}
			{/if}
		{:else}
			{@const entry = child.leaf}
			{@const kind = fileType(child.path)}
			<button
				class="flex w-full items-center gap-1.5 py-[3px] pr-2 text-left transition-colors hover:bg-muted/60"
				class:bg-muted={child.path === active}
				style:padding-left="{depth * 12 + 8}px"
				onclick={() => onselect(child.path)}
			>
				<span class="shrink-0" style:color={kind.color} title={kind.label}>
					<HugeiconsIcon icon={kind.icon} size={11} strokeWidth={1.5} />
				</span>
				<span class="min-w-0 flex-1 truncate font-mono text-[11px]">{child.name}</span>
				{#if entry}
					<span class="hx-num shrink-0 text-[9px] text-muted-foreground/60">
						{size(entry.bytes)}
					</span>
				{/if}
			</button>
		{/if}
	{/each}
{/snippet}

<div class="py-1">
	{@render branch(root, 0)}
</div>
