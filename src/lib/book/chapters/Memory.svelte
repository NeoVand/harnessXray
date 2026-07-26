<svg
	class="d"
	viewBox="0 0 640 232"
	role="img"
	aria-label="write_file passes through a composite backend that routes by path: most paths go to the thread's checkpoint, /memories/ goes to a store that survives every thread"
>
	<defs>
		<marker
			id="bk-me-a"
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

	<g style="color: var(--hx-tool)">
		<rect class="b" x="24" y="92" width="110" height="48" rx="3" />
		<text class="c" x="79" y="112">WRITE_FILE</text>
		<text class="m c" x="79" y="126">one tool</text>
	</g>

	<path class="w" d="M134,116 H192" marker-end="url(#bk-me-a)" />

	<rect class="b" x="196" y="92" width="150" height="48" rx="3" />
	<text class="c" x="271" y="112">COMPOSITE BACKEND</text>
	<text class="m c" x="271" y="126">routes by path</text>

	<g style="color: var(--hx-state)">
		<text class="m" x="356" y="86">everything else</text>
		<path
			class="w"
			d="M346,106 H380 a10,10 0 0 0 10,-10 V70 a10,10 0 0 1 10,-10 H426"
			marker-end="url(#bk-me-a)"
		/>
		<rect class="b" x="430" y="28" width="186" height="64" rx="3" />
		<text x="442" y="48">CHECKPOINT — THIS THREAD</text>
		<text class="m" x="442" y="64">messages · files · todos,</text>
		<text class="m" x="442" y="78">written every super-step</text>
	</g>

	<g style="color: var(--hx-memory)">
		<text class="m" x="356" y="156">/memories/ only</text>
		<path
			class="w"
			d="M346,126 H380 a10,10 0 0 1 10,10 V162 a10,10 0 0 0 10,10 H426"
			marker-end="url(#bk-me-a)"
		/>
		<rect class="b" x="430" y="140" width="186" height="64" rx="3" />
		<text x="442" y="160">STORE — EVERY THREAD</text>
		<text class="m" x="442" y="176">outlives the conversation,</text>
		<text class="m" x="442" y="190">and every one after it</text>
	</g>

	<text class="m c" x="320" y="224"
		>the graph streams its own state; the store must be polled — observability follows ownership</text
	>
</svg>

<p>
	Memory in this harness is two mechanisms with two lifetimes, and keeping them distinct is the
	whole lesson. The first is the <em>checkpointer</em>. After every super-step — one committed step
	of the graph — the entire state is snapshotted: the messages, the files channel, the todos.
	Checkpoints are scoped to one <em>thread</em>, this conversation and no other, and in this app
	they are written to IndexedDB, so closing the tab mid-run and reopening it restores the
	conversation exactly. The checkpointer is not a convenience feature; it is what makes pausing,
	resuming, and rewinding possible at all, as the gates chapter shows.
</p>

<p>
	The second is the <em>store</em>: long-term memory, scoped to nothing. It survives a new chat, and
	the hundred after it. What makes the design elegant here is that the agent does not get a separate
	memory tool — the same <em>write_file</em> serves both lifetimes. A composite backend routes
	writes by path: everything ordinary lands in graph state and dies with the thread, while paths
	under <em>/memories/</em> are diverted to the store. One tool, one filesystem, two completely different
	durabilities — which is exactly the kind of thing that is invisible until an instrument shows it to
	you.
</p>

<p>
	The system prompt teaches the agent a discipline for the long-lived half: at the start of a task,
	list /memories/ and read what is relevant; when something durable is learned — your field, your
	preferred style and length, a paper you already rejected — write it there; and never put drafts or
	notes there, because it is for what should outlive the conversation, not for what is merely large.
</p>

<p>
	One asymmetry is worth noticing in the panels. Files and todos surface in this app for free,
	because the graph owns them and publishes every change on its update stream. The store is outside
	the graph, so nothing about it is ever streamed — the memory panel has to poll it. Observability
	follows ownership: the graph can only show you what is actually its state.
</p>

<p class="live">
	See it live: the memory tab in the inspector — the store's contents, refreshed after each turn,
	plus every /memories/ write as a clay row on the timeline.
</p>
