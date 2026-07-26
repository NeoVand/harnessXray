<img
	class="plate"
	src="/book/06-skills.jpg"
	alt="A shelf of thin closed manuals, one pulled out open and glowing — a skill costs one line until it is read"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	A <em>skill</em> is a markdown file — no code, no registration, no deployment. The harness puts
	one line per skill into the prompt (name and description), and when the model decides a skill
	applies, it reads the file with the same <em>read_file</em> it uses for anything else, paying for
	the instructions only then. That is <em>progressive disclosure</em>: twenty skills cost a few
	hundred tokens of listing; the doctrine inside them costs nothing until needed.
</p>

<p>
	Three ship here — <em>arxiv-review</em> (the review craft), <em>infographic</em> (the image
	briefing doctrine), <em>skill-creator</em> (the recursive one) — and your own load exactly like built-ins.
	Using one is nearly invisible by design: it is just a read_file whose path starts with /skills/, which
	is why this app captions those timeline rows with the skill's name.
</p>

<p class="live">
	See it live: the skills tab in the inspector, and the captioned skill reads on the events timeline
	the moment the agent opens one.
</p>
