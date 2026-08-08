<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/04-plan.jpg"
	alt="A fresh checklist sheet slides over the old one on a clipboard — write_todos replaces the whole plan, never appends"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	Ask a model to keep a plan in its head and it will promise to, and then drift. This harness does
	not ask. The plan is a piece of state with its own tool for writing it: <em>write_todos</em>.
</p>

<p>
	Because it lives in state, it inherits everything state gets. It is saved at every step, restored
	when you rewind, and mirrored live in the plan panel. Intent gets one small, current
	representation that survives scrolling, summarising and forgetting.
</p>

<h2>The sharp edge: last write wins</h2>

<p>
	Every call to <em>write_todos</em> replaces the entire list. No merge, no append. If the model sends
	two items when there were seven, five of them are simply gone — and the plan panel shows the collapse
	the moment it happens. When an agent seems to "forget" what it was doing, look here first.
</p>

<img
	class="plate"
	src="{base}/book/04-plan-tech.jpg"
	alt="Schematic: write_todos replaces the todos channel whole — pending, in_progress, completed"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	The same design has an upside. Because each revision is a complete snapshot, the sequence of them
	is the cheapest window you will get into the agent's thinking: what it believed the job was at the
	start, where it learned otherwise, and what it quietly dropped along the way.
</p>

<p class="live">
	See it live: the plan pane above the events, and the state-coloured todo rows on the events
	timeline — one per revision, with what changed.
</p>
