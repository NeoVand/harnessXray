<script lang="ts">
	import { skills } from '$lib/agent/skills.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';

	/**
	 * Which skills the run is carrying, and what they cost.
	 *
	 * The two numbers are the whole point. `listed` is what the library adds to
	 * every single request — a line per skill, name and description. `read` is
	 * what a skill costs the one time the agent decides it is relevant and opens
	 * the file. Keeping them side by side makes progressive disclosure a
	 * measurement rather than a claim.
	 */
	let { onmanage }: { onmanage?: () => void } = $props();

	const est = (chars: number) => Math.round(chars / 4);

	const listed = $derived(
		skills.active.reduce((n, s) => n + s.name.length + s.description.length + 40, 0)
	);

	/** Which SKILL.md files the agent has actually opened this run. */
	const opened = $derived.by(() => {
		void bus.version;
		const hit: string[] = [];
		for (const e of bus.events) {
			if (e.kind !== 'tool_start' || e.name !== 'read_file') continue;
			const path =
				(e.args as { file_path?: string; path?: string })?.file_path ??
				(e.args as { path?: string })?.path;
			const match = typeof path === 'string' && path.match(/^\/skills\/([^/]+)\/SKILL\.md$/);
			if (match && !hit.includes(match[1])) hit.push(match[1]);
		}
		return hit;
	});

	/** Whether the current thread's files actually contain each skill. */
	const seeded = $derived(
		new Set(Object.keys(session.files).filter((p) => p.startsWith('/skills/')))
	);
</script>

<div class="px-3 py-3">
	<div class="mb-3 flex items-baseline gap-2">
		<span class="hx-eyebrow">in the prompt</span>
		<span class="hx-num text-[11px]">~{est(listed).toLocaleString()} tokens</span>
		<button
			class="hx-eyebrow ml-auto flex items-center gap-1 transition-colors hover:text-foreground"
			onclick={() => onmanage?.()}
			{@attach tip('Open the skill library')}
		>
			<HugeiconsIcon icon={ICON.settings} size={11} strokeWidth={1.5} />
			manage
		</button>
	</div>

	{#if skills.active.length === 0}
		<p class="text-xs leading-relaxed text-muted-foreground">
			No skills loaded. A skill is a markdown file the agent can choose to read — the prompt only
			ever carries its name and description.
		</p>
	{:else}
		<ul class="space-y-2">
			{#each skills.active as s (s.name)}
				{@const isOpen = opened.includes(s.name)}
				<li class="flex items-baseline gap-2">
					<span
						class="mt-1 size-1.5 shrink-0 rounded-full"
						style:background="var(--hx-tool)"
						style:opacity={isOpen ? 1 : 0.35}
					></span>
					<span class="min-w-0 flex-1">
						<span class="flex items-baseline gap-2">
							<span class="font-mono text-[11px]">{s.name}</span>
							{#if isOpen}
								<span class="hx-eyebrow text-[9px]" style:color="var(--hx-tool)">read</span>
							{/if}
							<span class="hx-num ml-auto shrink-0 text-[9px] text-muted-foreground/70">
								{est(s.body.length).toLocaleString()} if read
							</span>
						</span>
						<span class="block text-[10.5px] leading-snug text-muted-foreground">
							{s.description}
						</span>
					</span>
				</li>
			{/each}
		</ul>

		<p class="mt-4 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground/80">
			<span class="mt-[2px] shrink-0"
				><HugeiconsIcon icon={ICON.skill} size={10} strokeWidth={1.5} /></span
			>
			<span>
				{#if seeded.size}
					The files are in this thread's filesystem, under <code class="font-mono">/skills/</code>.
					Reading one is an ordinary <code class="font-mono">read_file</code> — nothing about a skill
					is special to the harness except the line it adds to the prompt.
				{:else}
					They will be written into the filesystem when you send the next message.
				{/if}
			</span>
		</p>
	{/if}
</div>
