<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { bus } from '$lib/xray/bus.svelte';
	import { plans, caused, type Track } from '$lib/xray/plan';
	import { compact } from '$lib/xray/usage';
	import { toolMeta } from '$lib/agent/tool-meta';
	import { subagentIcon } from '$lib/agent/subagent-meta';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The plan, with its history and its consequences.
	 *
	 * This panel used to print `session.todos` — the current list, flat, inert.
	 * Which is the one view of a planning channel that hides everything worth
	 * teaching about it. `todos` is last-write-wins, so the tidy list on screen
	 * was always tidy by construction: an item the agent quietly dropped left no
	 * trace, a reworded item looked like a new one, and a plan rewritten three
	 * times looked like a plan written once and followed.
	 *
	 * Three things changed. Every `write_todos` is a revision you can step
	 * through, with the diff marked. Every item opens to what it actually
	 * caused — the tool calls, the files, the tokens billed between the revision
	 * that started it and the revision that closed it. And plans are tracked per
	 * namespace, so a subagent's private plan is its own track rather than
	 * something that briefly replaced the parent's.
	 */
	interface Props {
		/** Move the timeline to an event. */
		onjump?: (eventId: string) => void;
	}
	let { onjump }: Props = $props();

	const tracks = $derived.by(() => {
		void bus.version;
		return plans(bus);
	});

	/** Which track is showing. Sticky by agent name across re-derivations. */
	let agent = $state('main');
	const track = $derived<Track | undefined>(tracks.find((t) => t.agent === agent) ?? tracks[0]);

	/**
	 * Which revision is showing, counted from the END.
	 *
	 * Zero is "the latest", and stays "the latest" as new revisions arrive —
	 * pinning an absolute index would freeze the panel on the old head the moment
	 * the agent wrote again, which is precisely when someone is watching.
	 */
	let back = $state(0);
	const revisions = $derived(track?.revisions ?? []);
	const at = $derived(Math.max(0, revisions.length - 1 - back));
	const rev = $derived(revisions[at]);
	const latest = $derived(back === 0);

	const done = $derived(rev?.items.filter((t) => t.status === 'completed').length ?? 0);

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

	const open = new SvelteSet<string>();
	function toggle(content: string) {
		if (!open.delete(content)) open.add(content);
	}

	/** What an item caused, computed only for the row you opened. */
	function work(content: string) {
		return track ? caused(bus, track, content) : null;
	}

	const secs = (ms: number) =>
		ms < 1000
			? '<1s'
			: ms < 90_000
				? `${Math.round(ms / 1000)}s`
				: `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`;

	/** Marked in this revision's diff — the row gets a hairline flag. */
	function markOf(content: string) {
		if (!rev) return '';
		if (rev.added.includes(content)) return 'new';
		const c = rev.changed.find((x) => x.content === content);
		return c ? c.to.replace('_', ' ') : '';
	}
</script>

