<svg
	class="d"
	viewBox="0 0 640 236"
	role="img"
	aria-label="The model asks for tools by name; nine were written for this agent and eight more came with the harness, and every schema is re-sent with every request"
>
	<defs>
		<marker
			id="bk-tl-a"
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
		<rect class="b" x="24" y="88" width="104" height="56" rx="3" />
		<text class="c" x="76" y="112">MODEL</text>
		<text class="m c" x="76" y="127">asks by name</text>
	</g>

	<path class="w" d="M128,100 H226" marker-end="url(#bk-tl-a)" />
	<path
		class="w"
		d="M128,116 H204 a10,10 0 0 1 10,10 V176 a10,10 0 0 0 10,10 H514 a10,10 0 0 0 10,-10 V154"
		marker-end="url(#bk-tl-a)"
	/>

	<g style="color: var(--hx-tool)">
		<rect class="b" x="230" y="20" width="180" height="140" rx="3" />
		<text x="242" y="38">WRITTEN FOR THIS AGENT</text>
		<text class="m" x="242" y="56">search_papers</text>
		<text class="m" x="242" y="68">fetch_paper</text>
		<text class="m" x="242" y="80">present_outline</text>
		<text class="m" x="242" y="92">cite</text>
		<text class="m" x="242" y="104">bibliography</text>
		<text class="m" x="242" y="116">extract_figures</text>
		<text class="m" x="242" y="128">list_figures</text>
		<text class="m" x="242" y="140">compact_context</text>
		<text class="m" x="242" y="152">generate_image · subagent-only</text>
	</g>

	<g style="color: var(--hx-state)">
		<rect class="b" x="440" y="20" width="176" height="130" rx="3" />
		<text x="452" y="38">THE HARNESS SUPPLIES</text>
		<text class="m" x="452" y="56">write_todos</text>
		<text class="m" x="452" y="68">ls</text>
		<text class="m" x="452" y="80">read_file</text>
		<text class="m" x="452" y="92">write_file</text>
		<text class="m" x="452" y="104">edit_file</text>
		<text class="m" x="452" y="116">glob</text>
		<text class="m" x="452" y="128">grep</text>
		<text class="m" x="452" y="140">task</text>
	</g>

	<text class="m c" x="320" y="226">every schema above is re-sent with every single request</text>
</svg>

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
