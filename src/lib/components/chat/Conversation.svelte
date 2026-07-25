<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import ToolCallCard from './ToolCallCard.svelte';
	import Markdown from '../Markdown.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	let { onopensettings }: { onopensettings: () => void } = $props();

	let viewport = $state<HTMLElement | null>(null);
	let pinned = $state(true);

	$effect(() => {
		// Re-run as text streams in, not only when a message is added.
		void session.messages.length;
		void session.messages.at(-1)?.text;
		if (pinned && viewport) viewport.scrollTop = viewport.scrollHeight;
	});

	function onScroll() {
		if (!viewport) return;
		pinned = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
	}

	const SUGGESTIONS = [
		'What tools do you have, and what is in your system prompt?',
		'Count the words in the first paragraph of Moby-Dick.',
		'Plan a three-section review of retrieval-augmented generation.'
	];
</script>

<div bind:this={viewport} onscroll={onScroll} class="min-h-0 flex-1 overflow-y-auto">
	<div class="mx-auto w-full max-w-[68ch] px-6 py-6">
		{#if session.messages.length === 0}
			<div class="pt-10">
				<p class="hx-eyebrow mb-3">the harness, live</p>
				<p class="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
					Everything this agent does is dissected on the right — the literal request body, every
					raw stream frame, the graph it runs on.
				</p>

				{#if !keys.present}
					<button
						onclick={onopensettings}
						class="hx-rule mt-5 flex items-center gap-2 rounded-md border px-3 py-2 text-xs
						       transition-colors hover:bg-muted"
					>
						<HugeiconsIcon icon={ICON.key} size={13} strokeWidth={1.5} />
						Add an OpenAI key to begin
						<HugeiconsIcon icon={ICON.next} size={13} strokeWidth={1.5} />
					</button>
					<p class="mt-3 max-w-[46ch] text-[11px] leading-relaxed text-muted-foreground/80">
						There is no server here. Your key is held in this tab and sent only to
						api.openai.com. You can still open the <span class="font-mono">graph</span> tab without
						one.
					</p>
				{:else}
					<ul class="mt-5 space-y-1.5">
						{#each SUGGESTIONS as s (s)}
							<li>
								<button
									class="group flex items-start gap-2 text-left text-xs text-muted-foreground
									       transition-colors hover:text-foreground"
									onclick={() => session.send(s)}
								>
									<span class="translate-y-[3px] opacity-40 transition-opacity group-hover:opacity-100">
										<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} />
									</span>
									{s}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		{#each session.messages as m (m.id)}
			<article class="mb-5">
				{#if m.role === 'user'}
					<p class="hx-eyebrow mb-1.5 flex items-center gap-1.5">
						<HugeiconsIcon icon={ICON.message} size={11} strokeWidth={1.5} />
						you
					</p>
					<p class="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
				{:else}
					<p class="hx-eyebrow mb-1.5 flex items-center gap-1.5" style:color="var(--hx-model)">
						<HugeiconsIcon icon={ICON.agent} size={11} strokeWidth={1.5} />
						agent
					</p>
					{#each m.toolCalls as c (c.id)}
						<ToolCallCard call={c} />
					{/each}
					{#if m.text}
						<Markdown source={m.text} />
					{/if}
					{#if m.streaming}
						<span class="caret" aria-label="streaming"></span>
					{/if}
				{/if}
			</article>
		{/each}

		{#if session.error}
			<p
				class="hx-rule rounded-md border px-3 py-2 text-xs"
				style:color="var(--hx-error)"
				style:border-color="color-mix(in oklab, var(--hx-error) 35%, transparent)"
			>
				{session.error}
			</p>
		{/if}
	</div>
</div>

<style>
	.caret {
		display: inline-block;
		width: 0.45rem;
		height: 0.95rem;
		translate: 0 0.15rem;
		background: var(--hx-model);
		animation: blink 1.1s step-end infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
