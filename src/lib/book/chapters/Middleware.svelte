<img
	class="plate"
	src="/book/08-middleware.jpg"
	alt="An envelope pierces concentric rings, each stamping it on the way to the model — every call passes through"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	The secret of the last six chapters: almost everything they described is <em>middleware</em> — a layer
	around the model call with hooks before and after, able to install tools, append prompt fragments, own
	a state channel, or rewrite messages in flight. The harness is mostly a stack of such layers around
	a bare loop: todos, skills, filesystem, subagents, summarization and patching all arrive this way, unwritten
	by this app.
</p>

<p>
	The app's own three layers show what the mechanism is for: <em>world-state</em> pushes an
	ephemeral block naming the images and sources that exist (awareness by push, cache-safe);
	<em>one-gate</em> trims any turn to a single approval-gated call, because approvals happen one at
	a time; and <em>interruptOn</em> installs the gate itself. Order is behaviour: requests pass the
	layers in list order, replies climb back out in <em>reverse</em> — watch the after_model nodes on the
	timeline, gate first, todo list last.
</p>

<p class="live">
	See it live: the context tab — each layer's prompt fragment, and the injected world_state block
	riding every request — and the layers' own after_model nodes named on the events timeline.
</p>
