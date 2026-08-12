<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The long-term store, as cells.
	 *
	 * The memory panel is a reader: a key list beside the rendered body of
	 * whichever key is selected. Right for inspecting what was remembered, wrong
	 * for watching, where the questions are only ever "is there anything in
	 * there" and "did that last turn put something new in".
	 *
	 * One cell per key, sized by nothing and lit by recency: whatever was written
	 * this run glows. Empty is drawn as an explicit empty state rather than as
	 * blank space, because "the store is empty" is a real and frequently
	 * surprising answer — the store survives the thread, so an empty one after a
	 * long run means the agent never chose to write, which is worth noticing.
	 */
	const keys = $derived(session.memories ?? []);

	/** Paths written under /memories/ this run — the ones that just changed. */
	const fresh = $derived.by(() => {
		void bus.version;
		// Scratch — rebuilt per derivation, never mutated afterwards. See ToolDial.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const hit = new Set<string>();
		for (const e of bus.events) {
			if (e.kind !== 'fs_write' || typeof e.path !== 'string') continue;
			const m = e.path.match(/^\/memories\/(.+)$/);
			if (m) hit.add(m[1]);
		}
		return hit;
	});

	const short = (k: string) => k.replace(/^\/?memories\//, '').replace(/\.md$/, '');
</script>

<div class="hx-mem">
	{#if keys.length}
		<div class="hx-head">
			<span class="hx-num">{keys.length}</span>
			<span class="hx-unit">{keys.length === 1 ? 'entry' : 'entries'}</span>
			{#if fresh.size}<span class="hx-num hx-new">+{fresh.size} this run</span>{/if}
		</div>
		<ul>
			{#each keys as m (m.key)}
				<li
					class:hx-fresh={fresh.has(short(m.key))}
					{@attach tip(`${m.key}${fresh.has(short(m.key)) ? ' — written this run' : ''}`)}
				>
					{short(m.key)}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="hx-empty">
			<span class="hx-zero">0</span>
			<span class="hx-unit">nothing stored — the store outlives every thread</span>
		</div>
	{/if}
</div>

<style>
	.hx-mem {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.4rem;
		min-height: 0;
	}

	.hx-head {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
	}
	.hx-head .hx-num:first-child {
		font-size: 14px;
		font-weight: 600;
		color: var(--hx-memory);
	}
	.hx-unit {
		font-family: var(--font-mono);
		font-size: 8px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.hx-new {
		margin-left: auto;
		font-size: 8px;
		color: var(--hx-memory);
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		overflow: hidden;
	}
	li {
		padding: 2px 6px;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 8.5px;
		color: var(--muted-foreground);
		background: color-mix(in oklab, var(--foreground) 6%, transparent);
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hx-fresh {
		color: var(--hx-memory);
		background: color-mix(in oklab, var(--hx-memory) 16%, transparent);
	}

	.hx-empty {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.hx-zero {
		font-family: var(--font-mono);
		font-size: 20px;
		font-weight: 600;
		color: color-mix(in oklab, var(--hx-memory) 45%, transparent);
	}
	.hx-empty .hx-unit {
		max-width: 22ch;
		line-height: 1.35;
		text-transform: none;
		letter-spacing: 0.02em;
	}
</style>
