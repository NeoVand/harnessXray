<img
	class="plate"
	src="/book/02-filesystem.jpg"
	alt="Robots share one drawer of folders — /notes, /paper, /skills — passing pages in and out; the drawer is saved with the conversation"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	The agent appears to have a disk. It can <em>ls</em> a directory, read and write files, edit one
	in place, match paths with <em>glob</em>, and search contents with <em>grep</em> — six tools, all supplied
	by the harness. This application wrote none of them, and the agent uses them constantly: its notes,
	its drafts, its skills and your uploads all live behind those six names.
</p>

<p>
	There is no disk. The filesystem is a <em>channel</em> — one named field inside the state that LangGraph
	carries from step to step — mapping paths to contents. That implementation detail buys three properties
	a real disk would not. It is checkpointed: state is snapshotted after every step, so rewinding the conversation
	restores the files exactly as they stood. It is observable: every write is published on the graph's
	update stream, which is how the files panel mirrors it without the agent's cooperation. And it is scoped:
	a new chat starts with a clean slate, because the channel belongs to the thread.
</p>

<p>
	What the filesystem is <em>for</em> is keeping bulk out of the conversation. The system prompt
	teaches this agent conventions: notes from each paper go to <em>/notes/</em>, one file per arXiv
	id; draft sections go to <em>/paper/</em>; anything you attach lands in
	<em>/uploads/</em>, a PDF arriving already extracted to a text file beside it; and when the
	conversation is compacted, the folded-away transcript is archived under
	<em>/conversation_history/</em>. A fact written to a file costs tokens once when read — the same
	fact kept in chat is re-sent on every turn forever.
</p>

<p>
	One junction in this app is special. A composite backend routes writes by path: everything above
	lives and dies with the thread, but paths under <em>/memories/</em> are diverted to a store that survives
	every conversation. Same tools, two lifetimes — the memory chapter is about that seam.
</p>

<p>
	And one honest limit: the filesystem is text. Images — generated, extracted from papers, or
	uploaded — live in an asset store beside it, where <em>ls</em> cannot see them; the agent has a
	separate <em>list_figures</em> tool for that, and learning to trust it over <em>ls</em> is one of this
	agent's hard-won lessons.
</p>

<p class="live">
	See it live: the files tab in the inspector, and the sage fs rows on the events timeline — one per
	write, as the graph commits it.
</p>
