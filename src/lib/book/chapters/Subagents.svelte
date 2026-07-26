<img
	class="plate"
	src="/book/05-subagents.jpg"
	alt="A worker robot devours a thick stack of pages inside a glass booth and passes one small card out through a slot — 40,000 tokens in, 200 back"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	The harness's <em>task</em> tool dispatches a <em>subagent</em>: a complete agent run inside a
	single tool call, with its own context window, its own tools, its own system prompt. The parent's
	transcript does not come along, and nothing the subagent does enters the parent's context — except
	its final reply. That asymmetry is the entire point. A paper-reader can burn forty thousand tokens
	digesting a full paper; the parent pays for the two hundred it hands back. The X-ray shows both
	numbers, which turns the compression from a claim into a fact.
</p>

<p>This app defines four, and each one's reply is a contract, not a courtesy:</p>

<ul>
	<li>
		<em>paper-reader</em> reads exactly one arXiv paper, writes structured notes to /notes/, and may extract
		up to two of its real figures. It returns at most 200 words — the paper's claim, what it actually
		demonstrates, one caveat — plus a line naming each extracted figure. Several run in parallel.
	</li>
	<li>
		<em>image-smith</em> is an art director: it writes the actual gpt-image-2 brief and calls generate_image,
		which pauses for your approval — on the prompt the subagent wrote, not the vague request the parent
		delegated. It returns the saved path and one sentence.
	</li>
	<li>
		<em>report-writer</em> assembles the final review from the notes: every citation obtained from the
		cite tool, the References section taken from bibliography verbatim, figures placed where they earn
		their keep. It returns the path and a one-line description of the structure.
	</li>
	<li>
		<em>critic</em> checks the finished draft against the notes and the source registry on a hard budget
		of six tool calls, and returns either the single word CLEAN or a numbered list of violations, worst
		first.
	</li>
</ul>

<p>
	They coordinate through the filesystem, not through conversation: notes a reader writes are files
	the writer reads. And one configuration lesson learned the hard way here — custom subagents
	inherit nothing. Each of the four names its skills directory explicitly, because a subagent that
	is never told skills exist cannot read one, even when its prompt says to.
</p>

<p class="live">
	See it live: the subagent lanes on the events timeline — the dispatch, everything it did in its
	own window, and the one summary that returned.
</p>
