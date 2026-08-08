<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { fileType } from '$lib/xray/filetype';
	import { bytes as fmtBytes } from '$lib/xray/format';
	import { subagentIcon } from '$lib/agent/subagent-meta';
	import { isEvicted, EVICT_HELP } from '$lib/agent/eviction';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { tip } from '$lib/hooks/tip';

	/**
	 * The filesystem as an edit log, newest first.
	 *
	 * The tree answers "what exists", organised the way the agent organised it,
	 * and it is the wrong shape while a run is going: a new file lands wherever
	 * the alphabet puts it, and a file rewritten three times looks exactly like
	 * one written once. This is the other question — what changed, when, and by
	 * whom — and it is a different view rather than a sort order, because it
	 * shows *writes*, not files. The same path appearing three times is the
	 * point, not a duplicate.
	 *
	 * Everything here comes from the log, so authorship is real: LangGraph's
	 * stream namespaces genuinely know which lane a write happened in, which is
	 * what makes "report-writer wrote this one" a fact rather than a guess.
	 *
	 * Order carries the time and no clock is printed, which is deliberate. Event
	 * timestamps are `performance.now()` at emit, so a thread restored from
	 * storage mixes stamps from several page sessions against different origins:
	 * printed in a column they run 4:29, 2:19, 3:53 down a list that is in
	 * perfectly correct order, and the reader believes the numbers over the
	 * order. Sequence survives a reload; the clock does not.
	 */
	interface Props {
		active: string | null;
		onselect: (path: string) => void;
	}
	let { active, onselect }: Props = $props();

	interface Write {
		id: string;
		t: number;
		path: string;
		bytes: number;
		/** `main`, or the subagent whose lane it happened in. */
		who: string;
		/** What kind of write — the agent's own, or something arriving. */
		how: 'write' | 'edit' | 'delete' | 'upload' | 'image' | 'figure';
	}

	const writes = $derived.by(() => {
		void bus.version;
		const out: Write[] = [];
		for (const e of bus.events) {
			const who = e.scope === 'main' ? 'main' : (e.lane ?? e.scope.slice(4).split(':')[0]);
			if (e.kind === 'fs_write')
				out.push({ id: e.id, t: e.t, path: e.path, bytes: e.bytes, who, how: e.op });
			else if (e.kind === 'upload')
				out.push({ id: e.id, t: e.t, path: e.path, bytes: e.bytes, who, how: 'upload' });
			else if (e.kind === 'image_done')
				out.push({ id: e.id, t: e.t, path: e.path, bytes: e.bytes, who, how: 'image' });
			else if (e.kind === 'figure_extracted')
				out.push({ id: e.id, t: e.t, path: e.path, bytes: e.bytes, who, how: 'figure' });
		}
		return out.reverse();
	});

	/**
	 * The verb, as a word.
	 *
	 * It was a second icon on the row, which put the same glyph twice in 24px of
	 * height meaning two different things: a `.png` that was extracted drew the
	 * image icon for "this is an image" and again for "extracting is what
	 * happened". A word cannot collide with a picture. `write` is the default
	 * reading and gets nothing, so only the interesting rows carry a mark.
	 */
	const VERB: Record<Write['how'], string> = {
		write: '',
		edit: 'edited',
		delete: 'deleted',
		upload: 'uploaded',
		image: 'generated',
		figure: 'extracted'
	};
</script>

{#if !writes.length}
	<p class="px-3 py-3 text-xs text-muted-foreground">
		Nothing written yet. Every file the run creates lands here in order.
	</p>
{:else}
	{#each writes as w (w.id)}
		{@const type = fileType(w.path)}
		<button
			class="flex w-full items-center gap-2 px-3 py-[5px] text-left transition-colors
			       hover:bg-muted/60"
			class:bg-muted={w.path === active}
			onclick={() => onselect(w.path)}
		>
			<span class="shrink-0" style:color={type.color}>
				<HugeiconsIcon icon={type.icon} size={12} strokeWidth={1.5} />
			</span>
			<span class="min-w-0 flex-1 truncate font-mono text-[11px]">
				{w.path}
			</span>
			{#if isEvicted(w.path)}
				<!-- Not the agent writing a file: the harness parking an oversized
				     tool result and handing back a pointer. -->
				<span
					class="hx-eyebrow shrink-0 text-[8.5px]"
					style:color="var(--hx-interrupt)"
					{@attach tip(EVICT_HELP)}
				>
					evicted
				</span>
			{:else if w.who !== 'main'}
				<!-- Who wrote it. Only worth a mark when it was not the parent — the
				     parent is the default reading and would be noise on every row. -->
				<span
					class="flex shrink-0 items-center gap-1"
					style:color="var(--hx-subagent)"
					{@attach tip(`written inside ${w.who}'s own run`)}
				>
					<HugeiconsIcon icon={subagentIcon(w.who)} size={10} strokeWidth={1.5} />
					<span class="hx-eyebrow text-[8.5px]">{w.who}</span>
				</span>
			{/if}
			{#if VERB[w.how]}
				<span class="hx-eyebrow shrink-0 text-[8.5px] text-muted-foreground/50">
					{VERB[w.how]}
				</span>
			{/if}
			<span class="hx-num w-11 shrink-0 text-right text-[9.5px] text-muted-foreground/60">
				{fmtBytes(w.bytes)}
			</span>
		</button>
	{/each}
{/if}
