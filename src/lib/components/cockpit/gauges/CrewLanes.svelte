<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { crew } from '$lib/xray/crew';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The subagents, as lanes.
	 *
	 * There are only ever a handful, so this does not need to compress anything —
	 * it needs to stop being a list of cards you scroll past. One row each: the
	 * name, a track, and a pip per dispatch. Empty track means never used, which
	 * is information the panel version buries under prose.
	 *
	 * Pips rather than a bar because the counts are small and countable. Three
	 * dispatches should look like three things, not like 30% of a bar.
	 */
	interface Props {
		onjump?: (eventId: string) => void;
	}
	let { onjump }: Props = $props();

	const roster = $derived.by(() => {
		void bus.version;
		return crew(bus);
	});

	const peak = $derived(Math.max(1, ...roster.map((m) => m.calls.n)));
</script>

<ul class="hx-lanes">
	{#each roster as m (m.name)}
		<li class:hx-idle={!m.calls.n}>
			<button
				class="hx-name"
				onclick={() => m.calls.last && onjump?.(m.calls.last)}
				{@attach tip(
					`${m.name} — ${m.calls.n || 'never dispatched'}${m.calls.n ? ` dispatch${m.calls.n > 1 ? 'es' : ''}` : ''} · ${m.tools.count} tools`
				)}
			>
				{m.name}
			</button>
			<span class="hx-track" style:--fill="{(m.calls.n / peak) * 100}%">
				{#each { length: Math.min(m.calls.n, 12) } as _, i (i)}
					<i></i>
				{/each}
				{#if m.calls.n > 12}<b class="hx-num">+{m.calls.n - 12}</b>{/if}
			</span>
			<span class="hx-num hx-count">{m.calls.n || '·'}</span>
		</li>
	{/each}
	{#if !roster.length}
		<li class="hx-empty">no subagents on the wire</li>
	{/if}
</ul>

<style>
	.hx-lanes {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.28rem;
		min-height: 0;
		overflow: hidden;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	.hx-name {
		flex: none;
		width: 13ch;
		text-align: left;
		font-family: var(--font-mono);
		font-size: 8.5px;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--hx-subagent);
		border: 0;
		padding: 0;
		background: none;
	}
	.hx-idle .hx-name {
		color: var(--muted-foreground);
		opacity: 0.6;
	}

	.hx-track {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 2px;
		height: 9px;
		padding: 0 3px;
		border-radius: 2px;
		background: color-mix(in oklab, var(--foreground) 5%, transparent);
		overflow: hidden;
	}
	.hx-track i {
		width: 4px;
		height: 4px;
		border-radius: 1px;
		flex: none;
		background: var(--hx-subagent);
		box-shadow: 0 0 4px color-mix(in oklab, var(--hx-subagent) 60%, transparent);
	}
	.hx-track b {
		font-size: 7px;
		font-weight: 500;
		color: var(--muted-foreground);
		margin-left: 1px;
	}

	.hx-count {
		flex: none;
		width: 2.5ch;
		text-align: right;
		font-size: 8.5px;
		color: var(--muted-foreground);
	}

	.hx-empty {
		margin: auto;
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--muted-foreground);
		opacity: 0.55;
	}
</style>
