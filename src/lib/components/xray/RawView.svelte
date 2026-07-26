<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { XrayEvent } from '$lib/xray/events';
	import { sseEventName } from '$lib/xray/highlight';
	import JsonCode from './JsonCode.svelte';

	/**
	 * The literal wire, made explorable.
	 *
	 * A streaming turn produces hundreds of SSE frames. Concatenated they are
	 * technically the truth and practically unreadable, which was the complaint.
	 * So frames become rows — grouped by their `event:` type, filterable, each
	 * expandable — while the `literal` toggle still gives back the exact
	 * unmodified bytes, because that view is the whole point of the pane.
	 */
	interface Props {
		event: XrayEvent | undefined;
		frames: XrayEvent[];
	}
	let { event, frames }: Props = $props();

	let literal = $state(false);
	let filter = $state<string | null>(null);
	const expanded = new SvelteSet<number>();

	const rows = $derived(
		frames
			.filter(
				(f): f is Extract<XrayEvent, { kind: 'http_sse_frame' }> => f.kind === 'http_sse_frame'
			)
			.map((f) => ({ i: f.i, raw: f.raw, name: sseEventName(f.raw) ?? 'data' }))
	);

	const types = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const r of rows) counts[r.name] = (counts[r.name] ?? 0) + 1;
		return Object.entries(counts).sort((a, b) => b[1] - a[1]);
	});

	const shown = $derived(filter ? rows.filter((r) => r.name === filter) : rows);

	/** Non-stream payloads: the request body, or a non-streamed response. */
	const single = $derived.by(() => {
		if (!event || rows.length) return '';
		if (event.kind === 'http_request') return JSON.stringify(event.body ?? null);
		if (event.kind === 'http_response' && event.body !== undefined)
			return JSON.stringify(event.body);
		if (event.kind === 'http_sse_frame') return event.raw;
		return JSON.stringify(event);
	});

	function toggle(i: number) {
		if (!expanded.delete(i)) expanded.add(i);
	}

	/** The one-line gist of a frame, so the list is scannable while collapsed. */
	function gist(raw: string): string {
		const data = raw
			.split('\n')
			.find((l) => l.startsWith('data:'))
			?.slice(5)
			.trim();
		if (!data) return raw.slice(0, 80);
		if (data === '[DONE]') return '[DONE]';
		try {
			const p = JSON.parse(data) as Record<string, unknown>;
			if (typeof p.delta === 'string' && p.delta) return JSON.stringify(p.delta);
			if (typeof p.text === 'string' && p.text) return JSON.stringify(p.text.slice(0, 60));
			return Object.keys(p).slice(0, 5).join(' · ');
		} catch {
			return data.slice(0, 80);
		}
	}
</script>

{#if !event}
	<p class="px-3 py-6 text-xs text-muted-foreground">Select an event to see its bytes.</p>
{:else if rows.length === 0}
	<div class="px-3 py-3"><JsonCode source={single} /></div>
{:else}
	<div class="hx-rule flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
		<button
			class="hx-eyebrow rounded px-1.5 py-0.5 transition-colors hover:text-foreground"
			class:bg-muted={!filter}
			onclick={() => (filter = null)}
		>
			all {rows.length}
		</button>
		{#each types as [name, n] (name)}
			<button
				class="hx-eyebrow rounded px-1.5 py-0.5 transition-colors hover:text-foreground"
				class:bg-muted={filter === name}
				onclick={() => (filter = filter === name ? null : name)}
				title={name}
			>
				{name.replace(/^response\./, '')}
				{n}
			</button>
		{/each}
		<button
			class="hx-eyebrow ml-auto transition-colors hover:text-foreground"
			class:text-foreground={literal}
			onclick={() => (literal = !literal)}
			title="Show the exact concatenated bytes, unmodified"
		>
			{literal ? 'frames' : 'literal'}
		</button>
	</div>

	{#if literal}
		<div class="px-3 py-3">
			<pre
				class="font-mono text-[11px] leading-relaxed [overflow-wrap:anywhere]
			            whitespace-pre-wrap text-foreground/80">{shown.map((r) => r.raw).join('\n\n')}</pre>
		</div>
	{:else}
		<div>
			{#each shown as r (r.i)}
				{@const open = expanded.has(r.i)}
				<div class="border-b border-[color-mix(in_oklab,var(--border)_40%,transparent)]">
					<button
						class="flex w-full items-baseline gap-2 px-3 py-1 text-left transition-colors hover:bg-muted/50"
						onclick={() => toggle(r.i)}
					>
						<span class="hx-num w-8 shrink-0 text-[10px] text-muted-foreground/60">{r.i}</span>
						<span class="hx-eyebrow shrink-0" style:color="var(--hx-model)">
							{r.name.replace(/^response\./, '')}
						</span>
						<span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
							{gist(r.raw)}
						</span>
					</button>
					{#if open}
						<div class="px-3 pt-1 pb-2.5 pl-11">
							<JsonCode source={r.raw} pretty={false} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
{/if}
