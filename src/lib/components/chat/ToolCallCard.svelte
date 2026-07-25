<script lang="ts">
	import type { ToolCall } from '$lib/agent/session.svelte';
	import JsonCode from '../xray/JsonCode.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { toolMeta, toolColor } from '$lib/agent/tool-meta';

	let { call }: { call: ToolCall } = $props();
	let open = $state(false);
	let showAll = $state(false);

	const meta = $derived(toolMeta(call.name));
	const color = $derived(toolColor(call.name));
	const rule = $derived(`color-mix(in oklab, ${color} 28%, transparent)`);

	// A fetch_paper result is 20k+ characters. Showing all of it inline turns the
	// conversation into a document dump; the full text is one click away.
	const CLIP = 900;
	const long = $derived((call.result?.length ?? 0) > CLIP);
	const shownResult = $derived(
		!call.result ? '' : showAll || !long ? call.result : call.result.slice(0, CLIP) + '…'
	);
	const resultIsJson = $derived(/^\s*[[{]/.test(call.result ?? ''));

	// One-glance preview of the arguments, so the common case needs no expanding.
	const preview = $derived.by(() => {
		const a = call.args;
		if (a === null || typeof a !== 'object') return String(a ?? '');
		const parts = Object.entries(a as Record<string, unknown>).map(([k, v]) => {
			const s = typeof v === 'string' ? v : JSON.stringify(v);
			return `${k}: ${s.length > 40 ? s.slice(0, 40) + '…' : s}`;
		});
		return parts.join('  ');
	});
</script>

<div class="my-0.5">
	<button
		class="group flex w-full items-baseline gap-2 py-0.5 text-left"
		onclick={() => (open = !open)}
	>
		<span
			class="shrink-0 translate-y-[2px]"
			style:color={color}
			style:opacity={call.status === 'running' ? 0.5 : 1}
			title={meta.blurb}
		>
			<HugeiconsIcon icon={meta.icon} size={13} strokeWidth={1.5} />
		</span>
		<span class="font-mono text-[11px]" style:color={color}>{call.name}</span>
		{#if meta.origin === 'harness'}
			<span class="hx-eyebrow shrink-0 opacity-50" title="Supplied by the harness, not by us">
				harness
			</span>
		{/if}
		<span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
			{preview}
		</span>
		{#if call.status === 'running'}
			<span class="hx-eyebrow shrink-0">running</span>
		{:else if call.status === 'error'}
			<span class="shrink-0 translate-y-[2px]" style:color="var(--hx-error)">
				<HugeiconsIcon icon={ICON.alert} size={12} strokeWidth={1.5} />
			</span>
		{:else}
			<span class="shrink-0 translate-y-[2px] text-muted-foreground/60">
				<HugeiconsIcon icon={ICON.ok} size={12} strokeWidth={1.5} />
			</span>
		{/if}
		<span
			class="shrink-0 translate-y-[2px] text-muted-foreground/50 transition-transform"
			style:transform={open ? 'rotate(0deg)' : 'rotate(-90deg)'}
		>
			<HugeiconsIcon icon={ICON.expand} size={12} strokeWidth={1.5} />
		</span>
	</button>

	{#if open}
		<div class="mt-0.5 ml-3.5 border-l pl-2.5" style:border-color={rule}>
			<p class="hx-eyebrow mb-0.5 text-[9px]">arguments</p>
			<JsonCode source={JSON.stringify(call.args ?? {})} />

			{#if call.result !== undefined}
				<div class="mt-1.5 flex items-baseline gap-2">
					<p class="hx-eyebrow text-[9px]">result</p>
					<span class="hx-num text-[9px] text-muted-foreground/60">
						{call.result.length.toLocaleString()} chars
					</span>
					{#if long}
						<button
							class="hx-eyebrow ml-auto text-[9px] transition-colors hover:text-foreground"
							onclick={() => (showAll = !showAll)}
						>
							{showAll ? 'less' : 'all'}
						</button>
					{/if}
				</div>

				{#if resultIsJson}
					<!-- Tool results are usually JSON — laying them out beats echoing
					     the escaped one-liner the model actually received. -->
					<JsonCode source={shownResult} />
				{:else}
					<pre class="result">{shownResult}</pre>
				{/if}

				{#if long && !showAll}
					<p class="mt-0.5 text-[9px] text-muted-foreground/50">
						truncated — {(call.result.length - CLIP).toLocaleString()} more
					</p>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.result {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		line-height: 1.55;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: color-mix(in oklab, var(--foreground) 78%, transparent);
	}
</style>
