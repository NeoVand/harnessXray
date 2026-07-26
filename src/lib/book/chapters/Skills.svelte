<img
	class="plate"
	src="/book/06-skills.jpg"
	alt="A shelf of thin closed manuals, one pulled out open and glowing — a skill costs one line until it is read"
	width="1536"
	height="1024"
	loading="lazy"
/>

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
