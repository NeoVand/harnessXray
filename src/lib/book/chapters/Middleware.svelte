<svg
	class="d"
	viewBox="0 0 640 262"
	role="img"
	aria-label="Nine middleware layers stacked above the model: the request passes down through them in list order, and the reply climbs back up in reverse — the onion"
>
	<defs>
		<marker
			id="bk-mw-a"
			viewBox="0 0 8 8"
			refX="7"
			refY="4"
			markerWidth="5"
			markerHeight="5"
			orient="auto"
		>
			<path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
		</marker>
	</defs>

	<text x="24" y="20">REQUEST</text>
	<text class="m" x="24" y="32">in — top to bottom</text>
	<path class="w" d="M116,40 V234 H144" marker-end="url(#bk-mw-a)" />

	<text class="e" x="616" y="20">REPLY</text>
	<text class="m e" x="616" y="32">out — in reverse</text>
	<path class="w" d="M490,234 H524 V44" marker-end="url(#bk-mw-a)" />

	<rect class="b" x="150" y="14" width="340" height="16" rx="2" />
	<text x="162" y="26">TODO LIST</text>

	<rect class="b" x="150" y="36" width="340" height="16" rx="2" />
	<text x="162" y="48">SKILLS</text>

	<rect class="b" x="150" y="58" width="340" height="16" rx="2" />
	<text x="162" y="70">FILESYSTEM</text>

	<rect class="b" x="150" y="80" width="340" height="16" rx="2" />
	<text x="162" y="92">SUBAGENTS</text>

	<rect class="b" x="150" y="102" width="340" height="16" rx="2" />
	<text x="162" y="114">SUMMARIZATION</text>
	<text class="m e" x="478" y="114">replaced — threshold stated</text>

	<rect class="b" x="150" y="124" width="340" height="16" rx="2" />
	<text x="162" y="136">PATCH TOOL CALLS</text>

	<rect class="b" x="150" y="146" width="340" height="16" rx="2" />
	<text x="162" y="158">WORLD STATE</text>
	<text class="m e" x="478" y="158">added by this app</text>

	<rect class="b" x="150" y="168" width="340" height="16" rx="2" />
	<text x="162" y="180">ONE GATE PER TURN</text>
	<text class="m e" x="478" y="180">added by this app</text>

	<g style="color: var(--hx-interrupt)">
		<rect class="b" x="150" y="190" width="340" height="16" rx="2" />
		<text x="162" y="202">APPROVAL GATE</text>
		<text class="m e" x="478" y="202" style="fill: currentColor">installed by interruptOn</text>
	</g>

	<g style="color: var(--hx-model)">
		<rect class="b" x="150" y="214" width="340" height="40" rx="3" />
		<text class="c" x="320" y="238">MODEL — ONE CALL</text>
	</g>
</svg>

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
