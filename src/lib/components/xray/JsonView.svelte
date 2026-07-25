<script lang="ts">
	/**
	 * A collapsible JSON tree.
	 *
	 * Written by hand rather than pulled in, for one reason: this is the surface
	 * where a student reads the literal request body, so it has to render the
	 * *shape* honestly — long strings kept long, numbers distinguishable from
	 * numeric strings, empty containers visibly empty. A generic viewer optimises
	 * for compactness; this one optimises for truth.
	 */
	import { untrack } from 'svelte';
	import Self from './JsonView.svelte';

	interface Props {
		value: unknown;
		name?: string;
		depth?: number;
		/** Objects deeper than this start collapsed. */
		openTo?: number;
	}

	let { value, name, depth = 0, openTo = 2 }: Props = $props();

	const isObj = $derived(value !== null && typeof value === 'object');
	const isArr = $derived(Array.isArray(value));
	const entries = $derived(
		isObj ? Object.entries(value as Record<string, unknown>) : ([] as [string, unknown][])
	);
	// Initial disclosure only — once rendered, the node's open state belongs to
	// whoever clicked it, not to the prop. untrack says that on purpose.
	let open = $state(untrack(() => depth < openTo));

	function preview(v: unknown): string {
		if (Array.isArray(v)) return `[ ${v.length} ]`;
		return `{ ${Object.keys(v as object).length} }`;
	}
</script>

{#if isObj}
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
</style>
