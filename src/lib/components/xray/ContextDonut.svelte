<script lang="ts">
	/**
	 * How full the context is, at a glance.
	 *
	 * A donut rather than a bar because the status rail is one line tall and a
	 * 7px-high bar reads as a smudge. It turns amber at the threshold where the
	 * harness starts folding the conversation up, so the moment stops being a
	 * surprise — you can watch it coming.
	 */
	let { used, warn = 0.9, size = 12 }: { used: number; warn?: number; size?: number } = $props();

	const R = 7;
	const C = 2 * Math.PI * R;
	const clamped = $derived(Math.max(0, Math.min(1, used)));
	const color = $derived(clamped >= warn ? 'var(--hx-interrupt)' : 'var(--hx-model)');
</script>

<svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" class="shrink-0">
	<circle cx="10" cy="10" r={R} fill="none" stroke="var(--border)" stroke-width="4" />
	<circle
		cx="10"
		cy="10"
		r={R}
		fill="none"
		stroke={color}
		stroke-width="4"
		stroke-dasharray="{clamped * C} {C}"
		stroke-linecap="butt"
		transform="rotate(-90 10 10)"
		style:transition="stroke-dasharray 0.3s ease"
	/>
</svg>
