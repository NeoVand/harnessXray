<script lang="ts">
	import type { ToolCall } from '$lib/agent/session.svelte';
	import { toolMeta, toolColor } from '$lib/agent/tool-meta';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import ToolCallCard from './ToolCallCard.svelte';

	/**
	 * What the agent is doing — as one line, not a growing list.
	 *
	 * A single turn can be twenty tool calls. Printing all of them into the
	 * conversation buries the actual answer and duplicates the timeline, which
	 * already keeps every step and can expand any of them. So the chat shows the
	 * *current* step while running and collapses to a one-line receipt when done.
	 * The full record lives in one place instead of two.
	 */
	let { calls, streaming }: { calls: ToolCall[]; streaming: boolean } = $props();

	let expanded = $state(false);

	const current = $derived(calls.findLast((c) => c.status === 'running') ?? calls.at(-1));
	const done = $derived(calls.filter((c) => c.status !== 'running').length);
	const names = $derived([...new Set(calls.map((c) => c.name))]);

	function preview(c: ToolCall): string {
		const a = c.args;
		if (a === null || typeof a !== 'object') return '';
		const first = Object.values(a as Record<string, unknown>)[0];
		const s = typeof first === 'string' ? first : JSON.stringify(first ?? '');
		return s.length > 46 ? s.slice(0, 46) + '…' : s;
	}
</script>

{#if calls.length}
	{#if streaming && current}
		<!-- Live: one row, replaced in place as the agent moves on. -->
		<div class="flex items-baseline gap-2 py-1">
			<span class="shrink-0 translate-y-[2px]" style:color={toolColor(current.name)}>
				<HugeiconsIcon icon={toolMeta(current.name).icon} size={13} strokeWidth={1.5} />
			</span>
			<span class="font-mono text-[11px]" style:color={toolColor(current.name)}>{current.name}</span>
			<span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
				{preview(current)}
			</span>
			<span class="hx-num shrink-0 text-[10px] text-muted-foreground/60">
				{done}/{calls.length}
			</span>
		</div>
	{:else}
		<!-- Settled: a receipt. Click to see the calls without leaving the chat. -->
		<button
			class="group flex w-full items-baseline gap-2 py-1 text-left"
			onclick={() => (expanded = !expanded)}
		>
			<span class="shrink-0 translate-y-[2px] text-muted-foreground/70">
				<HugeiconsIcon icon={ICON.tool} size={12} strokeWidth={1.5} />
			</span>
			<span class="hx-eyebrow">
				{calls.length}
				{calls.length === 1 ? 'step' : 'steps'}
			</span>
			<span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/70">
				{names.join(' · ')}
			</span>
			<span
				class="shrink-0 translate-y-[2px] text-muted-foreground/50 transition-transform"
				style:transform={expanded ? 'rotate(0deg)' : 'rotate(-90deg)'}
			>
				<HugeiconsIcon icon={ICON.expand} size={12} strokeWidth={1.5} />
			</span>
		</button>

		{#if expanded}
			<div class="mb-1">
				{#each calls as c (c.id)}
					<ToolCallCard call={c} />
				{/each}
			</div>
		{/if}
	{/if}
{/if}
