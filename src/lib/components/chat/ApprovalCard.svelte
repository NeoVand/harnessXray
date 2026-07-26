<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { reviewFor, type Decision, type DecisionType } from '$lib/agent/hitl';
	import { toolMeta } from '$lib/agent/tool-meta';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import JsonCode from '../xray/JsonCode.svelte';

	/**
	 * The graph is stopped inside a node, waiting on this.
	 *
	 * Three decisions, not four — `approve | edit | reject` is the entire
	 * vocabulary the middleware accepts. Editing rewrites the tool call the model
	 * proposed *before* it executes, which is the part worth showing: the human
	 * is not answering the model, they are amending its action.
	 */
	const pending = $derived(session.pending);
	const actions = $derived(pending?.request.actionRequests ?? []);

	let editing = $state(false);
	let showArgs = $state(false);
	let draft = $state('');
	let rejectNote = $state('');
	let invalid = $state('');

	// Reset the form whenever a new pause arrives.
	$effect(() => {
		void pending?.id;
		editing = false;
		showArgs = false;
		rejectNote = '';
		invalid = '';
		draft = JSON.stringify(actions[0]?.args ?? {}, null, 2);
	});

	const allowed = $derived.by(() => {
		const first = actions[0];
		if (!pending || !first) return [] as DecisionType[];
		return reviewFor(pending.request, first.name)?.allowedDecisions ?? ['approve', 'reject'];
	});

	/** One line that says what is about to happen, without the full payload. */
	function argSummary(args: Record<string, unknown>): string {
		return Object.entries(args)
			.map(([k, v]) => {
				const s = typeof v === 'string' ? v : JSON.stringify(v);
				return `${k}: ${s.length > 60 ? s.slice(0, 60) + '…' : s}`;
			})
			.join('  ·  ');
	}

	function decide(decisions: Decision[]) {
		session.resume(decisions);
	}

	function approve() {
		decide(actions.map(() => ({ type: 'approve' })));
	}

	function reject() {
		decide(actions.map(() => ({ type: 'reject', message: rejectNote || undefined })));
	}

	function saveEdit() {
		try {
			const args = JSON.parse(draft);
			invalid = '';
			decide([{ type: 'edit', editedAction: { name: actions[0].name, args } }]);
		} catch (e) {
			// Never send unparseable args into a resume — the graph would take them
			// as the real call.
			invalid = e instanceof Error ? e.message : 'Invalid JSON';
		}
	}
</script>

{#if pending}
	<div
		class="my-3 rounded-md border p-3"
		style:border-color="color-mix(in oklab, var(--hx-interrupt) 45%, transparent)"
		style:background="color-mix(in oklab, var(--hx-interrupt) 6%, transparent)"
	>
		<p class="hx-eyebrow mb-2 flex items-center gap-1.5" style:color="var(--hx-interrupt)">
			<HugeiconsIcon icon={ICON.pause} size={12} strokeWidth={1.5} />
			paused — approval required
		</p>

		<!-- Index-salted. This list is merged across every interrupt in one
		     super-step, an ActionRequest carries no id, and two parallel calls to
		     the same tool with the same arguments are entirely ordinary — which
		     would collide on name+args and throw during mount. -->
		{#each actions as a, ai (a.name + JSON.stringify(a.args) + ai)}
			<div class="mb-2">
				<p class="flex items-baseline gap-1.5 font-mono text-[11px]">
					<HugeiconsIcon icon={toolMeta(a.name).icon} size={12} strokeWidth={1.5} />
					{a.name}
				</p>
				{#if a.description}
					<p class="mt-1 text-xs text-muted-foreground">{a.description}</p>
				{/if}
				{#if !editing}
					<!-- Collapsed by default: a fetch_paper or generate_image call can
					     carry hundreds of characters of arguments, and an approval that
					     fills the screen is one people stop reading. -->
					<button
						class="hx-eyebrow mt-1 flex items-center gap-1 transition-colors hover:text-foreground"
						onclick={() => (showArgs = !showArgs)}
					>
						<span
							class="inline-block transition-transform"
							style:transform={showArgs ? 'rotate(0deg)' : 'rotate(-90deg)'}
						>
							<HugeiconsIcon icon={ICON.expand} size={11} strokeWidth={1.5} />
						</span>
						{showArgs ? 'hide' : 'arguments'}
					</button>
					{#if showArgs}
						<div class="mt-1"><JsonCode source={JSON.stringify(a.args)} /></div>
					{:else}
						<p class="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
							{argSummary(a.args)}
						</p>
					{/if}
				{/if}
			</div>
		{/each}

		{#if editing}
			<textarea
				bind:value={draft}
				rows="6"
				spellcheck="false"
				class="hx-rule w-full rounded border bg-background p-2 font-mono text-[11px]
				       leading-relaxed focus:outline-none"></textarea>
			{#if invalid}
				<p class="mt-1 text-[10px]" style:color="var(--hx-error)">{invalid}</p>
			{/if}
		{/if}

		{#if allowed.includes('reject') && !editing}
			<input
				bind:value={rejectNote}
				placeholder="Optional: tell the model why, if you reject…"
				class="hx-rule mt-1 mb-2 w-full rounded border bg-transparent px-2 py-1 text-xs
				       placeholder:text-muted-foreground/50 focus:outline-none"
			/>
		{/if}

		<div class="mt-2 flex items-center gap-2">
			{#if editing}
				<button
					class="rounded px-2 py-1 text-xs text-background"
					style:background="var(--hx-interrupt)"
					onclick={saveEdit}
				>
					Run with edits
				</button>
				<button
					class="hx-eyebrow transition-colors hover:text-foreground"
					onclick={() => (editing = false)}
				>
					cancel
				</button>
			{:else}
				{#if allowed.includes('approve')}
					<button
						class="rounded px-2.5 py-1 text-xs text-background"
						style:background="var(--hx-interrupt)"
						onclick={approve}
					>
						Approve
					</button>
				{/if}
				{#if allowed.includes('edit')}
					<button
						class="hx-rule rounded border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
						onclick={() => (editing = true)}
					>
						Edit
					</button>
				{/if}
				{#if allowed.includes('reject')}
					<button
						class="hx-rule rounded border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
						onclick={reject}
					>
						Reject
					</button>
				{/if}
			{/if}

			<span class="hx-eyebrow ml-auto opacity-50">
				{allowed.join(' · ')}
			</span>
		</div>

		<p class="mt-2.5 text-[10px] leading-relaxed text-muted-foreground/70">
			The graph is stopped inside a node. Its state is checkpointed, so this survives a reload — the
			stream has already ended, and answering starts a new one.
		</p>
	</div>
{/if}
