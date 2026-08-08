<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/06-skills.jpg"
	alt="A shelf of thin closed manuals, one pulled out open and glowing — a skill costs one line until it is read"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	A <em>skill</em> is a markdown file. That is the whole idea. No code, no registration, no deployment
	— a folder with a SKILL.md in it, written in prose, by anyone.
</p>

<p>
	The harness puts one line per skill into the system prompt: a name and a description. When the
	model decides a skill applies, it opens the file with the same <em>read_file</em> it uses for anything
	else, and only then pays for what is inside.
</p>

<p>
	That is <em>progressive disclosure</em>, and the arithmetic is why people love it. Twenty skills
	cost a few hundred tokens of table of contents. The doctrine inside them — thousands of words of
	hard-won instruction — costs nothing at all until the moment it is needed.
</p>

<h2>Three ship here</h2>

<ul>
	<li><em>arxiv-review</em> — how to actually review a body of papers.</li>
	<li><em>infographic</em> — how to brief an image well, learned by getting it wrong.</li>
	<li><em>skill-creator</em> — the recursive one: a skill for writing skills.</li>
</ul>

<p>
	Your own load exactly like these. There is no built-in tier and no privileged format; a skill you
	write this afternoon reaches the model the same way.
</p>

<img
	class="plate"
	src="{base}/book/06-skills-tech.jpg"
	alt="Schematic: one line per skill in the prompt; read_file(SKILL.md) loads the full instructions only when needed"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Using a skill is nearly invisible by design — it is just a <em>read_file</em> whose path happens to
	start with /skills/. That is why this app captions those rows on the timeline with the skill's name.
	Otherwise you would never catch the moment an agent picked up a manual and changed how it works.
</p>

<p class="live">
	See it live: the skills tab in the inspector, and the captioned skill reads on the events timeline
	the moment the agent opens one.
</p>
