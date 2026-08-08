<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/10-build-your-own.jpg"
	alt="Hands stack blocks — folder, wrench, checklist, robot, manual, vault, ring, gate — into a tower crowned by a glowing brain"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	Everything in this book assembles in a single call. You hand the harness the parts, and it hands
	you back the loop from chapter 1.
</p>

<ul>
	<li>a model, and the tools you wrote</li>
	<li>a system prompt, which the harness extends with one fragment per layer</li>
	<li>subagents, described in plain prose</li>
	<li>skills, as a directory of markdown</li>
	<li>a backend, deciding where files actually live</li>
	<li>a checkpointer, which is what makes any of it resumable</li>
	<li><em>interruptOn</em>, naming what a human must see first</li>
</ul>

<p>The assembly is the easy part, and it is not what took us long to learn. This is:</p>

<img
	class="plate"
	src="{base}/book/10-build-tech.jpg"
	alt="Schematic: model, tools, subagents, skills, middleware, backend and checkpointer plug into createDeepAgent; out comes the loop"
	width="1536"
	height="1024"
	loading="lazy"
/>

<h2>The part that transfers</h2>

<ul>
	<li>
		Keep expensive reading inside subagents — pay the tokens once, in a window you throw away.
	</li>
	<li>Make awareness push, not pull. Tell the agent what exists; don't make it go hunting.</li>
	<li>
		Let tools fail as text. An error the model can read is a setback; an exception is a crash.
	</li>
	<li>Gate what is costly or steering, and nothing that is merely a read.</li>
	<li>Give every subagent a reply contract, or you have moved the cost instead of removing it.</li>
</ul>

<p>
	And build it so it can be watched. Everything this book described was read off the wire and out of
	the graph's own channels, with the agent unmodified and never told it was being observed. A
	harness you can see inside is one you can debug, teach with, and eventually trust.
</p>

<p class="live">
	See it live: the graph tab in the inspector — the assembled machine, drawn from the running graph
	itself.
</p>
