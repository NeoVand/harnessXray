<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/01-the-harness.jpg"
	alt="A luminous loop: envelopes travel from the model past tool stations and return transformed — the harness is the loop"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	A chatbot answers you once and stops. An agent keeps going: it reads a file, runs a search, looks
	at what came back, tries again. Nothing about the model changed. Someone wrapped a loop around it.
</p>

<p>The loop is only four steps, and it never varies:</p>

<ul>
	<li>Gather everything the model should see this turn, and send it.</li>
	<li>Read the reply. If it asked for a tool, run the tool.</li>
	<li>Fold the result into what the model will see next time.</li>
	<li>Go again, until there is nothing left to do.</li>
</ul>

<p>
	The code that runs that loop is the <em>harness</em>. It owns the state, it executes the tools,
	and it decides what the model is shown. The model is a function; the harness is the machine it
	sits in. Most of what you would call the agent's behaviour — its memory, its plan, its files, its
	sense of what to do next — lives out here, in ordinary code you can read.
</p>

<h2>Two facts force everything else</h2>

<p>
	<em>The model remembers nothing.</em> Every request starts from zero. When an agent seems to recall
	what you said ten minutes ago, that is the harness re-sending it. Continuity is a performance the harness
	puts on.
</p>

<p>
	<em>The context window is finite, and metered.</em> The harness has to re-send state every turn,
	it cannot send everything, and every token costs. So most of a good harness's cleverness goes into
	deciding what <em>not</em> to send. Nearly every chapter after this one is an answer to that one problem.
</p>

<img
	class="plate"
	src="{base}/book/01-harness-schematic.jpg"
	alt="Schematic of the loop: the context window — system prompt, skills, memory, files, plan, tools, messages — feeds the model; tool and subagent calls fan out and their results rejoin the context"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	This app runs a real harness — deepagents, built on LangChain and LangGraph, running entirely in
	your browser. The X-ray half never reaches into it: it only reads what the framework already
	publishes, so the agent is unmodified and has no idea it is being watched. Every number you are
	about to see is measured from the actual run, not illustrated.
</p>

<p class="live">
	See it live: the events and context tabs, to the left of this page — the loop as it actually ran,
	and the exact request the model was handed each turn.
</p>
