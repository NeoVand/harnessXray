<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';
	import { session } from '$lib/agent/session.svelte';

	/**
	 * Saved chats on this device.
	 *
	 * Lifted out of the page so the cockpit can offer the same list. The cockpit
	 * has no chat-column header, which took "new chat" and "history" with it —
	 * and history is how you get *back* to a conversation, so losing it there was
	 * a genuine dead end rather than a missing convenience.
	 *
	 * Deliberately not hoisted into the app header instead. There is a standing
	 * decision that these two act on the conversation rather than on the app, and
	 * belong next to it; a component both surfaces can mount honours that without
	 * either of them copying the markup.
	 */
	interface Props {
		onclose: () => void;
	}
	let { onclose }: Props = $props();

	function ago(t: number) {
		const s = Math.max(0, (Date.now() - t) / 1000);
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		return `${Math.floor(s / 86400)}d ago`;
	}
</script>

<!-- Title and dismiss share a row: closing a panel should not mean hunting for
     the control that opened it. -->
<div class="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
	<span class="hx-eyebrow">history</span>
	<button
		class="text-muted-foreground transition-colors hover:text-foreground"
		onclick={onclose}
		aria-label="Close history"
		{@attach tip('Close')}
	>
		<HugeiconsIcon icon={ICON.close} size={13} strokeWidth={1.5} />
	</button>
</div>

<div class="min-h-0 flex-1 overflow-y-auto">
	{#if session.threads.length === 0}
		<p class="px-4 pb-3 text-xs text-muted-foreground">No saved chats yet.</p>
	{:else}
		{#each session.threads as t (t.id)}
			<div
				class="group flex items-center transition-colors hover:bg-muted/60"
				class:bg-muted={t.id === session.threadId}
			>
				<button
					class="flex min-w-0 flex-1 items-baseline gap-2 py-1.5 pl-4 text-left"
					onclick={() => {
						session.openThread(t.id);
						onclose();
					}}
				>
					<span class="min-w-0 flex-1 truncate text-xs">{t.title}</span>
					<span class="hx-num shrink-0 text-[10px] text-muted-foreground">
						{t.messages} · {ago(t.updated)}
					</span>
				</button>
				<button
					class="shrink-0 px-3 py-1.5 text-muted-foreground/0 transition-colors
					       group-hover:text-muted-foreground/70 hover:!text-[var(--hx-error)]"
					onclick={() => session.deleteThread(t.id)}
					aria-label="Delete chat"
					{@attach tip('Delete this chat')}
				>
					<HugeiconsIcon icon={ICON.clear} size={12} strokeWidth={1.5} />
				</button>
			</div>
		{/each}
	{/if}
</div>
