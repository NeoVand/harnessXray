<img
	class="plate"
	src="/book/04-plan.jpg"
	alt="A fresh checklist sheet slides over the old one on a clipboard — write_todos replaces the whole plan, never appends"
	width="1536"
	height="1024"
	loading="lazy"
/>

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
