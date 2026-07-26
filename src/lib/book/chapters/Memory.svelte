<img
	class="plate"
	src="/book/07-memory.jpg"
	alt="A spiral notebook tied to a speech bubble beside a heavy archive vault — memory for this thread, and memory that outlives every thread"
	width="1536"
	height="1024"
	loading="lazy"
/>

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
