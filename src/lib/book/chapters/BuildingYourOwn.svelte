<svg
	class="d"
	viewBox="0 0 640 262"
	role="img"
	aria-label="Nine parts — model, tools, prompt, skills, checkpointer, subagents, filesystem, store, gates — feed one assembly call that returns the loop"
>
	<defs>
		<marker
			id="bk-by-a"
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

	<g style="color: var(--hx-model)">
		<rect class="b" x="24" y="20" width="120" height="30" rx="3" />
		<text class="c" x="84" y="39">MODEL</text>
	</g>
	<g style="color: var(--hx-tool)">
		<rect class="b" x="24" y="60" width="120" height="30" rx="3" />
		<text class="c" x="84" y="79">TOOLS</text>
	</g>
	<g style="color: var(--hx-model)">
		<rect class="b" x="24" y="100" width="120" height="30" rx="3" />
		<text class="c" x="84" y="119">PROMPT PREFIX</text>
	</g>
	<g style="color: var(--hx-tool)">
		<rect class="b" x="24" y="140" width="120" height="30" rx="3" />
		<text class="c" x="84" y="159">SKILLS</text>
	</g>
	<g style="color: var(--hx-state)">
		<rect class="b" x="24" y="180" width="120" height="30" rx="3" />
		<text class="c" x="84" y="199">CHECKPOINTER</text>
	</g>

	<g style="color: var(--hx-subagent)">
		<rect class="b" x="168" y="40" width="120" height="30" rx="3" />
		<text class="c" x="228" y="59">SUBAGENTS</text>
	</g>
	<g style="color: var(--hx-fs)">
		<rect class="b" x="168" y="80" width="120" height="30" rx="3" />
		<text class="c" x="228" y="99">FILESYSTEM</text>
	</g>
	<g style="color: var(--hx-memory)">
		<rect class="b" x="168" y="120" width="120" height="30" rx="3" />
		<text class="c" x="228" y="139">STORE</text>
	</g>
	<g style="color: var(--hx-interrupt)">
		<rect class="b" x="168" y="160" width="120" height="30" rx="3" />
		<text class="c" x="228" y="179">GATES</text>
	</g>

	<path class="w" d="M144,35 H330" />
	<path class="w" d="M144,75 H330" />
	<path class="w" d="M144,115 H330" />
	<path class="w" d="M144,155 H330" />
	<path class="w" d="M144,195 H330" />
	<path class="w" d="M288,55 H330" />
	<path class="w" d="M288,95 H330" />
	<path class="w" d="M288,135 H330" />
	<path class="w" d="M288,175 H330" />
	<path class="w" d="M330,30 V200" />
	<path class="w" d="M330,115 H356" marker-end="url(#bk-by-a)" />

	<rect class="b" x="360" y="52" width="256" height="140" rx="3" />
	<text class="c" x="488" y="76">THE DEEP AGENT — A LOOP</text>
	<rect class="b" x="380" y="92" width="58" height="64" rx="3" />
	<rect x="388" y="102" width="42" height="4" fill="var(--hx-model)" opacity="0.55" />
	<rect x="388" y="112" width="42" height="4" fill="var(--hx-tool)" opacity="0.55" />
	<rect x="388" y="122" width="42" height="4" fill="var(--hx-fs)" opacity="0.55" />
	<rect x="388" y="132" width="42" height="4" fill="var(--hx-memory)" opacity="0.55" />
	<path class="w" d="M438,118 H464" marker-end="url(#bk-by-a)" />
	<g style="color: var(--hx-model)">
		<rect class="b" x="468" y="100" width="58" height="36" rx="3" />
		<text class="m c" x="497" y="121">model</text>
	</g>
	<path class="w" d="M526,118 H548" marker-end="url(#bk-by-a)" />
	<g style="color: var(--hx-tool)">
		<rect class="b" x="552" y="106" width="26" height="24" rx="3" />
	</g>
	<path
		class="w"
		d="M565,130 V162 a8,8 0 0 1 -8,8 H417 a8,8 0 0 1 -8,-8 V160"
		marker-end="url(#bk-by-a)"
	/>

	<text class="m c" x="320" y="246"
		>one call assembles it — every chapter of this book was a parameter</text
	>
</svg>

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
