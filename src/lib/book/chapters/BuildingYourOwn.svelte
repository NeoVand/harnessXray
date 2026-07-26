<img
	class="plate"
	src="/book/10-build-your-own.jpg"
	alt="Hands stack blocks — folder, wrench, checklist, robot, manual, vault, ring, gate — into a tower crowned by a glowing brain"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Now compose. A deep agent is one assembly call handed the parts this book has named. A model. Your
	tools — here, nine of them around reading and citing papers. A prompt <em>prefix</em>: you write a
	page of method and rules, and the harness appends its own base prompt plus one fragment per
	middleware layer, which is why the prompt the model actually receives is several times longer than
	the one this app wrote. Subagents are plain descriptions — a name, a description the parent
	chooses by, a system prompt, a tool list, and optionally their own skills, middleware and gates.
	Skills are a directory of markdown. The backend decides where files live — graph state, a store,
	or a composite that routes by path. A checkpointer makes the whole thing persistent, resumable and
	rewindable, and interruptOn names the calls a human must see first.
</p>

<p>
	The harder part is the judgment this app encodes, and it transfers. Keep the expensive reading in
	subagents, so full texts die in a context you never pay for again. Make awareness push, not pull:
	the world-state layer exists because an agent that must remember to check what images exist will
	eventually regenerate one it already has. Let tools fail as text, because a thrown exception is a
	crashed run but a returned error is something the model can route around. Gate what is costly or
	steering — the outline, the image — and nothing that is merely a read. Give every subagent a reply
	contract, so delegation returns data instead of an essay. And write the order of work into the
	prompt while letting channels — plan, files — carry the state, because prose forgets and state
	does not.
</p>

<p>
	The last lesson is the instrument you are sitting in. Everything this book described was read from
	the wire and the graph's own channels; the agent was never modified and never knew. Build your own
	harness so it can be watched the same way — a harness you can inspect is one you can reason about,
	and one you can teach with.
</p>

<p class="live">
	See it live: the graph tab in the inspector — the assembled machine, drawn from the running graph
	itself.
</p>
