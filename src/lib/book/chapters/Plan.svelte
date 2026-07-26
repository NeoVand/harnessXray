<svg
	class="d"
	viewBox="0 0 640 208"
	role="img"
	aria-label="The model calls write_todos, which replaces the todos channel in graph state wholesale; the previous list is gone, not merged"
>
	<defs>
		<marker
			id="bk-pl-a"
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

	<g style="color: var(--hx-model)">
		<rect class="b" x="24" y="76" width="104" height="56" rx="3" />
		<text class="c" x="76" y="108">MODEL</text>
	</g>

	<g style="color: var(--hx-tool)">
		<text class="m c" x="168" y="96">write_todos</text>
		<path class="w" d="M128,104 H206" marker-end="url(#bk-pl-a)" />
	</g>

	<g style="color: var(--hx-state)">
		<rect class="b" x="210" y="24" width="230" height="160" rx="3" />
		<text x="222" y="44">TODOS — GRAPH STATE</text>

		<rect class="bar" x="222" y="56" width="10" height="10" rx="1" />
		<text class="m" x="240" y="65">search broadly</text>

		<rect
			x="222"
			y="76"
			width="10"
			height="10"
			rx="1"
			fill="none"
			stroke="currentColor"
			stroke-width="1.2"
		/>
		<rect class="bar" x="222" y="76" width="5" height="10" rx="1" />
		<text class="m" x="240" y="85">dispatch paper-readers</text>

		<rect
			x="222"
			y="96"
			width="10"
			height="10"
			rx="1"
			fill="none"
			stroke="currentColor"
			stroke-width="1.2"
		/>
		<text class="m" x="240" y="105">draft each section</text>

		<rect
			x="222"
			y="116"
			width="10"
			height="10"
			rx="1"
			fill="none"
			stroke="currentColor"
			stroke-width="1.2"
		/>
		<text class="m" x="240" y="125">critique, then fix</text>

		<text class="m" x="222" y="154">one list, one channel —</text>
		<text class="m" x="222" y="166">every write replaces it whole</text>
	</g>

	<path class="wd" d="M440,74 H466" marker-end="url(#bk-pl-a)" />
	<rect class="g" x="470" y="40" width="150" height="68" rx="3" />
	<text class="m" x="482" y="62">the previous list</text>
	<text class="m" x="482" y="76">gone — not merged</text>
</svg>

<p>
	<em>write_todos</em> came with the harness. It maintains the plan: a list of items, each marked
	pending, in progress, or completed. Like the filesystem, the plan is not prose the model keeps
	promising to follow — it is a <em>channel</em> in graph state, named <em>todos</em>, which means
	it is checkpointed with everything else, restored on rewind, and published on the update stream
	where this app can mirror it live.
</p>

<p>
	Why a harness bothers: a model's intentions otherwise live only in its own earlier sentences,
	which scroll away, get summarized, and cost tokens to repeat. A plan channel gives intent a
	single, small, current representation that survives all of that. It also disciplines the model.
	This agent's system prompt makes planning the first act of any task — one item per section it
	intends to write, plus one each for searching, reading, and critique — and requires statuses to
	change as work proceeds. Watching the panel during a run, you can see the moment a task moves to
	in progress before the tool calls that do it begin.
</p>

<p>
	The channel has one sharp edge, and it is visible in this app rather than papered over: last write
	wins. Each <em>write_todos</em> call replaces the entire list. There is no merge, no append, no patch
	— a call that carries only two items destroys the other five, and the panel will show the plan collapsing
	when it happens. That is not a bug in the harness so much as a property of state channels: the reducer
	for this one is replacement, and the model has to be prompted to write the whole list every time. When
	an agent of yours seems to "forget" its plan, this is the first place to look.
</p>

<p>
	The plan is also the cheapest window into an agent's mind. The diagram above is the whole
	mechanism — one tool, one channel, one replacement rule — but in a long run the sequence of list
	revisions reads like a narrative: what it thought the job was, where it discovered the job was
	bigger, which items quietly disappeared. The timeline keeps every revision, so that story is
	replayable after the fact.
</p>

<p class="live">
	See it live: the plan tab in the inspector, and the state-coloured todo rows on the events
	timeline — one per revision, with what changed.
</p>
