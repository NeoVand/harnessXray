<img
	class="plate"
	src="/book/05-subagents.jpg"
	alt="A worker robot devours a thick stack of pages inside a glass booth and passes one small card out through a slot — 40,000 tokens in, 200 back"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	The harness's <em>task</em> tool dispatches a <em>subagent</em>: a complete agent run inside one
	tool call — its own context window, tools, and system prompt. Nothing it does enters the parent's
	context except its final reply, and that asymmetry is the entire point: a paper-reader burns forty
	thousand tokens digesting a paper, the parent pays for the two hundred it hands back. The X-ray
	shows both numbers.
</p>

<p>
	This app defines four, each reply a contract: <em>paper-reader</em> digests one paper into notes
	and at most 200 words back; <em>image-smith</em> writes the actual image brief and pauses at the
	gate for your approval; <em>report-writer</em> assembles the review with every citation from the
	cite tool; <em>critic</em> audits the draft on a six-call budget and returns CLEAN or violations.
	They coordinate through the filesystem, not conversation — and custom subagents inherit
	<em>nothing</em>, so each names its skills directory explicitly.
</p>

<img
	class="plate"
	src="/book/05-subagents-tech.jpg"
	alt="Schematic: one task call fans into parallel subagent context windows; only small digests return — 40k inside, 200 back"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="live">
	See it live: the subagent lanes on the events timeline — the dispatch, everything it did in its
	own window, and the one summary that returned.
</p>
