<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import ActivityStrip from './ActivityStrip.svelte';
	import Markdown from '../Markdown.svelte';
	import ApprovalCard from './ApprovalCard.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { assets, assetVersion } from '$lib/storage/assets.svelte';
	import { attachmentType } from '$lib/xray/filetype';

	let { onopensettings, onread }: { onopensettings: () => void; onread?: (path: string) => void } =
		$props();

	let viewport = $state<HTMLElement | null>(null);
	let pinned = $state(true);

	$effect(() => {
		// Re-run as text streams in, not only when a message is added.
		void session.messages.length;
		void session.messages.at(-1)?.text;
		if (pinned && viewport) viewport.scrollTop = viewport.scrollHeight;
	});

	function onScroll() {
		if (!viewport) return;
		pinned = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
	}

	/** Which message is open for editing, and its working copy. */
	let editing = $state<string | null>(null);
	let draft = $state('');

	async function resend(id: string) {
		const text = draft;
		editing = null;
		await session.editAndResend(id, text);
	}

	const SUGGESTIONS = [
		'What tools do you have, and what is in your system prompt?',
		'Count the words in the first paragraph of Moby-Dick.',
		'Plan a three-section review of retrieval-augmented generation.'
	];
</script>

<div bind:this={viewport} onscroll={onScroll} class="min-h-0 flex-1 overflow-y-auto">
	<!--
		The scroller is full width; the *column* is what is 68ch.

		Each turn re-establishes the column itself rather than inheriting one
		wrapper, which is what lets a turn decide how far its own decoration
		reaches while its text stays on measure.
	-->
	<div class="w-full py-3">
		{#if session.messages.length === 0}
			<div class="mx-auto w-full max-w-[68ch] px-6 pt-10">
				<p class="hx-eyebrow mb-3">the harness, live</p>
				<p class="max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
					Everything this agent does is dissected on the right — the literal request body, every raw
					stream frame, the graph it runs on.
				</p>

				{#if !keys.present}
					<button
						onclick={onopensettings}
						class="hx-rule mt-5 flex items-center gap-2 rounded-md border px-3 py-2 text-xs
						       transition-colors hover:bg-muted"
					>
						<HugeiconsIcon icon={ICON.key} size={13} strokeWidth={1.5} />
						Add an OpenAI key to begin
						<HugeiconsIcon icon={ICON.next} size={13} strokeWidth={1.5} />
					</button>
					<p class="mt-3 max-w-[46ch] text-[11px] leading-relaxed text-muted-foreground/80">
						There is no server here. Your key is held in this tab and sent only to api.openai.com.
						You can still open the <span class="font-mono">graph</span> tab without one.
					</p>
				{:else}
					<ul class="mt-5 space-y-1.5">
						{#each SUGGESTIONS as s (s)}
							<li>
								<button
									class="group flex items-start gap-2 text-left text-xs text-muted-foreground
									       transition-colors hover:text-foreground"
									onclick={() => session.send(s)}
								>
									<span
										class="translate-y-[3px] opacity-40 transition-opacity group-hover:opacity-100"
									>
										<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} />
									</span>
									{s}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!--
			Who said what, told three ways: side, label, and ground.

			Side does most of the work — your turns sit right, the agent's left —
			because it survives skimming in a way a 10px caption does not. The tint
			wraps only your words and hugs them; the agent's replies stay on the
			page, because they are the document and shading both sides would just
			be stripes.
		-->
		{#each session.messages as m (m.id)}
			{#if m.role === 'notice'}
				<!-- Something that happened *to* the conversation rather than in it.
				     A rule with a label, so it reads as a seam in the transcript and
				     is not mistaken for either party speaking. -->
				<div class="mx-auto w-full max-w-[68ch] px-6 py-4">
					<div class="flex items-center gap-2">
						<span class="hx-rule h-px flex-1 border-t"></span>
						<span class="hx-eyebrow flex items-center gap-1.5" style:color="var(--hx-memory)">
							<HugeiconsIcon icon={ICON.compact} size={11} strokeWidth={1.5} />
							compacted
						</span>
						<span class="hx-rule h-px flex-1 border-t"></span>
					</div>
					<p class="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
						{m.text}
						{#if m.noticePath}
							<button
								class="ml-1 underline underline-offset-2 transition-colors hover:text-foreground"
								onclick={() => m.noticePath && onread?.(m.noticePath)}
							>
								read the transcript
							</button>
						{/if}
					</p>
				</div>
			{:else if m.role === 'user'}
				<!--
					Your turns hang off the right, the agent's off the left.

					Side is the fastest cue there is — faster than a label, and it
					survives skimming, which is the point when a transcript is mostly
					long agent prose. The bubble hugs its text, so a short question
					stays a small object on that side rather than a full-width bar.
				-->
				<article class="group pt-3 pb-4">
					<div class="mx-auto flex w-full max-w-[68ch] flex-col items-end px-6">
						<p class="hx-eyebrow mb-1 flex items-center gap-1.5 leading-none">
							you
							<HugeiconsIcon icon={ICON.message} size={11} strokeWidth={1.5} />
						</p>

						{#if editing === m.id}
							<textarea
								bind:value={draft}
								onkeydown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										resend(m.id);
									}
									if (e.key === 'Escape') editing = null;
								}}
								class="hx-rule hx-field w-full resize-none rounded-lg border bg-background p-2.5
								       text-sm leading-relaxed"
								rows="3"></textarea>
						{:else if m.text}
							<p
								class="turn-you w-fit max-w-full rounded-lg px-3 py-2 text-sm
							          leading-relaxed whitespace-pre-wrap"
							>
								{m.text}
							</p>
						{/if}

						{#if m.attachments?.length}{@const _ = assetVersion.n}
							<!-- What you handed over, as objects rather than as a paragraph
						     describing objects. The chars figure is the honest unit: it is
						     what actually reached the agent, which for a PDF is not the
						     file size and for an image is nothing at all. -->
							<div class="mt-2 flex flex-wrap gap-2">
								<!-- Index-salted: upload paths are slugged from the filename with
							     no uniqueness salt, so attaching the same file twice — which
							     re-running an edited message makes likelier — would put a
							     duplicate key in a keyed each and throw during mount. -->
								{#each m.attachments as a, ai (a.path + ai)}
									<button
										class="hx-rule flex items-center gap-2 rounded border px-2.5 py-1.5 text-left
									       transition-colors hover:bg-muted/60"
										onclick={() => onread?.(a.path)}
										title={a.path}
									>
										{#if a.kind === 'image' && assets.peek(a.path)}
											<img
												src={assets.peek(a.path)?.dataUrl}
												alt=""
												class="hx-rule size-8 rounded-[2px] border object-cover"
											/>
										{:else}
											<span
												class="grid size-8 shrink-0 place-items-center rounded-[2px]"
												style:background="color-mix(in oklab, {attachmentType(a.kind).color} 12%, transparent)"
												style:color={attachmentType(a.kind).color}
											>
												<HugeiconsIcon
													icon={attachmentType(a.kind).icon}
													size={14}
													strokeWidth={1.5}
												/>
											</span>
										{/if}
										<span class="min-w-0">
											<span class="block max-w-[24ch] truncate font-mono text-[11px]">{a.name}</span
											>
											<span class="hx-eyebrow text-[9px]">
												{a.kind === 'image'
													? 'seen, not read'
													: `${a.chars.toLocaleString()} chars`}
											</span>
										</span>
									</button>
								{/each}
							</div>
						{/if}

						<!--
							Under the bubble, not beside the label.

							Rewinding acts on the message, so it belongs against the message
							rather than in the caption above it. One glyph in both states —
							it opens the editor and it commits — with the explanation in the
							tooltip, where it costs nothing until wanted.
						-->
						{#if !session.busy}
							<span class="mt-1 flex items-center gap-0.5">
								{#if editing === m.id}
									<button
										class="grid size-6 place-items-center rounded-[3px] text-muted-foreground
										       transition-colors hover:bg-muted hover:text-foreground"
										onclick={() => (editing = null)}
										title="Cancel (Esc)"
										aria-label="Cancel editing"
									>
										<HugeiconsIcon icon={ICON.close} size={13} strokeWidth={1.5} />
									</button>
									<button
										class="grid size-6 place-items-center rounded-[3px] transition-colors
										       hover:bg-muted"
										style:color="var(--hx-interrupt)"
										onclick={() => resend(m.id)}
										title="Re-run from here — everything after this turn is rewound (↵)"
										aria-label="Re-run from here"
									>
										<HugeiconsIcon icon={ICON.rewind} size={13} strokeWidth={1.5} />
									</button>
								{:else}
									<button
										class="grid size-6 place-items-center rounded-[3px] text-muted-foreground
										       opacity-0 transition-all group-hover:opacity-100 hover:bg-muted
										       hover:text-foreground focus-visible:opacity-100"
										onclick={() => {
											editing = m.id;
											draft = m.text;
										}}
										title="Edit this message and re-run from here"
										aria-label="Edit and re-run from here"
									>
										<HugeiconsIcon icon={ICON.rewind} size={13} strokeWidth={1.5} />
									</button>
								{/if}
							</span>
						{/if}
					</div>
				</article>
			{:else}
				<article class="pt-3 pb-4">
					<div class="mx-auto w-full max-w-[68ch] px-6">
						<p
							class="hx-eyebrow mb-1 flex items-center gap-1.5 leading-none"
							style:color="var(--hx-model)"
						>
							<HugeiconsIcon icon={ICON.agent} size={11} strokeWidth={1.5} />
							agent
						</p>
						<ActivityStrip calls={m.toolCalls} streaming={!!m.streaming} />
						{#if m.text}
							<Markdown source={m.text} onopen={onread} />
						{/if}
						{#if m.streaming}
							<span class="caret" aria-label="streaming"></span>
						{/if}
					</div>
				</article>
			{/if}
		{/each}

		<div class="mx-auto w-full max-w-[68ch] px-6 pt-2">
			<ApprovalCard />

			{#if session.error}
				<p
					class="hx-rule rounded-md border px-3 py-2 text-xs"
					style:color="var(--hx-error)"
					style:border-color="color-mix(in oklab, var(--hx-error) 35%, transparent)"
				>
					{session.error}
				</p>
			{/if}
		</div>
	</div>
</div>

<style>
	/*
		Barely a colour.

		Mixed from `--muted` so it tracks the theme rather than being two hardcoded
		greys. Dark gets *less* of it, not more: on a near-black background the
		same proportion that reads as a whisper on white reads as a raised panel,
		and the point is to separate the turn, not to announce it.
	*/
	.turn-you {
		background: color-mix(in oklab, var(--muted) 55%, transparent);
	}
	:global(.dark) .turn-you {
		background: color-mix(in oklab, var(--muted) 42%, transparent);
	}

	.caret {
		display: inline-block;
		width: 0.45rem;
		height: 0.95rem;
		translate: 0 0.15rem;
		background: var(--hx-model);
		animation: blink 1.1s step-end infinite;
	}
	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>
