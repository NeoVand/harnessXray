<img
	class="plate"
	src="/book/01-the-harness.jpg"
	alt="A luminous loop: envelopes travel from the model past tool stations and return transformed — the harness is the loop"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	An agent is not a smarter model. It is a loop wrapped around an ordinary one: assemble everything
	the model should see, send it, run whatever tools the reply asked for, fold the results back in,
	and go again until there is nothing left to do. The code that runs this loop — that owns the
	state, executes the tools, and decides what the model is shown — is the
	<em>harness</em>. The model is a function; the harness is the machine it sits in.
</p>

<p>
	Two facts force the whole machinery of this book into existence. The model is <em>stateless</em> —
	every appearance of continuity is the harness re-presenting state it kept itself — and the context
	is <em>finite and metered</em>, so a serious harness spends most of its cleverness deciding what
	not to send. This app runs a real one — deepagents, on LangChain and LangGraph, entirely in your
	browser — and the X-ray half only reads what the framework already publishes: every number here is
	a measurement, not an illustration.
</p>

<img
	class="plate"
	src="/book/01-harness-schematic.jpg"
	alt="Schematic of the loop: the context window — system prompt, skills, memory, files, plan, tools, messages — feeds the model; tool and subagent calls fan out and their results rejoin the context"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="live">
	See it live: the events and context tabs to the left of this page — the loop as it actually ran,
	and the exact request each turn was fed.
</p>
