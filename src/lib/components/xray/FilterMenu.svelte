<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	/**
	 * Narrowing what a panel shows.
	 *
	 * The state is the set of *hidden* keys rather than the shown ones, so the
	 * default — everything visible — is the empty set. That matters more than it
	 * sounds: a new event kind added later is visible without anyone remembering
	 * to add it to a list, and "is a filter on?" is `size > 0` rather than a
	 * comparison against a list that has to be kept in step.
	 */
	interface Option {
		key: string;
		label: string;
		color?: string;
		count?: number;
	}

	// A SvelteSet owned by the parent: mutating it here is what re-runs every
	// panel that reads `.has()`. No copy-and-reassign, so no binding either —
	// the object never changes identity, only its contents.
	let {
		options,
		hidden = new SvelteSet<string>(),
		label = 'filter'
	}: { options: Option[]; hidden?: SvelteSet<string>; label?: string } = $props();

	const active = $derived(hidden.size > 0);

	function toggle(key: string) {
		if (!hidden.delete(key)) hidden.add(key);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="flex items-center gap-1 transition-colors hover:text-foreground"
		title={active ? `${hidden.size} hidden — click to change` : `Filter ${label}`}
		aria-label="Filter"
	>
		<span class="flex items-center gap-1" style:color={active ? 'var(--hx-interrupt)' : undefined}>
			<HugeiconsIcon icon={ICON.filter} size={12} strokeWidth={1.5} />
			{#if active}
				<span class="hx-num text-[10px]">{options.length - hidden.size}/{options.length}</span>
			{/if}
		</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="min-w-44">
		{#each options as o (o.key)}
			<DropdownMenu.CheckboxItem
				checked={!hidden.has(o.key)}
				closeOnSelect={false}
				onCheckedChange={() => toggle(o.key)}
			>
				<span class="flex min-w-0 flex-1 items-center gap-2">
					{#if o.color}
						<span class="size-1.5 shrink-0 rounded-full" style:background={o.color}></span>
					{/if}
					<span class="truncate text-xs">{o.label}</span>
					{#if o.count !== undefined}
						<span class="hx-num ml-auto text-[10px] text-muted-foreground">{o.count}</span>
					{/if}
				</span>
			</DropdownMenu.CheckboxItem>
		{/each}

		{#if active}
			<DropdownMenu.Separator />
			<DropdownMenu.Item onSelect={() => hidden.clear()}>
				<span class="text-xs">Show everything</span>
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
