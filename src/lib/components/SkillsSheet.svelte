<script lang="ts">
	import {
		skills,
		composeSkill,
		readFrontmatter,
		validateName,
		type Skill
	} from '$lib/agent/skills.svelte';
	import { makeModel } from '$lib/agent/models';
	import { session } from '$lib/agent/session.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	/**
	 * The skill library.
	 *
	 * A skill is a markdown file with two lines of frontmatter, and this panel is
	 * deliberately shaped to make that obvious rather than to hide it — you edit
	 * the file, not a form. The interesting number is at the bottom: what the
	 * whole library costs in the prompt versus what it would cost if the files
	 * were pasted in. That ratio is the entire argument for progressive
	 * disclosure, and it is better shown than explained.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	type View = 'list' | 'edit';
	let view = $state<View>('list');
	let draft = $state('');
	let error = $state('');
	let idea = $state('');
	let generating = $state(false);

	const listedChars = $derived(
		skills.active.reduce((n, s) => n + s.name.length + s.description.length + 40, 0)
	);
	const fullChars = $derived(skills.active.reduce((n, s) => n + s.body.length, 0));

	function newSkill() {
		draft = composeSkill(
			'my-skill',
			'What it does, and when to reach for it. This line is the only part always in context.',
			'# My skill\n\n1. First step.\n2. Second step.\n\n## Do not\n\n- The failure mode you already know about.'
		);
		error = '';
		view = 'edit';
	}

	function editSkill(s: Skill) {
		draft = s.body;
		error = '';
		view = 'edit';
	}

	function save() {
		error = skills.add(draft);
		if (!error) view = 'list';
	}

	/**
	 * Generate one with the model.
	 *
	 * This is the `skill-creator` skill being used the way any skill is used: its
	 * instructions become the prompt. Nothing here is a special code path — the
	 * built-in file is read out of the library and handed over as guidance, which
	 * is exactly what the agent itself would do with it.
	 */
	async function generate() {
		const want = idea.trim();
		if (!want || generating) return;
		generating = true;
		error = '';
		try {
			const guide = skills.all.find((s) => s.name === 'skill-creator')?.body ?? '';
			const llm = makeModel(bus, { model: session.model, streaming: false });
			const reply = await llm.invoke([
				{
					role: 'user',
					content:
						`${guide}\n\n---\n\nFollowing the guidance above, write one SKILL.md for this:\n\n${want}\n\n` +
						`Reply with the file and nothing else — no code fence, no commentary. ` +
						`Start at the opening --- of the frontmatter.`
				}
			]);
			const raw = typeof reply.content === 'string' ? reply.content : JSON.stringify(reply.content);
			draft = raw.replace(/^```[a-z]*\n?|\n?```$/g, '').trim() + '\n';
			idea = '';
			view = 'edit';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			generating = false;
		}
	}

	const preview = $derived(readFrontmatter(draft));
	const nameError = $derived(preview.name ? validateName(preview.name) : '');
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && open) {
			if (view === 'edit') view = 'list';
			else open = false;
		}
	}}
/>

