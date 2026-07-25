<script lang="ts">
	import { bus } from '$lib/xray/bus.svelte';
	import { SYSTEM_PROMPT } from '$lib/agent/prompt';

	/**
	 * Prompt assembly.
	 *
	 * We do not reconstruct this — we read it back off the wire. The most recent
	 * outbound request contains the exact instructions and the exact tool list
	 * the model received, which is the only version that is true. The point of
	 * the panel is the ratio: what you wrote versus what the harness added.
	 */
	const request = $derived.by(() => {
		void bus.version;
		for (let i = bus.events.length - 1; i >= 0; i--) {
			const e = bus.events[i];
			if (e.kind === 'http_request' && e.body && typeof e.body === 'object') return e;
		}
		return undefined;
	});

	const body = $derived(request?.kind === 'http_request' ? (request.body as Record<string, unknown>) : undefined);

	const instructions = $derived(
		typeof body?.instructions === 'string' ? body.instructions : ''
	);

	const tools = $derived.by(() => {
		const t = body?.tools;
		return Array.isArray(t)
			? (t as { name?: string; description?: string }[]).map((x) => ({
					name: x.name ?? '(unnamed)',
					description: x.description ?? ''
				}))
			: [];
	});

	const ours = $derived(instructions.indexOf(SYSTEM_PROMPT.slice(0, 60)));
	const oursChars = $derived(ours >= 0 ? SYSTEM_PROMPT.length : 0);
	const harnessChars = $derived(Math.max(0, instructions.length - oursChars));
	const pct = $derived(
		instructions.length ? Math.round((oursChars / instructions.length) * 100) : 0
	);

	// ~4 chars per token: a pre-flight estimate, deliberately labelled as one.
	const estTokens = (s: string) => Math.ceil(s.length / 4);
</script>

<div class="px-3 py-3">
	{#if !instructions}
		<p class="text-xs text-muted-foreground">
			Send a message. This panel reads the system prompt back off the last real request, rather than
			reconstructing what we think was sent.
		</p>
	{:else}
		<p class="hx-eyebrow mb-2">system prompt · {instructions.length.toLocaleString()} chars · ~{estTokens(instructions).toLocaleString()} tokens</p>

		<div class="mb-1 flex h-1.5 overflow-hidden rounded-full">
			<span style:width="{pct}%" style:background="var(--hx-model)"></span>
			<span style:width="{100 - pct}%" style:background="var(--hx-state)" style:opacity="0.5"></span>
		</div>
		<p class="mb-4 text-[10px] text-muted-foreground">
			<span style:color="var(--hx-model)">{pct}% yours</span> ·
			<span>{100 - pct}% added by the harness ({harnessChars.toLocaleString()} chars)</span>
		</p>

		<pre class="hx-rule max-h-[42vh] overflow-auto rounded-md border p-2.5 font-mono text-[10.5px]
		            leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-foreground/80">{instructions}</pre>

		<p class="hx-eyebrow mt-5 mb-2">tools on the wire · {tools.length}</p>
		<ul class="space-y-1.5">
			{#each tools as t (t.name)}
				<li class="text-[11px] leading-snug">
					<span class="font-mono" style:color="var(--hx-tool)">{t.name}</span>
					<span class="block text-muted-foreground">{t.description.slice(0, 130)}{t.description.length > 130 ? '…' : ''}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
