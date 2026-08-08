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
		// A hollow ring, not the panel's own checklist glyph: that one means "the
		// plan" in the header two lines above, and an item is not the plan.
		pending: ICON.pending
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

		<!-- Whose plan. Always shown, because a list with no owner reads as "the
		     agent's" and a subagent's private plan is a different object. With more
		     than one track these are also the switch. -->
		{#each tracks as t (t.scope)}
			{@const here = t.agent === track?.agent}
			<button
				class="flex shrink-0 items-center gap-1 transition-colors hover:text-foreground"
				class:cursor-default={tracks.length === 1}
				style:color={here
					? t.scope === 'main'
						? 'var(--hx-accent)'
						: 'var(--hx-subagent)'
					: 'var(--muted-foreground)'}
				style:opacity={here ? 1 : 0.55}
				onclick={() => {
					agent = t.agent;
					back = 0;
					open.clear();
				}}
				{@attach tip(
					t.scope === 'main'
						? 'The parent agent’s plan'
						: `${t.agent}’s own plan — todos do not cross the subagent boundary, so the parent never saw this one`
				)}
			>
				<HugeiconsIcon
					icon={t.scope === 'main' ? ICON.agent : subagentIcon(t.agent)}
					size={11}
					strokeWidth={1.5}
				/>
				{#if here}
					<span class="hx-eyebrow">{t.agent}</span>
				{/if}
			</button>
		{/each}

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
						{@attach tip(
							`${revisions.length} calls to write_todos — each one replaced the whole list. ` +
								(latest ? 'This is the current plan.' : 'Click for the current plan.')
						)}
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
				<!-- Padded past the glyph: an 11px icon is a hard target, and this one
				     is the only way from a revision back to the call that wrote it. -->
				<button
					class="-my-1 -mr-1 px-1 py-1 transition-colors hover:text-foreground"
					onclick={() => onjump?.(rev.id)}
					aria-label="Show this write in the timeline"
					{@attach tip('Show the write_todos call that produced this list, in the timeline')}
				>
					<HugeiconsIcon icon={ICON.wire} size={11} strokeWidth={1.5} />
				</button>
			{/if}
		</span>
	</header>

	<div class="min-h-0 flex-1 overflow-y-auto px-3 pt-9 pb-3">
		{#if !track || !rev}
			<p class="text-xs leading-relaxed text-muted-foreground">
				No plan yet — the agent writes one with <span class="font-mono">write_todos</span>.
			</p>
		{:else}
			<p class="hx-eyebrow mb-2 flex flex-wrap items-baseline gap-x-2">
				<span>{done} of {rev.items.length} complete</span>
				{#if !latest}
					<span style:color="var(--hx-interrupt)">· rev {rev.n}</span>
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

			<!-- What this write deleted, in the same list it deleted them from. A
			     minus and a strikethrough say it; a caption would only repeat them. -->
			{#each rev.dropped as d (d)}
				<p
					class="flex items-baseline gap-1.5 px-1 text-xs leading-relaxed"
					{@attach tip('Removed by this write_todos, unfinished')}
				>
					<span class="shrink-0" style:color="var(--hx-interrupt)">−</span>
					<span class="min-w-0 text-muted-foreground/70 line-through">{d}</span>
				</p>
			{/each}
			{#each rev.retired as d (d)}
				<p
					class="flex items-baseline gap-1.5 px-1 text-xs leading-relaxed"
					{@attach tip('Removed by this write_todos, after completing')}
				>
					<span class="shrink-0 text-muted-foreground/40">−</span>
					<span class="min-w-0 text-muted-foreground/50 line-through">{d}</span>
				</p>
			{/each}

			{#if track.dropped.length}
				<!-- The failure the channel's semantics make easy, and the only thing
				     in the app that can catch it: an item that left the list without
				     ever being finished. The heading names it; the tooltip explains it
				     to whoever wants that, and nobody else has to read it. -->
				<div
					class="hx-rule mt-3 rounded border px-2 py-1.5"
					style:border-color="color-mix(in oklab, var(--hx-interrupt) 40%, transparent)"
				>
					<p
						class="hx-eyebrow mb-1"
						style:color="var(--hx-interrupt)"
						{@attach tip(
							'write_todos replaces the whole list, so a call that omits an item deletes it — with no warning anywhere'
						)}
					>
						left unfinished · {track.dropped.length}
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
				</div>
			{/if}
		{/if}
	</div>
</div>
