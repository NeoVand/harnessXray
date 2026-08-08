<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/08-middleware.jpg"
	alt="An envelope pierces concentric rings, each stamping it on the way to the model — every call passes through"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	Here is the secret of the last six chapters: they were all describing the same mechanism. Todos,
	skills, the filesystem, subagents, summarisation — none of them are special cases inside the loop.
	Every one of them is <em>middleware</em>.
</p>

<p>
	A middleware is a layer wrapped around the model call, with hooks that run before and after it.
	From that position it can do a surprising amount: install tools, append its own fragment to the
	system prompt, own a channel of state, or rewrite messages on their way out.
</p>

<p>
	So the harness is mostly a stack of these layers around a very small loop. Everything in chapters
	2 through 7 arrives that way, and this app wrote none of it.
</p>

<h2>What this app adds</h2>

<ul>
	<li>
		<em>world-state</em> appends a short, throwaway block listing the figures and sources that currently
		exist, so the agent learns what it has without going to look. Awareness by push, not pull.
	</li>
	<li>
		<em>one-gate</em> trims a turn down to a single approval-gated call, because people approve one thing
		at a time.
	</li>
	<li><em>interruptOn</em> installs the gate itself — that is chapter 9.</li>
</ul>

<img
	class="plate"
	src="{base}/book/08-middleware-tech.jpg"
	alt="Schematic: the middleware onion around the model — the request passes down the rings, the reply climbs back out"
	width="1536"
	height="1024"
	loading="lazy"
/>

<h2>Order is behaviour</h2>

<p>
	A request passes down through the layers in list order, and the reply climbs back out in
	<em>reverse</em> — the onion in the plate above. That ordering is not decoration; it decides which layer
	gets to see and change a reply first. Watch the after_model nodes go past on the timeline: the gate's
	runs first, the todo list's last. You can read the stack from the outside in.
</p>

<p class="live">
	See it live: the context tab — each layer's prompt fragment, and the injected world_state block
	riding every request — and the layers' own after_model nodes named on the events timeline.
</p>
