<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/07-memory.jpg"
	alt="A spiral notebook tied to a speech bubble beside a heavy archive vault — memory for this thread, and memory that outlives every thread"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Two mechanisms, two lifetimes. The <em>checkpointer</em> snapshots the entire state — messages, files,
	todos — after every committed step, scoped to this one thread and written to IndexedDB, so closing the
	tab mid-run and reopening restores the conversation exactly. It is not a convenience: it is what makes
	pausing, resuming, and rewinding possible at all.
</p>

<p>
	The <em>store</em> is scoped to nothing and survives every chat. Elegantly, there is no separate
	memory tool — the same <em>write_file</em> serves both lifetimes, with a composite backend routing
	by path: ordinary paths die with the thread, <em>/memories/</em> is diverted to the store. One asymmetry
	worth noticing: files and todos stream from the graph for free, but the store lives outside it, so the
	memory panel must poll — observability follows ownership.
</p>

<img
	class="plate"
	src="{base}/book/07-memory-tech.jpg"
	alt="Schematic: write_file forks by path — ordinary paths to the thread’s checkpointer, /memories/ to the store that outlives every thread"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="live">
	See it live: the memory tab in the inspector — the store's contents, refreshed after each turn,
	plus every /memories/ write as a clay row on the timeline.
</p>
