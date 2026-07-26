<script lang="ts">
	import HarnessDiagram from './HarnessDiagram.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON, type IconValue } from '$lib/icons';
	import { AGENT_TOOLS } from '$lib/agent/tools';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let active = $state<string | null>(null);

	/**
	 * What each piece is, in one sentence each.
	 *
	 * Deliberately short, and shorter than it was: the diagram above is now almost
	 * wordless, so this is where a sentence belongs — but only one. The app is the
	 * real explanation, and the panel each card names is where the answer lives.
	 *
	 * Order and ids match the diagram, top to bottom then left to right.
	 */

	/** Counted, not stated — a hardcoded number here would quietly go stale. */
	const OURS =
		['zero', 'one', 'two', 'three', 'four', 'five'][AGENT_TOOLS.length] ?? AGENT_TOOLS.length;
	const PARTS: {
		id: string;
		label: string;
		color: string;
		icon: IconValue;
		body: string;
		where: string;
	}[] = [
		{
			id: 'prompt',
			label: 'System prompt',
			color: 'var(--hx-model)',
			icon: ICON.prompt,
			body: 'You write a fraction of it. Every middleware the harness installs appends its own fragment to the rest.',
			where: 'Context tab'
		},
		{
			id: 'skills',
			label: 'Skills',
			color: 'var(--hx-tool)',
			icon: ICON.skill,
			body: 'Markdown files the model can choose to read. Only their names and descriptions sit in the prompt.',
			where: 'Skills tab'
		},
		{
			id: 'memory',
			label: 'Memory',
			color: 'var(--hx-memory)',
			icon: ICON.memory,
			body: 'Two lifetimes, one tool. The checkpointer holds this conversation; the Store outlives every thread.',
			where: 'Memory tab'
		},
		{
			id: 'files',
			label: 'Filesystem',
			color: 'var(--hx-fs)',
			icon: ICON.files,
			body: 'Not a disk — a channel in the graph state, which is why it is checkpointed and can be diffed.',
			where: 'Files tab'
		},
		{
			id: 'todos',
			label: 'Plan',
			color: 'var(--hx-state)',
			icon: ICON.todo,
			body: 'write_todos came with the harness. Last write wins, so a partial write replaces the whole list.',
			where: 'Plan tab'
		},
		{
			id: 'tools',
			label: 'Tools',
			color: 'var(--hx-tool)',
			icon: ICON.tool,
			body: `We wrote ${OURS}; the rest came with the harness. Every schema is re-sent on every single request.`,
			where: 'Context tab'
		},
		{
			id: 'messages',
			label: 'Messages',
			color: 'var(--hx-user)',
			icon: ICON.message,
			body: 'The whole transcript so far, resent in full each turn. This is the part that grows.',
			where: 'Context tab'
		},
		{
			id: 'subagents',
			label: 'Subagents',
			color: 'var(--hx-subagent)',
			icon: ICON.subagent,
			body: 'Its own context window, and only a summary comes back. 40k spent, 400 returned.',
			where: 'Timeline'
		}
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
		class="hx-rule fixed inset-x-0 top-10 bottom-10 z-50 mx-auto flex max-w-[min(900px,94vw)]
		       flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Anatomy of the harness"
	>
		<div class="hx-rule flex shrink-0 items-center gap-2 border-b px-5 py-3">
			<HugeiconsIcon icon={ICON.help} size={15} strokeWidth={1.5} />
			<h2 class="text-sm font-semibold">Anatomy of the harness</h2>
			<span class="hx-eyebrow ml-auto">hover a piece</span>
			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (open = false)}
				aria-label="Close"
			>
				<HugeiconsIcon icon={ICON.close} size={15} strokeWidth={1.5} />
			</button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
			<p class="mb-5 max-w-[62ch] text-xs leading-relaxed text-muted-foreground">
				An agent is a loop: assemble a context, call the model once, run whatever tools it asked
				for, fold the results back in, repeat. The panels on the right of the app show every piece
				of it live.
			</p>

			<!-- Below ~520px the labels stop being legible, so the drawing keeps a floor
			     and scrolls sideways rather than shrinking into illegibility. -->
			<div class="-mx-1 overflow-x-auto px-1">
				<div class="min-w-[520px]">
					<HarnessDiagram bind:active />
				</div>
			</div>

			<div class="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
				{#each PARTS as p (p.id)}
					<div
						class="rounded-[3px] p-2.5 transition-colors"
						style:background={active === p.id
							? `color-mix(in oklab, ${p.color} 10%, transparent)`
							: 'transparent'}
						onmouseenter={() => (active = p.id)}
						onmouseleave={() => (active = null)}
						role="presentation"
					>
						<p class="mb-1 flex items-center gap-1.5 text-xs font-semibold" style:color={p.color}>
							<HugeiconsIcon icon={p.icon} size={13} strokeWidth={1.5} />
							{p.label}
							<span class="hx-eyebrow ml-auto opacity-60">{p.where}</span>
						</p>
						<p class="text-[11px] leading-relaxed text-muted-foreground">{p.body}</p>
					</div>
				{/each}
			</div>

			<p class="hx-rule mt-6 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground/80">
				The point of the right-hand pane is that none of this is a diagram of what *should* happen —
				it is read from the actual bytes on the wire, the actual graph, and the actual state
				channels. If the harness changes, every panel changes with it.
			</p>
		</div>
	</div>
{/if}
