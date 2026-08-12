<script lang="ts">
	import { skills } from '$lib/agent/skills.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { tip } from '$lib/hooks/tip';

	/**
	 * Skills, as the two-state thing they actually are.
	 *
	 * The skills panel prints every description, which is the point when you are
	 * deciding what to install and noise when you are watching. Watching, a skill
	 * has exactly two states worth knowing: its name and description are in the
	 * prompt (always, for every active skill — that is what progressive
	 * disclosure means), and its SKILL.md has or has not actually been read this
	 * run.
	 *
	 * That second bit is the lesson the chapter spends a page on: the prompt
	 * carries a cheap index, and the body is only paid for when the agent goes
	 * and fetches it. A chip that lights on first read shows the whole mechanism
	 * happening, live, in about forty pixels.
	 */
	const est = (chars: number) => Math.round(chars / 4);

	const listed = $derived(
		skills.active.reduce((n, s) => n + s.name.length + s.description.length + 40, 0)
	);

	/** Which SKILL.md files the agent has actually opened this run. */
	const opened = $derived.by(() => {
		void bus.version;
		// Scratch — rebuilt per derivation, never mutated afterwards. See ToolDial.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const hit = new Set<string>();
		for (const e of bus.events) {
			if (e.kind !== 'tool_start' || e.name !== 'read_file') continue;
			const raw = e.args as { file_path?: string; path?: string };
			const path = raw?.file_path ?? raw?.path;
			const m = typeof path === 'string' && path.match(/^\/skills\/([^/]+)\/SKILL\.md$/);
			if (m) hit.add(m[1]);
		}
		return hit;
	});
</script>

<div class="hx-skills">
	<div class="hx-head">
		<span class="hx-num">~{est(listed)}</span>
		<span class="hx-unit">tok in prompt</span>
		<span class="hx-num hx-read">{opened.size}/{skills.active.length} read</span>
	</div>

	<ul>
		{#each skills.active as s (s.name)}
			{@const isOpen = opened.has(s.name)}
			<li
				class:hx-open={isOpen}
				{@attach tip(
					`${s.name} — ${isOpen ? 'body read this run' : 'index only; body not fetched'}\n${s.description}`
				)}
			>
				<i></i>{s.name}
			</li>
		{/each}
		{#if !skills.active.length}
			<li class="hx-none">no skills active</li>
		{/if}
	</ul>
</div>

<style>
	.hx-skills {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.45rem;
		min-height: 0;
	}

	.hx-head {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		font-family: var(--font-mono);
		font-size: 8px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}
	.hx-head .hx-num:first-child {
		font-size: 13px;
		font-weight: 600;
		color: var(--hx-accent);
		letter-spacing: 0;
	}
	.hx-read {
		margin-left: auto;
	}

	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		overflow: hidden;
	}
	li {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 2px 6px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 8.5px;
		letter-spacing: 0.03em;
		color: var(--muted-foreground);
		background: color-mix(in oklab, var(--foreground) 6%, transparent);
	}
	li i {
		width: 4px;
		height: 4px;
		border-radius: 999px;
		background: currentColor;
		opacity: 0.5;
	}
	/* Lit once the body has actually been fetched — the whole point. */
	.hx-open {
		color: var(--hx-accent);
		background: color-mix(in oklab, var(--hx-accent) 14%, transparent);
	}
	.hx-open i {
		opacity: 1;
		box-shadow: 0 0 5px currentColor;
	}
	.hx-none {
		background: none;
		opacity: 0.55;
	}
</style>
