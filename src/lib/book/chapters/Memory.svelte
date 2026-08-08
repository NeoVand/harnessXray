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

<p class="lead">
	"Memory" in an agent is two different mechanisms with two different lifetimes. Keeping them
	straight explains most of what looks mysterious about what an agent does and does not recall.
</p>

<h2>The checkpointer — memory for this conversation</h2>

<p>
	After every committed step, the checkpointer snapshots the whole state: messages, files, todos,
	all of it. It is scoped to this one thread and written to IndexedDB in your browser, so you can
	close the tab mid-run, come back, and find the conversation exactly where you left it.
</p>

<p>
	It is not a convenience feature. It is what makes pausing, resuming and rewinding possible at all
	— chapter 9 runs entirely on it.
</p>

<h2>The store — memory that outlives everything</h2>

<p>
	The store is scoped to nothing. It survives every chat, indefinitely. And there is no separate
	memory tool to learn: the agent writes with the same <em>write_file</em>, and a composite backend
	routes by path. Ordinary paths die with the thread; anything under <em>/memories/</em> is diverted to
	the store. One tool, two lifetimes, decided by where you put the file.
</p>

<img
	class="plate"
	src="{base}/book/07-memory-tech.jpg"
	alt="Schematic: write_file forks by path — ordinary paths to the thread’s checkpointer, /memories/ to the store that outlives every thread"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	One asymmetry is worth noticing, because otherwise you would call it a bug. Files and todos stream
	out of the graph for free, so their panels update instantly. The store lives <em>outside</em> the graph,
	so the memory panel has to poll it. Observability follows ownership: what the framework does not own,
	you do not get for free.
</p>

<p class="live">
	See it live: the memory tab in the inspector — the store's contents, refreshed after each turn,
	plus every /memories/ write as a clay row on the timeline.
</p>
