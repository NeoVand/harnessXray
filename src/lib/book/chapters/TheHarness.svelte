<script lang="ts">
	import HarnessDiagram from '../HarnessDiagram.svelte';
</script>

<HarnessDiagram />

<p>
	An agent is not a smarter model. It is a loop wrapped around an ordinary one: assemble everything
	the model should see, send it, run whatever tools the reply asked for, fold the results back in,
	and go again until there is nothing left to do. The code that runs this loop — that owns the
	state, executes the tools, and decides what the model is shown — is the
	<em>harness</em>. The model is a function; the harness is the machine it sits in.
</p>

<p>
	The drawing above is that loop. On the left, the <em>context window</em> — the single request a model
	receives for one call — is stacked from parts: the system prompt, the skill list, memory, files, the
	plan, the tool schemas, and every message so far. All of it is sent, whole, on every turn. The model
	answers with prose, or with a request to run a tool or a subagent, or both; whatever comes back is appended
	to the same stack, where it will be sent — and paid for — again on every turn that follows.
</p>

<p>
	Two facts fall out of this shape, and most of this book is about the machinery they force into
	existence. First, the model is stateless: nothing survives inside it between calls, so every
	appearance of continuity — remembering your name, keeping a plan, knowing a file exists — is
	manufactured by the harness re-presenting state it kept itself. Second, the context is finite and
	metered. The transcript grows, the window does not, and tokens cost money, so a serious harness
	spends most of its cleverness deciding what <em>not</em> to send: files instead of prose, subagents
	instead of raw text, summaries instead of history.
</p>

<p>
	This application runs a real harness — deepagents, built on LangChain and LangGraph — entirely in
	your browser. The agent inside it writes short, cited literature reviews from arXiv preprints:
	real model calls, real searches, real money. Nothing about it was modified to make it teachable.
	The X-ray half of the screen reads what the framework already publishes — the bytes on the wire
	and the graph's own state channels — so every number in these panels is a measurement of the run
	you are watching, not an illustration of one.
</p>

<p class="live">
	See it live: the events and context tabs to the left of this page — the loop as it actually ran,
	and the exact request each turn was fed.
</p>
