<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON, type IconValue } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';

	/**
	 * A tab strip that admits when it does not fit.
	 *
	 * Five tabs at 8px caps need about 330px, and this pane is resizable to a
	 * third of that — so `graph tools subagents skills memory` simply ran off the
	 * right edge and the last two were unreachable. Nothing said so; they were
	 * just gone.
	 *
	 * The two usual escapes are both bad here. Horizontal scrolling hides the
	 * overflow behind a gesture nobody makes on a desktop instrument, and
	 * shrinking to icons-only throws away the labels that make an unfamiliar panel
	 * findable. So: show what fits, and put the rest behind one `⋯` that only
	 * exists when something is actually hidden.
	 *
	 * The widths are measured rather than guessed. A hidden twin of the whole strip
	 * is laid out at natural width and read once per resize, which is the only way
	 * to know what fits when the labels are text in a variable font and the
	 * container is a drag handle away from any size at all. Guessing with a
	 * character count is the dirty version of this and it is wrong at every zoom
	 * level and in every locale.
	 *
	 * One rule beyond fitting: the ACTIVE tab is never the one that gets hidden. If
	 * it would be, it trades places with the last tab that fits — so the strip
	 * always shows you where you are, and the menu never contains the answer to
	 * "which panel am I looking at".
	 */
	export interface Tab {
		id: string;
		label: string;
		icon: IconValue;
		hint: string;
		/** A live count worth showing beside the label, e.g. memories. */
		badge?: number;
	}

	interface Props {
		tabs: Tab[];
		active: string;
		onselect: (id: string) => void;
		/** Matches the strip's own `gap`, in px — used in the fit arithmetic. */
		gap?: number;
	}
	let { tabs, active, onselect, gap = 14 }: Props = $props();

	let stripW = $state(0);
	/** Natural widths, in `tabs` order, read off the measuring twin. */
	let natural = $state<number[]>([]);
	let moreW = $state(0);

	/**
	 * How many fit, and what is left over.
	 *
	 * Two passes: fill greedily, then — if anything was left behind — give back
	 * whatever the `⋯` button needs. Giving it back afterwards rather than
	 * reserving it up front is what stops the button appearing when the tabs would
	 * have fitted without it.
	 */
	const split = $derived.by(() => {
		if (!stripW || natural.length !== tabs.length) return { shown: tabs, hidden: [] as Tab[] };

		let fit = 0;
		let used = 0;
		for (let i = 0; i < tabs.length; i++) {
			const w = natural[i] + (i ? gap : 0);
			if (used + w > stripW) break;
			used += w;
			fit++;
		}
		if (fit < tabs.length) {
			while (fit > 0 && used + gap + moreW > stripW) {
				used -= natural[fit - 1] + (fit > 1 ? gap : 0);
				fit--;
			}
		}

		const order = [...tabs];
		// Keep the active tab on the strip by trading it with the last one that
		// fits. Order is otherwise preserved, so nothing else jumps around.
		const at = order.findIndex((t) => t.id === active);
		if (fit > 0 && at >= fit) {
			const [a] = order.splice(at, 1);
			order.splice(fit - 1, 0, a);
		}
		return { shown: order.slice(0, fit), hidden: order.slice(fit) };
	});
</script>

<!--
	The measuring twin. Absolutely positioned so it takes no space, invisible and
	inert so it cannot be seen or clicked, but LAID OUT — `visibility: hidden`
	keeps geometry, `display: none` would not, and that difference is the whole
	trick.
-->
<div class="hx-measure" aria-hidden="true">
	{#each tabs as t, i (t.id)}
		<span class="hx-tab" bind:clientWidth={natural[i]}>
			<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
			{t.label}
			{#if t.badge}<span class="hx-num text-[9px]">{t.badge}</span>{/if}
		</span>
	{/each}
	<span class="hx-tab" bind:clientWidth={moreW}>
		<HugeiconsIcon icon={ICON.more} size={13} strokeWidth={1.5} />
	</span>
</div>

<div class="flex h-full min-w-0 flex-1 items-center gap-3.5" bind:clientWidth={stripW}>
	{#each split.shown as t (t.id)}
		<button
			class="hx-eyebrow flex h-full shrink-0 items-center gap-1.5 transition-colors
			       hover:text-foreground"
			style:color={active === t.id ? 'var(--hx-accent)' : undefined}
			onclick={() => onselect(t.id)}
			{@attach tip(t.hint)}
		>
			<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
			{t.label}
			{#if t.badge}
				<span class="hx-num text-[9px] opacity-60">{t.badge}</span>
			{/if}
		</button>
	{/each}

	{#if split.hidden.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex h-full shrink-0 items-center text-muted-foreground transition-colors
				       hover:text-foreground"
				aria-label="{split.hidden.length} more panels"
				{@attach tip(`Also here: ${split.hidden.map((t) => t.label).join(', ')}`)}
			>
				<HugeiconsIcon icon={ICON.more} size={13} strokeWidth={1.5} />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="min-w-40">
				{#each split.hidden as t (t.id)}
					<DropdownMenu.Item onSelect={() => onselect(t.id)}>
						<HugeiconsIcon icon={t.icon} size={13} strokeWidth={1.5} />
						<span class="text-xs">{t.label}</span>
						{#if t.badge}
							<span class="hx-num ml-auto text-[10px] text-muted-foreground">{t.badge}</span>
						{/if}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>

<style>
	.hx-measure {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		pointer-events: none;
		display: flex;
		white-space: nowrap;
	}
	/* The twin must be styled exactly like the real thing or it measures a
	   different strip. Only the properties that affect WIDTH matter, which is why
	   this is a short list rather than a copy of the button's classes. */
	.hx-measure .hx-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem; /* gap-1.5, as on the real button */
		/* Copied from `.hx-eyebrow` in layout.css — every property below changes
		   the measured width, and `font-weight` is easy to forget because it looks
		   cosmetic and is not. */
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: 500;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		white-space: nowrap;
	}
</style>
