<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	let text = $state('');
	let el = $state<HTMLTextAreaElement | null>(null);

	function grow() {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, 180) + 'px';
	}

	async function submit() {
		const value = text.trim();
		if (!value || session.busy) return;
		text = '';
		queueMicrotask(grow);
		await session.send(value);
	}

	function onKeydown(e: KeyboardEvent) {
		// Enter sends; Shift+Enter is a newline. The usual contract.
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div class="hx-rule shrink-0 border-t bg-background px-6 py-3">
	<div class="mx-auto flex w-full max-w-[68ch] items-end gap-3">
		<textarea
			bind:this={el}
			bind:value={text}
			oninput={grow}
			onkeydown={onKeydown}
			rows="1"
			disabled={session.busy}
			placeholder={keys.present ? 'Ask the agent something…' : 'Add a key in settings to begin…'}
			class="max-h-[180px] min-h-[24px] flex-1 resize-none border-0 bg-transparent p-0 text-sm
			       leading-relaxed placeholder:text-muted-foreground/60 focus:border-0 focus:ring-0
			       focus:outline-none disabled:opacity-50"
		></textarea>

		<button
			onclick={submit}
			disabled={!text.trim() || session.busy}
			class="shrink-0 pb-0.5 text-muted-foreground transition-colors hover:text-foreground
			       disabled:pointer-events-none disabled:opacity-30"
			title={session.busy ? 'Running…' : 'Send (↵)'}
			aria-label="Send message"
		>
			<HugeiconsIcon
				icon={session.busy ? ICON.pause : ICON.send}
				size={16}
				strokeWidth={1.5}
				class={session.busy ? 'animate-pulse' : ''}
			/>
		</button>
	</div>
</div>
