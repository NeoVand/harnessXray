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

<p>
	The plan is not prose the model keeps promising to follow — it is a <em>channel</em> in graph
	state, written by the harness's own <em>write_todos</em>, checkpointed with everything else,
	restored on rewind, and mirrored live in the plan panel. Intent gets one small, current
	representation that survives scrolling, summarizing, and forgetting.
</p>

<p>
	Its one sharp edge: <em>last write wins</em>. Every call replaces the whole list — no merge, no
	append — so a call carrying two items destroys the other five, and the panel shows the collapse
	when it happens. When an agent seems to "forget" its plan, look here first. The sequence of
	revisions is also the cheapest window into the agent's mind: what it thought the job was, and
	where it learned otherwise.
</p>

<img
	class="plate"
	src="{base}/book/04-plan-tech.jpg"
	alt="Schematic: write_todos replaces the todos channel whole — pending, in_progress, completed"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="live">
	See it live: the plan tab in the inspector, and the state-coloured todo rows on the events
	timeline — one per revision, with what changed.
</p>
