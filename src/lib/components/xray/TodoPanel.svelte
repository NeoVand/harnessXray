<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	const GLYPH = {
		completed: ICON.ok,
		in_progress: ICON.run,
		pending: ICON.todo
	} as const;

	const COLOR = {
		completed: 'var(--hx-fs)',
		in_progress: 'var(--hx-interrupt)',
		pending: 'var(--muted-foreground)'
	} as const;

	const done = $derived(session.todos.filter((t) => t.status === 'completed').length);
</script>

<div class="px-3 py-3">
	{#if session.todos.length === 0}
		<p class="text-xs text-muted-foreground">
			No plan yet. The agent writes one with <span class="font-mono">write_todos</span> — a tool the harness
			provides, not one we wrote.
		</p>
	{:else}
		<p class="hx-eyebrow mb-3">{done} of {session.todos.length} complete</p>
		<ul class="space-y-1.5">
			{#each session.todos as t (t.content)}
				<li class="flex items-start gap-2 text-xs leading-relaxed">
					<span class="mt-[3px] shrink-0" style:color={COLOR[t.status]}>
						<HugeiconsIcon icon={GLYPH[t.status]} size={12} strokeWidth={1.5} />
					</span>
					<span
						class:line-through={t.status === 'completed'}
						class:text-muted-foreground={t.status !== 'in_progress'}
					>
						{t.content}
					</span>
				</li>
			{/each}
		</ul>

		<p class="mt-5 text-[10px] leading-relaxed text-muted-foreground/70">
			This channel is last-write-wins: a partial <span class="font-mono">write_todos</span> replaces the
			whole list rather than merging into it.
		</p>
	{/if}
</div>
