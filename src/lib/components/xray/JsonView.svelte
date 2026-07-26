<script lang="ts">
	import { untrack } from 'svelte';
	import Self from './JsonView.svelte';

	interface Props {
		value: unknown;
		name?: string;
		depth?: number;
		/** Objects deeper than this start collapsed. */
		openTo?: number;
		/**
		 * Render the top level's entries directly, with no wrapper node.
		 *
		 * Every detail view previously opened with a single collapsed `{ 8 }` that
		 * had to be expanded before anything was visible, and indented everything
		 * underneath it for no reason. The root container is never the interesting
		 * part — you already know you are looking at one event.
		 */
		root?: boolean;
	}

	let { value, name, depth = 0, openTo = 2, root = false }: Props = $props();

	const isObj = $derived(value !== null && typeof value === 'object');
	const isArr = $derived(Array.isArray(value));
	const entries = $derived(
		isObj ? Object.entries(value as Record<string, unknown>) : ([] as [string, unknown][])
	);

	// Initial disclosure only — once rendered, the node's open state belongs to
	// whoever clicked it, not to the prop.
	let open = $state(untrack(() => root || depth < openTo));

	/**
	 * Recognise payloads that are better shown than printed.
	 *
	 * A generated image arrives as ~1.3 million base64 characters. Printing it
	 * fills the pane with noise and tells you nothing; the point of the value is
	 * what it depicts.
	 */
	const media = $derived.by(() => {
		if (typeof value !== 'string') return null;
		if (value.startsWith('data:image/')) return { kind: 'image' as const, src: value };
		if (value.startsWith('data:application/pdf')) return { kind: 'pdf' as const, src: value };
		// Bare base64 blobs (b64_json on the wire) have no prefix to go on.
		if (value.length > 2048 && /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 256))) {
			return { kind: 'blob' as const, src: '' };
		}
		return null;
	});

	function preview(v: unknown): string {
		if (Array.isArray(v)) return `[ ${v.length} ]`;
		return `{ ${Object.keys(v as object).length} }`;
	}

	function bytesOf(s: string) {
		const n = Math.round((s.length * 3) / 4);
		return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
	}
</script>

{#if root && isObj}
	<!-- No wrapper: straight into the contents. -->
	{#each entries as [k, v] (k)}
		<Self value={v} name={isArr ? `${k}` : k} depth={0} {openTo} />
	{/each}
{:else if isObj}
	<div class="row" style:--d={depth}>
		<button type="button" onclick={() => (open = !open)} class="tw">
			<span class="caret" class:open>▸</span>
			{#if name !== undefined}<span class="k">{name}</span>{/if}
			{#if !open}<span class="pv">{preview(value)}</span>{/if}
			{#if open && entries.length === 0}<span class="pv">{isArr ? '[ ]' : '{ }'}</span>{/if}
		</button>
	</div>
	{#if open}
		{#each entries as [k, v] (k)}
			<Self value={v} name={isArr ? `${k}` : k} depth={depth + 1} {openTo} />
		{/each}
	{/if}
{:else if media}
	<div class="row" style:--d={depth}>
		{#if name !== undefined}<span class="k">{name}</span>{/if}
	</div>
	<div class="media" style:--d={depth}>
		{#if media.kind === 'image'}
			<img src={media.src} alt={name ?? 'image'} />
		{:else if media.kind === 'pdf'}
			<span class="pv">PDF · {bytesOf(String(value))}</span>
		{:else}
			<span class="pv">binary · {bytesOf(String(value))} of base64, hidden</span>
		{/if}
	</div>
{:else}
	<div class="row leaf" style:--d={depth}>
		{#if name !== undefined}<span class="k">{name}</span>{/if}
		<span class="v" data-t={value === null ? 'null' : typeof value}>
			{typeof value === 'string' ? value : String(value)}
		</span>
	</div>
{/if}

<style>
	.row {
		padding-left: calc(var(--d) * 0.85rem);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.65;
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
	}
	.tw {
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		background: none;
		border: 0;
		padding: 0;
		cursor: pointer;
		font: inherit;
		text-align: left;
	}
	.caret {
		color: var(--muted-foreground);
		transition: transform 0.12s ease;
		display: inline-block;
		font-size: 0.6rem;
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.k {
		color: var(--muted-foreground);
	}
	.k::after {
		content: ':';
		opacity: 0.5;
	}
	.pv {
		color: color-mix(in oklab, var(--muted-foreground) 70%, transparent);
		font-family: var(--font-mono);
		font-size: 0.6875rem;
	}
	.v {
		color: var(--foreground);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	/* Type is carried by colour so a "1" and a 1 are never confused. */
	.v[data-t='string'] {
		color: var(--hx-state);
	}
	.v[data-t='number'] {
		color: var(--hx-model);
	}
	.v[data-t='boolean'],
	.v[data-t='null'] {
		color: var(--hx-tool);
		font-style: italic;
	}
	.media {
		padding-left: calc(var(--d) * 0.85rem + 0.85rem);
		padding-block: 0.25rem 0.5rem;
	}
	.media img {
		max-width: min(100%, 260px);
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
	}
</style>
