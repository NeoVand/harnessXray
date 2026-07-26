<svg
	class="d"
	viewBox="0 0 640 216"
	role="img"
	aria-label="The system prompt carries one line per skill; the full SKILL.md file is read with read_file only when the model decides it is relevant"
>
	<defs>
		<marker
			id="bk-sk-a"
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
		<rect class="b" x="24" y="32" width="270" height="118" rx="3" />
		<text x="36" y="52">SYSTEM PROMPT — THE SKILL LIST</text>
		<text class="m" x="36" y="74">arxiv-review — papers into a review</text>
		<text class="m" x="36" y="90">infographic — brief gpt-image-2 well</text>
		<text class="m" x="36" y="106">skill-creator — write a new skill</text>
		<text class="m" x="36" y="134">one line each · always in context</text>
	</g>

	<g style="color: var(--hx-fs)">
		<text class="m c" x="344" y="80">read_file — only when relevant</text>
		<path class="w" d="M294,90 H390" marker-end="url(#bk-sk-a)" />
		<rect class="b" x="394" y="28" width="222" height="126" rx="3" />
		<text class="m" x="406" y="48">/skills/arxiv-review/SKILL.md</text>
		<rect x="406" y="60" width="180" height="3" fill="currentColor" opacity="0.25" />
		<rect x="406" y="72" width="150" height="3" fill="currentColor" opacity="0.25" />
		<rect x="406" y="84" width="170" height="3" fill="currentColor" opacity="0.25" />
		<rect x="406" y="96" width="120" height="3" fill="currentColor" opacity="0.25" />
		<rect x="406" y="108" width="160" height="3" fill="currentColor" opacity="0.25" />
		<rect x="406" y="120" width="90" height="3" fill="currentColor" opacity="0.25" />
		<text class="m" x="406" y="142">the whole doctrine — paid for only if read</text>
	</g>

	<text class="m c" x="320" y="196"
		>twenty skills would cost a few hundred tokens — until one is needed</text
	>
</svg>

<p>
	A <em>skill</em> is a markdown file. That is the whole idea, and it is worth sitting with: no
	code, no registration, no deployment. The file lives at /skills/&lt;name&gt;/SKILL.md in the same
	virtual filesystem as everything else, with a frontmatter name and description. The harness puts
	only that name and description into the system prompt — one line per skill — and when the model
	decides a skill applies, it reads the file with the same <em>read_file</em> it uses for anything else,
	and only then pays for the instructions.
</p>

<p>
	This is <em>progressive disclosure</em>, and it is why a skill library can grow without the
	context growing with it. Twenty skills cost a few hundred tokens of listing; the doctrine inside
	them costs nothing until the moment it is needed. Compare that to stuffing the same material into
	the system prompt, where every word is re-sent and re-paid on every call of every conversation,
	relevant or not.
</p>

<p>
	Three skills ship with this app. <em>arxiv-review</em> carries the craft of reading papers into a
	citable review: the note format, the citation discipline, what not to cite.
	<em>infographic</em> carries the briefing doctrine for gpt-image-2 — exact words in quotes, name
	the quality bar, never dictate the design. <em>skill-creator</em> is the recursive one: it teaches the
	agent to write new skills, so a workflow you repeat twice can be captured as a file. You can also add
	your own from the skills sheet in this app, and it loads exactly like a built-in — nothing about the
	shipped ones is special-cased.
</p>

<p>
	Using a skill is almost invisible, and that is a lesson in itself. There is no use_skill tool to
	watch for. A skill being consulted is just a read_file whose path happens to start with /skills/ —
	so this app recognizes the path and captions the timeline row with the skill's name, because
	otherwise the cheapest capability mechanism in the harness would also be the one you can never see
	working.
</p>

<p class="live">
	See it live: the skills tab in the inspector, and the captioned skill reads on the events timeline
	the moment the agent opens one.
</p>
