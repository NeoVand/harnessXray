<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/02-filesystem.jpg"
	alt="Robots share one drawer of folders — /notes, /paper, /skills — passing pages in and out; the drawer is saved with the conversation"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	This agent writes notes, drafts and figures to files all day long. It also has no disk. Its
	filesystem is a single field in the graph's state: one map from paths to contents, sitting in
	memory next to the conversation.
</p>

<p>That sounds like a downgrade. It buys three things a real disk could not:</p>

<ul>
	<li>
		<em>It is saved with every step.</em> Rewind the conversation and the files rewind with it, exactly
		as they were.
	</li>
	<li>
		<em>It is observable.</em> The files panel mirrors it without the agent's cooperation — nothing is
		reported, the state is simply read.
	</li>
	<li>
		<em>It is scoped to this thread.</em> A new chat starts clean, with no cleanup to remember.
	</li>
</ul>

<p>
	The agent knows none of that. It sees six ordinary tools and nothing else: <em>ls</em>,
	<em>read_file</em>, <em>write_file</em>, <em>edit_file</em>, <em>glob</em> and <em>grep</em>.
</p>

<h2>Why files at all?</h2>

<p>
	To keep bulk out of the conversation. A fact written to a file costs tokens once, when something
	reads it back. The same fact typed into the chat is re-sent to the model on every turn after it,
	forever. Files are how an agent works with more material than fits in its head.
</p>

<img
	class="plate"
	src="{base}/book/02-filesystem-tech.jpg"
	alt="Schematic: six file tools feed the files channel in graph state — checkpointed every step; /memories/ branches to the store; the asset store stands apart"
	width="1536"
	height="1024"
	loading="lazy"
/>

<h2>Two seams worth knowing</h2>

<p>
	Paths under <em>/memories/</em> quietly go somewhere else: a store that outlives every thread. Same
	tools, two lifetimes — chapter 7 takes that apart.
</p>

<p>
	Images are not here at all. They live in a separate asset store that <em>ls</em> cannot see,
	behind a tool called <em>list_figures</em>. This trips people up: <em>ls /figures/</em> always
	comes back empty, even when the figures are real and on screen. An agent told to check its images
	with
	<em>ls</em> will confidently conclude they do not exist. Ours once deleted a perfectly good picture
	that way.
</p>

<p class="live">
	See it live: the files tab in the inspector, and the sage fs rows on the events timeline — one per
	write, as the graph commits it.
</p>
