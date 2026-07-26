<img
	class="plate"
	src="/book/03-tools.jpg"
	alt="A small model figure points at a pegboard of instruments while the harness’s mechanical hands do the actual work"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	A <em>tool</em> is a function the model can ask the harness to run: a name, a description, and a typed
	schema for its arguments. The model never executes anything — it emits a request, the harness runs the
	function, and the result is appended to the context as a message. Every tool's full schema rides along
	in every request, which is why the tool list is one of the standing costs you can watch in the context
	tab.
</p>

<p>
	Sixteen tools ride in this agent's requests, and only eight of them were written for it. A ninth —
	generate_image — was written here too, but handed to a subagent instead of the main agent. The
	nine are the agent's actual craft, one honest sentence each:
</p>

<ul>
	<li>
		<em>search_papers</em> — searches the literature through OpenAlex and returns titles, authors, years,
		citation counts, arXiv ids and abstracts; deliberately cheap, so searching three ways is normal.
	</li>
	<li>
		<em>fetch_paper</em> — pulls one paper's full text, from the arXiv HTML edition when it exists and
		PDF extraction otherwise, and dictates the exact notes path to save to; expensive by design.
	</li>
	<li>
		<em>present_outline</em> — proposes the document's structure and pauses the run for your approval
		before any deep reading begins.
	</li>
	<li>
		<em>cite</em> — returns the canonical inline citation, and refuses any paper this run has not actually
		read; the refusal is the feature.
	</li>
	<li>
		<em>bibliography</em> — writes the References section from the source registry, not from recall.
	</li>
	<li>
		<em>extract_figures</em> — lifts a paper's real figures with their original captions; evidence, where
		a generated image would be decoration.
	</li>
	<li>
		<em>list_figures</em> — reports what the asset store actually holds, since ls cannot see images.
	</li>
	<li>
		<em>compact_context</em> — schedules the conversation to be folded into a summary the moment the turn
		ends.
	</li>
	<li>
		<em>generate_image</em> — briefs gpt-image-2 and saves the result under /figures/; only the image-smith
		subagent holds it, and it pauses for approval.
	</li>
</ul>

<p>
	The harness contributes the other eight without being asked: <em>write_todos</em> for the plan,
	the six filesystem tools, and <em>task</em>, which dispatches a subagent. A student looking at the
	raw request can verify that most of the tool list was never written by this app — which is the
	point of a harness.
</p>

<p>
	One design rule here is worth stealing: these tools never throw. A network failure comes back as
	text the model can read and route around, because a thrown exception inside a parallel subagent
	fan-out once killed entire runs with a bare "Failed to fetch".
</p>

<p class="live">
	See it live: tool rows on the events timeline — ochre for this app's, slate for the harness's —
	and the schemas band in the context tab.
</p>
