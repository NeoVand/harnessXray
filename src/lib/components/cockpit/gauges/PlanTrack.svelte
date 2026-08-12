<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The todo list, as a progress track.
	 *
	 * The plan panel shows the text of every item, which matters when you are
	 * reading the plan and not when you are watching it being worked. Watching,
	 * the questions are: how many, how far, and which one right now. One pip per
	 * item answers all three without a single line of prose, and the item in
	 * flight gets the only motion on the instrument.
	 *
	 * The active item's text sits underneath on one clamped line — that much
	 * prose earns its space, because "which one right now" is not answerable by a
	 * pip alone.
	 */
	const todos = $derived(session.todos ?? []);
	const done = $derived(todos.filter((t) => t.status === 'completed').length);
	const active = $derived(todos.find((t) => t.status === 'in_progress'));
</script>

<div class="hx-plan">
	{#if todos.length}
		<div class="hx-pips">
			{#each todos as t, i (i)}
				<span
					class="hx-pip hx-{t.status}"
					{@attach tip(`${t.status.replace('_', ' ')} — ${t.content}`)}
				></span>
			{/each}
		</div>
		<p class="hx-now">
			{#if active}
				<span class="hx-num hx-frac">{done}/{todos.length}</span>
				{active.content}
			{:else}
				<span class="hx-num hx-frac">{done}/{todos.length}</span>
				{done === todos.length ? 'all done' : 'nothing in flight'}
			{/if}
		</p>
	{:else}
		<span class="hx-idle">no plan yet</span>
	{/if}
</div>

<style>
	.hx-plan {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.45rem;
		min-height: 0;
	}

	.hx-pips {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.hx-pip {
		flex: 1 1 6px;
		min-width: 6px;
		max-width: 22px;
		height: 6px;
		border-radius: 2px;
		background: color-mix(in oklab, var(--foreground) 12%, transparent);
	}
	.hx-completed {
		background: var(--hx-fs);
	}
	.hx-in_progress {
		background: var(--hx-interrupt);
		box-shadow: 0 0 6px color-mix(in oklab, var(--hx-interrupt) 70%, transparent);
		animation: hx-plan-pulse 1.3s ease-in-out infinite;
	}
	@keyframes hx-plan-pulse {
		50% {
			opacity: 0.4;
		}
	}

	.hx-now {
		font-size: 10px;
		line-height: 1.35;
		color: var(--muted-foreground);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}
	.hx-frac {
		color: var(--hx-state);
		margin-right: 0.35rem;
		font-size: 9px;
	}

	.hx-idle {
		margin: auto;
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		opacity: 0.55;
	}
</style>
