<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import Markdown from '../Markdown.svelte';

	let selected = $state<string | null>(null);
	let raw = $state(false);

	const paths = $derived(session.fileList);
	const active = $derived(selected && session.files[selected] ? selected : (paths[0] ?? null));
	const content = $derived(active ? session.files[active] : '');

	function bytes(n: number) {
		return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
	}
</script>

<div class="flex h-full min-h-0 flex-col">
	{#if paths.length === 0}
		<p class="px-3 py-3 text-xs text-muted-foreground">
			The filesystem is empty. It is not a disk — it is a channel in the graph's state, which is why
			it survives a reload and can be diffed like any other state.
		</p>
	{:else}
		<div class="hx-rule max-h-[38%] shrink-0 overflow-y-auto border-b py-1">
			{#each paths as p (p)}
				<button
					class="flex w-full items-baseline gap-2 px-3 py-1 text-left transition-colors hover:bg-muted/60"
					class:bg-muted={p === active}
					onclick={() => (selected = p)}
				>
					<span class="translate-y-[2px] shrink-0" style:color="var(--hx-fs)">
						<HugeiconsIcon icon={ICON.file} size={11} strokeWidth={1.5} />
					</span>
					<span class="min-w-0 flex-1 truncate font-mono text-[11px]">{p}</span>
					<span class="hx-num shrink-0 text-[10px] text-muted-foreground">
						{bytes(session.files[p].length)}
					</span>
				</button>
			{/each}
		</div>

		<div class="min-h-0 flex-1 overflow-auto">
			<div class="hx-rule flex items-center justify-between border-b px-3 py-1.5">
				<span class="truncate font-mono text-[11px] text-muted-foreground">{active}</span>
				<button
					class="hx-eyebrow shrink-0 transition-colors hover:text-foreground"
					class:text-foreground={raw}
					onclick={() => (raw = !raw)}
				>
					{raw ? 'source' : 'rendered'}
				</button>
			</div>
			<div class="px-3 py-3">
				{#if raw || !active?.endsWith('.md')}
					<pre class="font-mono text-[11px] leading-relaxed whitespace-pre-wrap
					            [overflow-wrap:anywhere] text-foreground/85">{content}</pre>
				{:else}
					<Markdown source={content} />
				{/if}
			</div>
		</div>
	{/if}
</div>
