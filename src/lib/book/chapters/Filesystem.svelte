<img
	class="plate"
	src="/book/02-filesystem.jpg"
	alt="Robots share one drawer of folders — /notes, /paper, /skills — passing pages in and out; the drawer is saved with the conversation"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	There is no disk. The filesystem is a <em>channel</em> — one field in the graph state, mapping
	paths to contents — which buys three properties a real disk would not: it is checkpointed with
	every step, so a rewind restores the files exactly; it is observable, which is how the files panel
	mirrors it without the agent's cooperation; and it is scoped to the thread, so a new chat starts
	clean. Six harness-supplied tools — <em>ls</em>, <em>read_file</em>, <em>write_file</em>,
	<em>edit_file</em>, <em>glob</em>, <em>grep</em> — are all the agent ever sees of it.
</p>

<p>
	Its purpose is keeping bulk out of the conversation: a fact in a file costs tokens once when read;
	the same fact in chat is re-sent every turn forever. Two seams matter. Paths under
	<em>/memories/</em> are routed to a store that outlives every thread — same tools, two lifetimes.
	And images are not here at all: they live in an asset store <em>ls</em> cannot see, behind the
	separate <em>list_figures</em> tool.
</p>

<img
	class="plate"
	src="/book/02-filesystem-tech.jpg"
	alt="Schematic: six file tools feed the files channel in graph state — checkpointed every step; /memories/ branches to the store; the asset store stands apart"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="live">
	See it live: the files tab in the inspector, and the sage fs rows on the events timeline — one per
	write, as the graph commits it.
</p>
