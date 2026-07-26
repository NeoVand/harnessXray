<img
	class="plate"
	src="/book/08-middleware.jpg"
	alt="An envelope pierces concentric rings, each stamping it on the way to the model — every call passes through"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Here is the secret of the last six chapters: almost everything they described is
	<em>middleware</em>. A middleware is a layer wrapped around the model call, with hooks that run
	before and after it. A layer can install tools, append its own fragment to the system prompt, own
	a state channel, or rewrite messages on their way past — and the harness is mostly a stack of such
	layers around a bare model loop.
</p>

<p>
	When this app builds its agent, deepagents assembles the stack in the order drawn above. The
	todo-list layer brings write_todos and the plan channel. The skills layer scans the skills
	directory and writes the one-line-per-skill list into the prompt. The filesystem layer brings the
	six file tools and the files channel; the subagent layer brings task. Summarization folds the
	conversation once it crosses a threshold, and a patch layer keeps message history well-formed when
	a turn is cut short. All of that arrived without being written here.
</p>

<p>
	The app then adds its own layers, and they show what middleware is for. The summarization layer is <em
		>replaced</em
	> rather than duplicated — naming it again swaps in one whose threshold is stated explicitly, because
	the default reads a limit off a model profile this model family does not have. The world-state layer
	appends a small, ephemeral block to every model call naming the images and sources that exist right
	now: awareness by push instead of pull, never written into history, so it cannot go stale and prompt
	caching survives it. The one-gate layer rewrites any turn carrying two approval-gated calls down to
	one — the dropped call vanishes without trace and gets asked again next turn — because approvals happen
	one at a time. And setting interruptOn installs the approval gate itself as the final layer.
</p>

<p>
	The order matters, and it is an onion. On the way in, the request passes the layers in list order;
	on the way out, the after-model hooks fire in reverse — the layers appended last see the model's
	raw output first, before the built-in layers fold the turn into state. This is not a diagram
	convention: the timeline names each layer's node as it runs, so you can watch the reply climb back
	out, gate first, todo list last. Position in the stack is behaviour, not bookkeeping.
</p>

<p class="live">
	See it live: the context tab — each layer's prompt fragment, and the injected world_state block
	riding every request — and the layers' own after_model nodes named on the events timeline.
</p>