<div class="relative flex h-full min-h-0 flex-col">
	<header
		class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-9 items-center gap-2 border-b px-3"
	>
		<span class="hx-eyebrow flex h-full items-center gap-1.5" style:color="var(--hx-accent)">
			<HugeiconsIcon icon={ICON.todo} size={12} strokeWidth={1.5} />
			plan
			{#if rev}
				<span class="hx-num text-[9px] opacity-60">{rev.items.length}</span>
			{/if}
		</span>

		<span class="ml-auto flex items-center gap-2.5 text-muted-foreground">
			{#if revisions.length > 1}
				<!-- The revision stepper, the same shape the context panel uses for
				     model calls — and for the same reason: the thing you want to
				     compare is the one immediately before this one. -->
				<span class="flex items-center gap-1">
					<button
						class="transition-colors hover:text-foreground disabled:opacity-30"
						disabled={at === 0}
						onclick={() => (back = Math.min(revisions.length - 1, back + 1))}
						aria-label="Previous revision"
						{@attach tip('The plan as it stood one write_todos earlier')}
					>
						<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} class="rotate-180" />
					</button>
					<button
						class="hx-num text-[10px] transition-colors hover:text-foreground"
						style:color={latest ? undefined : 'var(--hx-interrupt)'}
						onclick={() => (back = 0)}
						{@attach tip(latest ? 'The current plan' : 'Back to the current plan')}
					>
						{rev?.n ?? 0}/{revisions.length}
					</button>
					<button
						class="transition-colors hover:text-foreground disabled:opacity-30"
						disabled={latest}
						onclick={() => (back = Math.max(0, back - 1))}
						aria-label="Next revision"
						{@attach tip('The plan after the next write_todos')}
					>
						<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} />
					</button>
				</span>
			{/if}
			{#if rev}
				<button
					class="hx-eyebrow transition-colors hover:text-foreground"
					onclick={() => onjump?.(rev.id)}
					{@attach tip('The write_todos call that produced this list')}
				>
					<HugeiconsIcon icon={ICON.wire} size={11} strokeWidth={1.5} />
				</button>
			{/if}
		</span>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto px-3 pt-9 pb-3">
		{#if !track || !rev}
			<p class="text-xs leading-relaxed text-muted-foreground">
				No plan yet. The agent writes one with <span class="font-mono">write_todos</span> — a tool the
				harness provides, not one we wrote. Every call replaces the whole list, so this panel keeps each
				one.
			</p>
		{:else}
			{#if tracks.length > 1}
				<!-- One track per namespace. A subagent's plan is not a view of the
				     parent's — `todos` is excluded from what crosses the boundary, so
				     it planned into an empty channel of its own. -->
				<div class="mb-2 flex flex-wrap items-center gap-1">
					{#each tracks as t (t.scope)}
						<button
							class="hx-rule flex items-center gap-1 rounded border px-1.5 py-[3px] text-[9.5px]
							       transition-colors hover:bg-muted/60"
							class:bg-muted={t.agent === track.agent}
							style:border-color={t.agent === track.agent ? 'var(--hx-accent)' : undefined}
							onclick={() => {
								agent = t.agent;
								back = 0;
								open.clear();
							}}
						>
							<span style:color={t.scope === 'main' ? 'var(--hx-accent)' : 'var(--hx-subagent)'}>
								<HugeiconsIcon
									icon={t.scope === 'main' ? ICON.agent : subagentIcon(t.agent)}
									size={10}
									strokeWidth={1.5}
								/>
							</span>
							<span class="font-mono">{t.agent}</span>
							<span class="hx-num text-muted-foreground/60">{t.revisions.length}</span>
						</button>
					{/each}
				</div>
			{/if}

			<p class="hx-eyebrow mb-2 flex flex-wrap items-baseline gap-x-2">
				<span>{done} of {rev.items.length} complete</span>
				{#if !latest}
					<span style:color="var(--hx-interrupt)">
						· revision {rev.n}, not the current plan
					</span>
				{/if}
			</p>

			<ul class="space-y-px">
				{#each rev.items as t (t.content)}
					{@const mark = markOf(t.content)}
					{@const isOpen = open.has(t.content)}
					<li>
						<button
							class="flex w-full items-start gap-2 rounded-[3px] px-1 py-1 text-left text-xs
							       leading-relaxed transition-colors hover:bg-muted/50"
							onclick={() => toggle(t.content)}
							aria-expanded={isOpen}
						>
							<span class="mt-[3px] shrink-0" style:color={COLOR[t.status]}>
								<HugeiconsIcon icon={GLYPH[t.status]} size={12} strokeWidth={1.5} />
							</span>
							<span
								class="min-w-0 flex-1"
								class:line-through={t.status === 'completed'}
								class:text-muted-foreground={t.status !== 'in_progress'}
							>
								{t.content}
							</span>
							{#if mark}
								<!-- What this revision did to this row, which is the only way to
								     see a plan being rewritten rather than followed. -->
								<span
									class="hx-eyebrow mt-[3px] shrink-0 text-[8.5px]"
									style:color={mark === 'new' ? 'var(--hx-state)' : COLOR[t.status]}
								>
									{mark}
								</span>
							{/if}
						</button>

						{#if isOpen}
							{@const w = work(t.content)}
							<div class="mb-1 ml-[22px] space-y-1.5 pb-1">
								{#if !w}
									<p class="text-[10px] leading-relaxed text-muted-foreground/70">
										Nothing yet — this item has not been started in any revision, so there is no
										window to attribute work to.
									</p>
								{:else}
									<p class="hx-eyebrow flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
										<span class="text-muted-foreground/60">
											rev {w.from}→{w.open ? 'open' : w.to}
										</span>
										<span class="hx-num text-foreground/70">{secs(w.ms)}</span>
										{#if w.tokens}
											<span class="hx-num" style:color="var(--hx-model)">
												{compact(w.tokens)} tokens
											</span>
										{/if}
										<button
											class="hx-eyebrow transition-colors hover:text-foreground"
											style:color="var(--hx-accent)"
											onclick={() => onjump?.(w.at)}
										>
											jump →
										</button>
									</p>

									{#if w.tools.length}
										<p class="flex flex-wrap gap-1">
											{#each w.tools as tool (tool.name)}
												{@const meta = toolMeta(tool.name)}
												<button
													class="hx-rule flex items-center gap-1 rounded border px-1.5 py-0.5
													       font-mono text-[9.5px] transition-colors hover:bg-muted/60"
													onclick={() => onjump?.(tool.last)}
												>
													<span
														style:color={meta.origin === 'ours'
															? 'var(--hx-tool)'
															: 'var(--muted-foreground)'}
													>
														<HugeiconsIcon icon={meta.icon} size={9} strokeWidth={1.5} />
													</span>
													{tool.name}
													{#if tool.n > 1}
														<span class="hx-num text-muted-foreground/60">×{tool.n}</span>
													{/if}
												</button>
											{/each}
										</p>
									{:else}
										<p class="text-[10px] text-muted-foreground/70">
											No tool call in this window — the agent marked it done from what it already
											had.
										</p>
									{/if}

									{#if w.delegated.length}
										<p class="hx-eyebrow flex flex-wrap items-center gap-1.5">
											<span class="text-muted-foreground/60">delegated to</span>
											{#each w.delegated as d (d)}
												<span
													class="flex items-center gap-1 font-mono"
													style:color="var(--hx-subagent)"
												>
													<HugeiconsIcon icon={subagentIcon(d)} size={9} strokeWidth={1.5} />
													{d}
												</span>
											{/each}
										</p>
									{/if}

									{#if w.files.length}
										<p class="hx-eyebrow flex flex-wrap items-baseline gap-x-2">
											<span class="text-muted-foreground/60">wrote</span>
											{#each w.files.slice(0, 4) as f (f)}
												<span class="font-mono text-foreground/70">{f}</span>
											{/each}
											{#if w.files.length > 4}
												<span class="text-muted-foreground/60">+{w.files.length - 4}</span>
											{/if}
										</p>
									{/if}
								{/if}
							</div>
						{/if}
					</li>
				{/each}
			</ul>

			{#if rev.dropped.length || rev.retired.length}
				<!-- What this particular write deleted. A plan that replaces itself
				     wholesale looks identical to a plan being followed unless the
				     removals are printed beside the arrivals. -->
				<div class="mt-2">
					<p class="hx-eyebrow mb-1 text-muted-foreground/60">this write also removed</p>
					<ul class="space-y-0.5">
						{#each rev.dropped as d (d)}
							<li class="flex items-baseline gap-1.5 text-[10px] leading-relaxed">
								<span class="shrink-0" style:color="var(--hx-interrupt)">−</span>
								<span class="min-w-0 text-muted-foreground line-through">{d}</span>
							</li>
						{/each}
						{#each rev.retired as d (d)}
							<li class="flex items-baseline gap-1.5 text-[10px] leading-relaxed">
								<span class="shrink-0 text-muted-foreground/50">−</span>
								<span class="min-w-0 text-muted-foreground/60 line-through">{d}</span>
								<span class="hx-eyebrow shrink-0 text-[8.5px]" style:color="var(--hx-fs)">done</span
								>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if track.dropped.length}
				<!-- The failure the channel's semantics make easy, and the only thing
				     in the app that can catch it: an item that left the list without
				     ever being finished. -->
				<div
					class="hx-rule mt-3 rounded border px-2 py-1.5"
					style:border-color="color-mix(in oklab, var(--hx-interrupt) 40%, transparent)"
				>
					<p class="hx-eyebrow mb-1" style:color="var(--hx-interrupt)">
						left the list unfinished · {track.dropped.length}
					</p>
					<ul class="space-y-0.5">
						{#each track.dropped as d (d.content + d.at)}
							<li class="flex items-baseline gap-2 text-[10px] leading-relaxed">
								<button
									class="hx-num shrink-0 text-muted-foreground/60 transition-colors
									       hover:text-foreground"
									onclick={() => (back = Math.max(0, revisions.length - d.at))}
									{@attach tip('Show the plan as it was just before this write')}
								>
									r{d.at}
								</button>
								<span class="min-w-0 flex-1 text-muted-foreground line-through">{d.content}</span>
								{#if d.returned}
									<!-- Dropped and reinstated is a plan being rewritten; dropped and
									     never mentioned again is work that stopped existing. -->
									<span class="hx-eyebrow shrink-0 text-[8.5px] text-muted-foreground/60">
										came back
									</span>
								{:else}
									<span class="hx-eyebrow shrink-0 text-[8.5px]" style:color={COLOR[d.status]}>
										{d.status.replace('_', ' ')}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
					<p class="mt-1.5 text-[9.5px] leading-relaxed text-muted-foreground/70">
						A <span class="font-mono">write_todos</span> that omits an item deletes it. No warning is
						raised anywhere — the channel replaces, it does not merge.
					</p>
				</div>
			{/if}

			<p class="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
				{revisions.length}
				{revisions.length === 1 ? 'write' : 'writes'} of
				<span class="font-mono">write_todos</span>, each one replacing the whole list.
				{#if track.scope !== 'main'}
					This is <span class="font-mono">{track.agent}</span>'s own plan: `todos` does not cross
					the subagent boundary, so it planned into an empty channel and the parent never saw any of
					it.
				{/if}
			</p>
		{/if}
	</div>
</div>
