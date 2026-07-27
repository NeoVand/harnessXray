<script lang="ts">
	import { session } from '$lib/agent/session.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import { replay } from '$lib/xray/replay.svelte';
	import { ingest } from '$lib/agent/uploads';
	import { skills } from '$lib/agent/skills.svelte';
	import { tutor } from '$lib/lab/tutor.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { attachmentType } from '$lib/xray/filetype';

	let { onopenskills }: { onopenskills?: () => void } = $props();

	let text = $state('');
	let el = $state<HTMLTextAreaElement | null>(null);
	let filePicker = $state<HTMLInputElement | null>(null);
	let imagePicker = $state<HTMLInputElement | null>(null);
	let error = $state('');
	let reading = $state(false);

	function grow() {
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = Math.min(el.scrollHeight, 180) + 'px';
	}

	async function submit() {
		const value = text.trim();
		// Explain mode reroutes the words to the lab tutor — never the agent's
		// thread. Attachments are agent-only, so a staged file keeps the normal
		// path (the hint above the chips says so).
		if (tutor.active && !session.attachments.length) {
			if (!value || tutor.busy) return;
			text = '';
			queueMicrotask(grow);
			await tutor.ask(value);
			return;
		}
		if ((!value && !session.attachments.length) || session.busy) return;
		text = '';
		queueMicrotask(grow);
		await session.send(value);
	}

	function onKeydown(e: KeyboardEvent) {
		// Enter sends; Shift+Enter is a newline. The usual contract.
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			submit();
		}
	}

	/**
	 * Files are ingested when they are picked, not when the message is sent.
	 *
	 * Extracting a PDF takes a second or two, and doing that work on submit
	 * would put a stall between pressing enter and anything happening. Doing it
	 * here also means the chip can say how much text actually came out — which
	 * is the honest unit for "what did the agent get", rather than the file size.
	 */
	async function take(list: FileList | null) {
		if (!list?.length) return;
		reading = true;
		error = '';
		for (const file of Array.from(list)) {
			try {
				session.attachments.push(await ingest(file));
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		}
		reading = false;
		// Reset both, so picking the same file twice in a row still fires change.
		if (filePicker) filePicker.value = '';
		if (imagePicker) imagePicker.value = '';
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		void take(e.dataTransfer?.files ?? null);
	}

	let dragging = $state(false);

	/**
	 * The next line of the fixture's script, when replaying.
	 *
	 * A fixture records the user's messages along with the wire. Offering the
	 * next one as a single click keeps the replayed run on the recorded path —
	 * where every request matches its recording by hash — while still leaving
	 * the composer free for going off-script.
	 */
	const nextScripted = $derived.by(() => {
		if (!replay.active || session.busy) return '';
		const sent = session.messages.filter((m) => m.role === 'user').length;
		return replay.fixture?.script[sent] ?? '';
	});
</script>

<!-- Frosted, because the conversation now scrolls beneath it — the tail of
     the transcript ghosting through the glass is the point. -->
<div
	class="hx-rule hx-frost shrink-0 border-t px-2.5 py-2.5"
	class:bg-muted={dragging}
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
	role="presentation"
>
	<!-- Chips and errors ride the same column as the text, and the empty spans
	     reserve the button slots so they line up with it rather than with the
	     bar's edge. The whole row is conditional: the spacers are 28px tall, so
	     leaving it mounted made the composer permanently that much taller for a
	     row that is empty almost all of the time. -->
	{#if error || session.attachments.length || reading}
		<div class="flex gap-1.5">
			<span class="size-7 shrink-0" aria-hidden="true"></span>
			<div class="mx-auto w-full max-w-[68ch] min-w-0 flex-1">
				{#if error}
					<p class="mb-2 text-[11px]" style:color="var(--hx-error)">{error}</p>
				{/if}

				{#if session.attachments.length || reading}
					<div class="mb-2 flex flex-wrap gap-1.5">
						{#each session.attachments as a, i (a.path + i)}
							<span
								class="hx-rule flex items-center gap-1.5 rounded border px-2 py-1 text-[10px]"
								title={a.path}
							>
								<span style:color={attachmentType(a.kind).color}>
									<HugeiconsIcon icon={attachmentType(a.kind).icon} size={11} strokeWidth={1.5} />
								</span>
								<span class="max-w-[18ch] truncate font-mono">{a.name}</span>
								<span class="hx-num text-muted-foreground">
									{a.kind === 'image' ? 'image' : `${(a.text.length / 1000).toFixed(1)}k chars`}
								</span>
								<button
									class="text-muted-foreground/60 transition-colors hover:text-[var(--hx-error)]"
									onclick={() => session.attachments.splice(i, 1)}
									aria-label="Remove {a.name}"
								>
									<HugeiconsIcon icon={ICON.close} size={10} strokeWidth={1.5} />
								</button>
							</span>
						{/each}
						{#if reading}
							<span class="hx-eyebrow self-center">reading…</span>
						{/if}
					</div>
					{#if tutor.active && session.attachments.length}
						<!-- Files can only mean one thing here: the agent. Saying so keeps
						     explain mode from silently swallowing an upload. -->
						<p class="hx-eyebrow mb-2" style:color="var(--hx-accent, var(--hx-state))">
							files go to the agent — this send runs the agent, not the lab
						</p>
					{/if}
				{/if}
			</div>
			<span class="size-7 shrink-0" aria-hidden="true"></span>
		</div>
	{/if}

	{#if nextScripted}
		<div class="flex gap-1.5 pb-2">
			<span class="size-7 shrink-0" aria-hidden="true"></span>
			<div class="mx-auto w-full max-w-[68ch] min-w-0 flex-1">
				<button
					class="hx-rule flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left
					       text-xs transition-colors hover:bg-muted"
					style:border-color="color-mix(in oklab, var(--hx-interrupt) 40%, transparent)"
					onclick={() => session.send(nextScripted)}
					title="Send the next message exactly as it was recorded"
				>
					<HugeiconsIcon icon={ICON.run} size={13} strokeWidth={1.5} />
					<span class="hx-eyebrow shrink-0" style:color="var(--hx-interrupt)">script</span>
					<span class="truncate">{nextScripted}</span>
				</button>
			</div>
			<span class="size-7 shrink-0" aria-hidden="true"></span>
		</div>
	{/if}

	{#if tutor.active && tutor.chips.length && !tutor.busy}
		<!-- Click-worthy questions about the instruments on screen, on the same
		     column and spacer pattern as the scripted-replay row. No label — the
		     glowing + is already the mode lamp, and an inline eyebrow shoved the
		     first chip out of line with every wrapped row. A used chip greys out
		     but stays: the row is a menu, not a queue. -->
		<div class="flex gap-1.5 pb-2">
			<span class="size-7 shrink-0" aria-hidden="true"></span>
			<div class="mx-auto w-full max-w-[68ch] min-w-0 flex-1">
				<div class="flex flex-wrap gap-1.5">
					{#each tutor.chips as chip (chip)}
						<button
							class="hx-rule rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground
							       transition-colors hover:bg-muted hover:text-foreground
							       disabled:pointer-events-none disabled:opacity-35"
							disabled={tutor.used.includes(chip)}
							onclick={() => tutor.ask(chip)}
							title="Ask the lab tutor"
						>
							{chip}
						</button>
					{/each}
				</div>
			</div>
			<span class="size-7 shrink-0" aria-hidden="true"></span>
		</div>
	{/if}

	<!-- The controls sit at the bar's ends, not on the text column. Padding is
	     kept tight so they read as anchored to the edges rather than floating. -->
	<div class="flex items-end gap-1.5">
		<!-- Two pickers rather than one, so each menu entry opens a dialog
			     already narrowed to what it promised. -->
		<input
			bind:this={filePicker}
			type="file"
			multiple
			accept=".pdf,.md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.tex,.bib,text/*"
			class="hidden"
			onchange={(e) => take(e.currentTarget.files)}
		/>
		<input
			bind:this={imagePicker}
			type="file"
			multiple
			accept="image/*"
			class="hidden"
			onchange={(e) => take(e.currentTarget.files)}
		/>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="grid size-7 shrink-0 place-items-center text-muted-foreground transition-colors
					       hover:text-foreground"
				title={tutor.active
					? 'Explain mode is on — questions go to the lab, not the agent'
					: 'Attach a file or manage skills'}
				aria-label="Add"
			>
				<!-- The quiet mode lamp: the + takes the lab's colour while questions
				     are being rerouted, so the composer never lies about who is
				     listening. -->
				<span style:color={tutor.active ? 'var(--hx-accent, var(--hx-state))' : undefined}>
					<HugeiconsIcon icon={ICON.newChat} size={16} strokeWidth={1.5} />
				</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="min-w-36">
				<DropdownMenu.Item onSelect={() => imagePicker?.click()}>
					<HugeiconsIcon icon={ICON.image} size={13} strokeWidth={1.5} />
					<span class="text-xs">Image</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => filePicker?.click()}>
					<HugeiconsIcon icon={ICON.file} size={13} strokeWidth={1.5} />
					<span class="text-xs">File</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => onopenskills?.()}>
					<HugeiconsIcon icon={ICON.skill} size={13} strokeWidth={1.5} />
					<span class="text-xs">Skills</span>
					<span class="hx-num ml-auto text-[10px] text-muted-foreground">
						{skills.active.length}
					</span>
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => tutor.toggle()}>
					<HugeiconsIcon icon={ICON.sparkle} size={13} strokeWidth={1.5} />
					<span class="text-xs">Explain</span>
					<span
						class="hx-num ml-auto text-[10px]"
						class:text-muted-foreground={!tutor.active}
						style:color={tutor.active ? 'var(--hx-accent, var(--hx-state))' : undefined}
					>
						{tutor.active ? 'on' : 'off'}
					</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- Auto margins hold the text on the same 68ch column as the
			     conversation while the buttons stay pinned to the bar's ends. -->
		<div class="mx-auto flex max-w-[68ch] min-w-0 flex-1">
			<textarea
				bind:this={el}
				bind:value={text}
				oninput={grow}
				onkeydown={onKeydown}
				rows="1"
				disabled={session.busy}
				placeholder={tutor.active && !session.attachments.length
					? 'Ask how this run worked…'
					: replay.active
						? 'Replaying — follow the script above, or type to go off it…'
						: keys.present
							? 'Ask the agent something…'
							: 'Add a key in settings to begin…'}
				class="hx-bare max-h-[180px] min-h-[24px] w-full resize-none border-0 bg-transparent p-0 text-sm
					       leading-relaxed placeholder:text-muted-foreground/60 focus:border-0 focus:ring-0
					       focus:outline-none disabled:opacity-50"></textarea>
		</div>

		{#if session.busy}
			<!-- While running, the same slot becomes stop. The spinner is the ring
				     itself so the control reads as "in progress, click to end" rather
				     than as a disabled send. -->
			<button
				onclick={() => session.stop()}
				class="relative grid size-7 shrink-0 place-items-center rounded-full text-foreground"
				title="Stop (Esc)"
				aria-label="Stop the agent"
			>
				<span class="ring" aria-hidden="true"></span>
				<span class="size-2 rounded-[2px] bg-foreground"></span>
			</button>
		{:else}
			<button
				onclick={submit}
				disabled={!text.trim() && !session.attachments.length}
				class="grid size-7 shrink-0 place-items-center text-muted-foreground transition-colors
					       hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
				title="Send (↵)"
				aria-label="Send message"
			>
				<HugeiconsIcon icon={ICON.send} size={16} strokeWidth={1.5} />
			</button>
		{/if}
	</div>
</div>

<style>
	/* A ring that sweeps rather than a spinner glyph, so the stop square stays
	   still and clickable while the motion happens around it. */
	.ring {
		position: absolute;
		inset: 0;
		border-radius: 9999px;
		border: 1.5px solid color-mix(in oklab, var(--hx-model) 25%, transparent);
		border-top-color: var(--hx-model);
		animation: hx-spin 0.9s linear infinite;
	}
	@keyframes hx-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
