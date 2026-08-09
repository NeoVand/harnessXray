<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/05-subagents.jpg"
	alt="A worker robot devours a thick stack of pages inside a glass booth and passes one small card out through a slot — 40,000 tokens in, 200 back"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	Some jobs are expensive to read and cheap to summarise. Digesting a long paper might cost forty
	thousand tokens; what you actually need from it is two hundred words. Do that in the main
	conversation and you pay the forty thousand again on every turn that follows.
</p>

<p>
	The harness's <em>task</em> tool fixes this by starting a whole second agent inside a single tool
	call. The <em>subagent</em> gets its own context window, its own tools and its own system prompt. It
	runs its own loop to completion — and then only its final reply comes back. Everything it read, every
	dead end it walked down, stays in its window and is thrown away with it.
</p>

<p>
	That asymmetry is the entire point, and the X-ray shows both numbers: what the subagent spent, and
	what the parent paid to learn the answer.
</p>

<h2>The four in this app</h2>

<ul>
	<li><em>paper-reader</em> digests one paper into notes and hands back at most 200 words.</li>
	<li>
		<em>image-smith</em> writes the actual image brief, then stops at a gate for your approval — whether
		it is making a picture or re-rendering one.
	</li>
	<li>
		<em>report-writer</em> assembles the review, taking every citation from the <em>cite</em> tool and
		handing it the paper's own sentence to check against the source.
	</li>
	<li>
		<em>critic</em> audits the draft on a budget of six tool calls and returns either CLEAN or a list
		of violations.
	</li>
</ul>

<p>
	Each one has a <em>reply contract</em> — a stated shape for what comes back. That is the discipline
	that makes subagents worth having. A subagent that returns "here is everything I found" has moved the
	cost, not removed it.
</p>

<img
	class="plate"
	src="{base}/book/05-subagents-tech.jpg"
	alt="Schematic: one task call fans into parallel subagent context windows; only small digests return — 40k inside, 200 back"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Two habits follow. They coordinate through the filesystem rather than conversation: one writes
	notes, the next reads them. And custom subagents inherit <em>nothing</em> from the parent — not its
	skills, not its middleware — so each one has to name what it needs explicitly. Ours spent weeks unable
	to re-read a manual it was told to follow, for exactly that reason, and later spent a week unable to
	plan for the same one.
</p>

<p>
	Coordinating through notes has a cost worth naming. A note is a paraphrase, so a chain of agents
	passing notes is a chain of summaries of summaries — and a critic reading them is one model
	checking another model's précis. Whatever must be exact has to travel as the source's own words:
	this app keeps every fetched paper's full text and checks quotes against it, so the writer can
	hand a sentence to <em>cite</em> and have the paper itself settle the matter.
</p>

<p class="live">
	See it live: the subagent lanes on the events timeline — the dispatch, everything it did in its
	own window, and the one summary that returned.
</p>
