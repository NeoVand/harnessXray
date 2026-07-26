<script lang="ts">
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { CloudIcon, CloudRainIcon, Moon02Icon, Sun03Icon } from '@hugeicons/core-free-icons';
	import type { ThemeId } from '$lib/state/theme.svelte';

	/**
	 * One glyph per theme, so the button shows where you *are* rather than what
	 * it will do. That is the whole reason a cycle works without a menu: the
	 * icon is the readout.
	 */
	let { id, size = 15 }: { id: ThemeId; size?: number } = $props();

	/**
	 * `{#key}` because `HugeiconsIcon` injects its paths on mount and does not
	 * re-render them when the `icon` prop changes — swapping themes left the
	 * button showing whichever glyph it happened to boot with. Voicebook gets
	 * this free by swapping the *component* (lucide exports one per icon); the
	 * key block is the same idea, made explicit.
	 */

	const ICONS = {
		midnight: Moon02Icon,
		rainy: CloudRainIcon,
		cloudy: CloudIcon,
		sunny: Sun03Icon
	} as const;
</script>

{#key id}
	<HugeiconsIcon icon={ICONS[id]} {size} strokeWidth={1.5} />
{/key}
