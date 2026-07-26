<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { keys } from '$lib/state/keys.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { MODELS } from '$lib/agent/models';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { factoryReset, storageUsage } from '$lib/storage/reset';

	let usage = $state('—');
	let resetting = $state(false);
	let confirmReset = $state(false);
	let alsoKey = $state(false);

	$effect(() => {
		if (open) storageUsage().then((u) => (usage = u.label));
	});

	async function doReset() {
		resetting = true;
		await factoryReset({ includeKey: alsoKey });
		// A reload is the honest way to finish: half the state lives in modules
		// that were built from the data we just deleted.
		location.reload();
	}

	/** Tools worth gating — the ones with cost or side effects. */
	const GATEABLE = ['generate_image', 'fetch_paper', 'search_papers', 'write_file', 'edit_file'];
	/** Gating these is unsafe: they run inside parallel subagents. */
	const PARALLEL_RISKY = new Set(['fetch_paper', 'search_papers']);

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let draft = $state('');
	let revealed = $state(false);

	$effect(() => {
		if (open) draft = keys.value;
	});

	async function save() {
		keys.set(draft);
		if (keys.present) await keys.verify();
	}

	const STATUS_COLOR: Record<string, string> = {
		valid: 'var(--hx-state)',
		rejected: 'var(--hx-error)',
		checking: 'var(--muted-foreground)'
	};
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full sm:max-w-md">
		<Sheet.Header class="px-5 pt-5">
			<Sheet.Title class="text-sm font-semibold">Settings</Sheet.Title>
		</Sheet.Header>

		<div class="space-y-8 overflow-y-auto px-5 py-6">
			<!-- Connection -->
			<section>
				<p class="hx-eyebrow mb-3 flex items-center gap-1.5">
					<HugeiconsIcon icon={ICON.key} size={12} strokeWidth={1.5} />
					connection
				</p>
				{#if keys.fromEnv}
					<p class="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
						<HugeiconsIcon icon={ICON.code} size={12} strokeWidth={1.5} />
						Loaded from <span class="font-mono">.env</span> — development only, never bundled.
					</p>
				{/if}

				<label class="mb-1.5 block text-xs text-muted-foreground" for="hx-key">
					OpenAI API key
				</label>
				<div class="flex gap-2">
					<input
						id="hx-key"
						type={revealed ? 'text' : 'password'}
						bind:value={draft}
						placeholder="sk-…"
						autocomplete="off"
						spellcheck="false"
						class="hx-rule min-w-0 flex-1 rounded-md border bg-transparent px-2.5 py-1.5
						       font-mono text-xs focus:border-ring focus:outline-none"
					/>
					<button
						class="px-1 text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => (revealed = !revealed)}
						title={revealed ? 'Hide key' : 'Show key'}
						aria-label={revealed ? 'Hide key' : 'Show key'}
					>
						<HugeiconsIcon icon={revealed ? ICON.hide : ICON.show} size={15} strokeWidth={1.5} />
					</button>
				</div>

				<div class="mt-2.5 flex items-center gap-3">
					<button
						onclick={save}
						disabled={!draft.trim() || keys.status === 'checking'}
						class="hx-rule rounded-md border px-2.5 py-1 text-xs transition-colors
						       hover:bg-muted disabled:opacity-40"
					>
						{keys.status === 'checking' ? 'checking…' : 'Save & test'}
					</button>
					{#if keys.present}
						<button
							class="hx-eyebrow flex items-center gap-1 transition-colors hover:text-foreground"
							onclick={() => {
								keys.clear();
								draft = '';
							}}
						>
							<HugeiconsIcon icon={ICON.clear} size={12} strokeWidth={1.5} />
							clear
						</button>
					{/if}
					{#if keys.message}
						<span
							class="flex items-center gap-1 text-[11px]"
							style:color={STATUS_COLOR[keys.status]}
						>
							{#if keys.status === 'valid'}
								<HugeiconsIcon icon={ICON.ok} size={12} strokeWidth={1.5} />
							{:else if keys.status === 'rejected'}
								<HugeiconsIcon icon={ICON.alert} size={12} strokeWidth={1.5} />
							{/if}
							{keys.message}
						</span>
					{/if}
				</div>

				<label class="mt-4 flex items-start gap-2.5 text-[11px] text-muted-foreground">
					<Checkbox
						checked={keys.persist}
						onCheckedChange={(v) => keys.setPersist(v === true)}
						class="mt-0.5"
					/>
					<span>
						Remember on this device.
						<span class="block text-muted-foreground/70">
							Off by default — the key lives in this tab only and is gone when you close it.
						</span>
					</span>
				</label>

				<p class="mt-4 text-[11px] leading-relaxed text-muted-foreground/80">
					This app has no server, so the key is sent from this page directly to
					api.openai.com and never anywhere else. It is redacted everywhere in the X-ray. Use a
					dedicated project key with a spend cap.
				</p>
			</section>

			<!-- Model -->
			<section>
				<p class="hx-eyebrow mb-3 flex items-center gap-1.5"><HugeiconsIcon icon={ICON.model} size={12} strokeWidth={1.5} />model</p>
				<div class="space-y-px">
					{#each MODELS as m (m.id)}
						<button
							class="flex w-full items-baseline gap-2.5 rounded-md px-2 py-1.5 text-left
							       transition-colors hover:bg-muted"
							class:bg-muted={session.model === m.id}
							onclick={() => (session.model = m.id)}
						>
							<span
								class="inline-block h-1.5 w-1.5 rounded-full"
								style:background={session.model === m.id ? 'var(--hx-model)' : 'var(--border)'}
							></span>
							<span class="font-mono text-xs">{m.id}</span>
							<span class="ml-auto text-[10px] text-muted-foreground">{m.blurb}</span>
						</button>
					{/each}
				</div>
			</section>

			<!-- Approvals -->
			<section>
				<p class="hx-eyebrow mb-3 flex items-center gap-1.5">
					<HugeiconsIcon icon={ICON.pause} size={12} strokeWidth={1.5} />
					pause for approval
				</p>
				<div class="space-y-px">
					{#each GATEABLE as t (t)}
						<label
							class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left
							       transition-colors hover:bg-muted/60"
						>
							<Checkbox
								checked={session.interruptOn[t] ?? false}
								onCheckedChange={(v) =>
									(session.interruptOn = { ...session.interruptOn, [t]: v === true })}
							/>
							<span class="font-mono text-xs">{t}</span>
							{#if PARALLEL_RISKY.has(t)}
								<span
									class="hx-eyebrow ml-auto opacity-60"
									title="Runs inside parallel subagents — concurrent interrupts are unsupported"
								>
									unsafe
								</span>
							{/if}
						</label>
					{/each}
				</div>
				<p class="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
					A gated tool calls interrupt() before running, which stops the graph mid-node. Changing
					this rebuilds the agent.
				</p>
			</section>

			<!-- Storage -->
			<section>
				<p class="hx-eyebrow mb-3 flex items-center gap-1.5">
					<HugeiconsIcon icon={ICON.memory} size={12} strokeWidth={1.5} />
					storage
				</p>

				<dl class="mb-3 space-y-1 text-[11px]">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">chats</dt>
						<dd class="hx-num">{session.threads.length}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">on disk</dt>
						<dd class="hx-num">{usage}</dd>
					</div>
				</dl>

				<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground/80">
					Chats, checkpoints, long-term memory, generated figures, cached PDFs and searches all
					live in this browser. A reset removes every one of them.
				</p>

				{#if !confirmReset}
					<button
						onclick={() => (confirmReset = true)}
						class="rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
						style:border-color="color-mix(in oklab, var(--hx-error) 40%, transparent)"
						style:color="var(--hx-error)"
					>
						Reset everything…
					</button>
				{:else}
					<div
						class="rounded-md border p-2.5"
						style:border-color="color-mix(in oklab, var(--hx-error) 45%, transparent)"
					>
						<p class="mb-2 text-[11px]">This cannot be undone.</p>
						<label class="mb-2.5 flex items-center gap-2 text-[11px] text-muted-foreground">
							<Checkbox checked={alsoKey} onCheckedChange={(v) => (alsoKey = v === true)} />
							Also forget my API key
						</label>
						<div class="flex items-center gap-2">
							<button
								onclick={doReset}
								disabled={resetting}
								class="rounded px-2.5 py-1 text-xs text-background disabled:opacity-50"
								style:background="var(--hx-error)"
							>
								{resetting ? 'clearing…' : 'Erase and reload'}
							</button>
							<button
								class="hx-eyebrow transition-colors hover:text-foreground"
								onclick={() => (confirmReset = false)}
							>
								cancel
							</button>
						</div>
					</div>
				{/if}
			</section>
		</div>
	</Sheet.Content>
</Sheet.Root>