{#if open}
	<div
		class="fixed inset-0 z-40 bg-background/70 backdrop-blur-[2px]"
		onclick={() => (open = false)}
		role="presentation"
	></div>

	<div
		class="hx-rule fixed inset-x-0 top-10 bottom-10 z-50 mx-auto flex max-w-[min(760px,94vw)]
		       flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
		role="dialog"
		aria-modal="true"
		aria-label="Skills"
	>
		<div class="hx-rule flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
			<HugeiconsIcon icon={ICON.skill} size={14} strokeWidth={1.5} />
			<h2 class="text-sm font-semibold">Skills</h2>
			<span class="hx-eyebrow">{skills.active.length} loaded</span>

			<div class="ml-auto flex items-center gap-3">
				{#if view === 'edit'}
					<button
						class="hx-eyebrow transition-colors hover:text-foreground"
						onclick={() => (view = 'list')}>cancel</button
					>
					<button
						class="hx-eyebrow text-foreground transition-colors hover:text-foreground"
						onclick={save}>save</button
					>
				{:else}
					<button
						class="hx-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
						onclick={newSkill}
					>
						<HugeiconsIcon icon={ICON.newChat} size={11} strokeWidth={1.5} />
						new
					</button>
				{/if}
				<button
					class="text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => (open = false)}
					aria-label="Close"
				>
					<HugeiconsIcon icon={ICON.close} size={15} strokeWidth={1.5} />
				</button>
			</div>
		</div>

		{#if view === 'list'}
			<div class="min-h-0 flex-1 overflow-y-auto">
				<p class="px-4 pt-4 pb-3 text-xs leading-relaxed text-muted-foreground">
					A skill is one markdown file at <code class="font-mono"
						>/skills/&lt;name&gt;/SKILL.md</code
					>
					in the agent's own filesystem. Only the name and description go into the prompt; the instructions
					are read on demand, with the same
					<code class="font-mono">read_file</code> it uses for anything else.
				</p>

				<!-- Generate. The model writes the file; you still review it. -->
				<div class="hx-rule mx-4 mb-4 rounded border p-2.5">
					<p class="hx-eyebrow mb-2 flex items-center gap-1.5">
						<HugeiconsIcon icon={ICON.generate} size={11} strokeWidth={1.5} />
						generate one
					</p>
					<div class="flex items-center gap-2">
						<input
							bind:value={idea}
							onkeydown={(e) => e.key === 'Enter' && generate()}
							disabled={generating}
							placeholder="what should it know how to do?"
							class="hx-bare min-w-0 flex-1 border-0 bg-transparent p-0 text-xs
							       placeholder:text-muted-foreground/60 focus:ring-0 focus:outline-none"
						/>
						<button
							class="hx-eyebrow shrink-0 transition-colors hover:text-foreground disabled:opacity-30"
							onclick={generate}
							disabled={!idea.trim() || generating}
						>
							{generating ? 'writing…' : 'write it'}
						</button>
					</div>
				</div>

				{#if error}
					<p class="px-4 pb-2 text-xs" style:color="var(--hx-error)">{error}</p>
				{/if}

				{#each skills.all as s (s.name)}
					<div
						class="hx-rule group flex items-start gap-3 border-t px-4 py-2.5 transition-colors
						       hover:bg-muted/40"
						class:opacity-45={!s.enabled}
					>
						<button
							class="mt-[3px] shrink-0"
							onclick={() => skills.toggle(s.name)}
							aria-label={s.enabled ? `Disable ${s.name}` : `Enable ${s.name}`}
							title={s.enabled ? 'Loaded — click to unload' : 'Not loaded'}
						>
							<span
								class="block size-2.5 rounded-[2px] border"
								style:background={s.enabled ? 'var(--hx-tool)' : 'transparent'}
								style:border-color={s.enabled ? 'var(--hx-tool)' : 'var(--border)'}
							></span>
						</button>

						<div class="min-w-0 flex-1">
							<p class="flex items-baseline gap-2">
								<span class="font-mono text-xs">{s.name}</span>
								{#if s.builtin}<span class="hx-eyebrow text-[9px]">built in</span>{/if}
							</p>
							<p class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
								{s.description}
							</p>
						</div>

						<div class="flex shrink-0 items-center gap-2 opacity-0 group-hover:opacity-100">
							<button
								class="hx-eyebrow transition-colors hover:text-foreground"
								onclick={() => editSkill(s)}
							>
								{s.builtin ? 'read' : 'edit'}
							</button>
							{#if !s.builtin}
								<button
									class="text-muted-foreground/70 transition-colors hover:text-[var(--hx-error)]"
									onclick={() => skills.remove(s.name)}
									aria-label="Delete {s.name}"
								>
									<HugeiconsIcon icon={ICON.clear} size={12} strokeWidth={1.5} />
								</button>
							{/if}
						</div>
					</div>
				{/each}

				<p
					class="hx-rule mt-4 border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground"
				>
					These {skills.active.length} skills cost about
					<span class="hx-num text-foreground">{Math.round(listedChars / 4).toLocaleString()}</span>
					tokens in every request — names and descriptions only. Pasting the files in instead would cost
					<span class="hx-num">{Math.round(fullChars / 4).toLocaleString()}</span>. That gap is the
					whole idea: the library can grow without the context growing with it.
				</p>
			</div>
		{:else}
			<div class="flex min-h-0 flex-1 flex-col">
				<div class="hx-rule flex shrink-0 items-baseline gap-2 border-b px-4 py-2">
					<span class="font-mono text-xs">{preview.name || '(no name)'}</span>
					{#if nameError}
						<span class="text-[10px]" style:color="var(--hx-error)">{nameError}</span>
					{:else}
						<span class="hx-eyebrow">/skills/{preview.name}/SKILL.md</span>
					{/if}
					<span class="hx-num ml-auto text-[10px] text-muted-foreground">
						~{Math.round(draft.length / 4).toLocaleString()} tokens when read
					</span>
				</div>

				{#if error}
					<p class="px-4 pt-2 text-xs" style:color="var(--hx-error)">{error}</p>
				{/if}

				<textarea
					bind:value={draft}
					spellcheck="false"
					class="hx-bare min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-3 font-mono
					       text-[11px] leading-relaxed focus:ring-0 focus:outline-none"></textarea>
			</div>
		{/if}
	</div>
{/if}
