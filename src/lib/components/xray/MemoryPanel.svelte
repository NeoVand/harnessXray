<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import Markdown from '../Markdown.svelte';

	let selected = $state<string | null>(null);

	const active = $derived(
		session.memories.find((m) => m.key === selected) ?? session.memories[0]
	);

	/** Store values are file records, not raw strings. */
	function textOf(value: unknown): string {
		if (typeof value === 'string') return value;
		const v = value as { content?: unknown } | null;
		if (typeof v?.content === 'string') return v.content;
		return JSON.stringify(value, null, 2);
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="hx-rule flex items-center justify-between border-b px-3 py-1.5">
		<span class="hx-eyebrow flex items-center gap-1.5" style:color="var(--hx-memory)">
			<HugeiconsIcon icon={ICON.memory} size={12} strokeWidth={1.5} />
			long-term store
		</span>
		<button
			class="hx-eyebrow transition-colors hover:text-foreground"
			onclick={() => session.refreshMemories()}
		>
			refresh
		</button>
	</div>

	{#if session.memories.length === 0}
		<div class="px-3 py-3">
			<p class="text-xs text-muted-foreground">
				Nothing stored yet. Anything the agent writes under
				<span class="font-mono">/memories/</span> lands here instead of in graph state — and survives
				into every future conversation.
			</p>
			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
				Unlike the plan and the filesystem, the Store publishes nothing on the graph stream. It is
				not part of the graph's state, so this panel has to poll for it.
			</p>
		</div>
	{:else}
		<div class="hx-rule max-h-[45%] shrink-0 overflow-y-auto border-b py-1">
			{#each session.memories as m (m.key)}
				<button
					class="flex w-full items-baseline gap-2 px-3 py-1 text-left transition-colors hover:bg-muted/60"
					class:bg-muted={m.key === active?.key}
					onclick={() => (selected = m.key)}
				>
					<span class="translate-y-[2px] shrink-0" style:color="var(--hx-memory)">
						<HugeiconsIcon icon={ICON.memory} size={11} strokeWidth={1.5} />
					</span>
					<span class="min-w-0 flex-1 truncate font-mono text-[11px]">{m.key}</span>
				</button>
			{/each}
		</div>

		{#if active}
			<div class="min-h-0 flex-1 overflow-auto px-3 py-3">
				{#if active.key.endsWith('.md')}
					<Markdown source={textOf(active.value)} />
				{:else}
					<pre class="font-mono text-[11px] leading-relaxed whitespace-pre-wrap
					            [overflow-wrap:anywhere] text-foreground/85">{textOf(active.value)}</pre>
				{/if}
			</div>
		{/if}
	{/if}
</div>
