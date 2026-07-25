<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import { keys } from '$lib/state/keys.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { MODELS } from '$lib/agent/models';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

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
					<input
						type="checkbox"
						checked={keys.persist}
						onchange={(e) => keys.setPersist(e.currentTarget.checked)}
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

			<!-- Session -->
			<section>
				<p class="hx-eyebrow mb-3 flex items-center gap-1.5"><HugeiconsIcon icon={ICON.state} size={12} strokeWidth={1.5} />session</p>
				<button
					onclick={() => session.newThread()}
					class="hx-rule rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
				>
					Start a new chat
				</button>
				<p class="mt-2 text-[11px] text-muted-foreground/80">
					Chats are kept in this browser and listed under History in the header.
				</p>
			</section>
		</div>
	</Sheet.Content>
</Sheet.Root>
