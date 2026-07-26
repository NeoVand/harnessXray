<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import ActivityStrip from './ActivityStrip.svelte';
	import Markdown from '../Markdown.svelte';
	import ApprovalCard from './ApprovalCard.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { assets, assetVersion } from '$lib/storage/assets.svelte';

	let {
		onopensettings,
		onread,
		/** Bumped from outside to jump to the latest message. */
		jump = 0
	}: { onopensettings: () => void; onread?: (path: string) => void; jump?: number } = $props();

	let viewport = $state<HTMLElement | null>(null);
	let pinned = $state(true);

	$effect(() => {
		// Re-run as text streams in, not only when a message is added.
		void session.messages.length;
		void session.messages.at(-1)?.text;
		if (pinned && viewport) viewport.scrollTop = viewport.scrollHeight;
	});

	$effect(() => {
		if (!jump || !viewport) return;
		pinned = true;
		viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
	});

	// Attachment thumbnails come from the asset store, which fills in
	// asynchronously — re-read when it changes or an image chip stays blank.
	const ATTACH_ICON: Record<string, typeof ICON.file> = {
		text: ICON.file,
		pdf: ICON.file,
		image: ICON.image
	};
	const ATTACH_COLOR: Record<string, string> = {
		text: 'var(--hx-fs)',
		pdf: 'var(--hx-memory)',
		image: 'var(--hx-tool)'
	};

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
			Who said what, told twice over: by the label, and by the ground.

			The shade wraps the words only, and hugs them — the label sits outside
			it, unshaded, so what is tinted is the utterance rather than the whole
			row. The agent's replies stay on the page: they are the document, and
			shading both sides would just be stripes.
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
				<article class="group pt-3 pb-4">
					<div class="mx-auto w-full max-w-[68ch] px-6">
						<p class="hx-eyebrow mb-1 flex items-center gap-1.5 leading-none">
							<HugeiconsIcon icon={ICON.message} size={11} strokeWidth={1.5} />
							you
							<!--
								Icons, not sentences.

								Rewinding is one idea, so it gets one glyph, and the same glyph
								in both states: it opens the editor, and it commits. The
								explanation lives in the tooltip, where it costs nothing until
								you want it — a permanent caption reading "everything after this
								is rewound" said the same thing on every turn forever.
							-->
							{#if !session.busy}
								<span class="ml-auto flex items-center gap-0.5">
									{#if editing === m.id}
										<button
											class="grid size-6 place-items-center rounded-[3px] transition-colors
											       hover:bg-background hover:text-foreground"
											onclick={() => (editing = null)}
											title="Cancel (Esc)"
											aria-label="Cancel editing"
										>
											<HugeiconsIcon icon={ICON.close} size={13} strokeWidth={1.5} />
										</button>
										<button
											class="grid size-6 place-items-center rounded-[3px] transition-colors
											       hover:bg-background"
											style:color="var(--hx-interrupt)"
											onclick={() => resend(m.id)}
											title="Re-run from here — everything after this turn is rewound (↵)"
											aria-label="Re-run from here"
										>
											<HugeiconsIcon icon={ICON.rewind} size={13} strokeWidth={1.5} />
										</button>
									{:else}
										<button
											class="grid size-6 place-items-center rounded-[3px] opacity-0 transition-all
											       group-hover:opacity-100 hover:bg-background hover:text-foreground"
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
								class="hx-rule w-full resize-none rounded-[3px] border bg-background p-2 text-sm
								       leading-relaxed focus:ring-0 focus:outline-none"
								rows="3"></textarea>
						{:else if m.text}
							<!-- The shade wraps the words, not the row. Sized to its content
							     so a one-line question is a small object rather than a full
							     bar of colour, and left-aligned so the transcript still reads
							     as one column rather than a back-and-forth. -->
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
												style:background="color-mix(in oklab, {ATTACH_COLOR[a.kind]} 12%, transparent)"
												style:color={ATTACH_COLOR[a.kind]}
											>
												<HugeiconsIcon icon={ATTACH_ICON[a.kind]} size={14} strokeWidth={1.5} />
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
