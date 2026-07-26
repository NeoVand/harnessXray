<svg
	class="d"
	viewBox="0 0 640 232"
	role="img"
	aria-label="Six file tools write into a files channel inside graph state; paths under /memories/ route onward to the store, and images live apart in the asset store"
>
	<defs>
		<marker
			id="bk-fs-a"
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
		<rect class="b" x="20" y="76" width="118" height="64" rx="3" />
		<text x="32" y="94">FILE TOOLS</text>
		<text class="m" x="32" y="110">ls · read_file</text>
		<text class="m" x="32" y="122">write_file · edit_file</text>
		<text class="m" x="32" y="134">glob · grep</text>
	</g>

	<path class="w" d="M138,108 H184" marker-end="url(#bk-fs-a)" />

	<g style="color: var(--hx-fs)">
		<rect class="b" x="188" y="24" width="248" height="184" rx="3" />
		<text x="200" y="44">FILES — A CHANNEL IN GRAPH STATE</text>
		<text class="m" x="200" y="66">/notes/2401.12345.md</text>
		<text class="m" x="200" y="82">/paper/review.md</text>
		<text class="m" x="200" y="98">/skills/arxiv-review/SKILL.md</text>
		<text class="m" x="200" y="114">/uploads/your-paper.txt</text>
		<text class="m" x="200" y="130">/conversation_history/…</text>
		<text class="m" x="200" y="154" style="fill: var(--hx-memory)">/memories/reader-style.md</text>
		<text class="m" x="200" y="192">checkpointed with the graph —</text>
		<text class="m" x="200" y="204">a rewind restores every file</text>
	</g>

	<g style="color: var(--hx-memory)">
		<path class="w" d="M436,150 H468" marker-end="url(#bk-fs-a)" />
		<rect class="b" x="472" y="118" width="148" height="58" rx="3" />
		<text x="484" y="138">STORE</text>
		<text class="m" x="484" y="154">routed by path prefix,</text>
		<text class="m" x="484" y="166">outlives every thread</text>
	</g>

	<rect class="g" x="472" y="30" width="148" height="64" rx="3" />
	<text x="484" y="50">ASSET STORE</text>
	<text class="m" x="484" y="66">/figures/*.png</text>
	<text class="m" x="484" y="78">ls cannot see these</text>
</svg>

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
