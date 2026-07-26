<img
	class="plate"
	src="/book/03-tools.jpg"
	alt="A small model figure points at a pegboard of instruments while the harness’s mechanical hands do the actual work"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	A <em>tool</em> is a function the model can ask the harness to run: a name, a description, a typed
	schema. The model never executes anything — it emits a request, the harness runs the function, and
	the result is appended to the context. Every schema rides along in <em>every</em> request, a standing
	cost you can watch in the context tab.
</p>

<p>
	Sixteen tools ride in this agent's requests and barely half were written for it — the paper craft
	(<em>search_papers</em>, <em>fetch_paper</em>, <em>cite</em>, <em>bibliography</em>,
	<em>extract_figures</em>) plus the gated <em>present_outline</em> and <em>generate_image</em>. The
	harness contributes the rest unasked: <em>write_todos</em>, the six file tools, and <em>task</em>.
	One rule worth stealing: these tools never throw — failures return as text the model can route
	around, because one thrown exception inside a parallel fan-out once killed a whole run.
</p>

<p class="live">
	See it live: tool rows on the events timeline — ochre for this app's, slate for the harness's —
	and the schemas band in the context tab.
</p>
