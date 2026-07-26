<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { REPO_URL, AUTHOR } from '$lib/meta';

	/**
	 * Who made this, and where it lives.
	 *
	 * Small on purpose. A colophon is not a landing page — it answers "what am I
	 * looking at and who do I ask about it", and anything beyond that belongs in
	 * the README.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	const LINKS = [
		{ label: 'GitHub', href: AUTHOR.github, icon: ICON.github },
		{ label: 'LinkedIn', href: AUTHOR.linkedin, icon: ICON.linkedin }
	];
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && open) open = false;
	}}
/>

{#if open}
	<div
		class="fixed inset-0 z-40 bg-background/70 backdrop-blur-[2px]"
		onclick={() => (open = false)}
		role="presentation"
	></div>

	<div
		class="hx-rule fixed top-1/2 left-1/2 z-50 w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2
		       rounded-lg border bg-background p-6 shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="About harnessXray"
	>
		<button
			class="absolute top-3 right-3 text-muted-foreground transition-colors hover:text-foreground"
			onclick={() => (open = false)}
			aria-label="Close"
		>
			<HugeiconsIcon icon={ICON.close} size={14} strokeWidth={1.5} />
		</button>

		<div class="flex items-center gap-2.5">
			<HugeiconsIcon icon={ICON.agent} size={22} strokeWidth={1.5} />
			<span class="hx-wordmark text-[19px]">harnessXray</span>
		</div>

		<p class="mt-4 text-xs leading-relaxed text-muted-foreground">
			A lab for seeing how an AI agent actually works. It runs a real Deep Agents harness in your
			browser — planning, tools, memory, subagents, skills — and takes it apart while it runs: the
			literal request, the raw stream, the graph, the context window.
		</p>

		<p class="hx-eyebrow mt-6 mb-2">built by</p>
		<p class="text-sm">{AUTHOR.name}</p>

		<div class="mt-3 flex flex-wrap gap-2">
			{#each LINKS as l (l.label)}
				<a
					href={l.href}
					target="_blank"
					rel="noreferrer noopener"
					class="hx-rule flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs
					       transition-colors hover:bg-muted"
				>
					<HugeiconsIcon icon={l.icon} size={13} strokeWidth={1.5} />
					{l.label}
				</a>
			{/each}
		</div>

		<a
			href={REPO_URL}
			target="_blank"
			rel="noreferrer noopener"
			class="hx-eyebrow mt-5 flex items-center gap-1.5 transition-colors hover:text-foreground"
		>
			<HugeiconsIcon icon={ICON.github} size={11} strokeWidth={1.5} />
			source
		</a>
	</div>
{/if}
