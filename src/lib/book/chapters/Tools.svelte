<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/03-tools.jpg"
	alt="A small model figure points at a pegboard of instruments while the harness’s mechanical hands do the actual work"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	A <em>tool</em> is a function the model is allowed to ask for by name. It has a name, a description,
	and a typed schema for its arguments — and that is the whole of what the model ever knows about it.
</p>

<p>
	The model cannot run anything. It writes down a request; the harness runs the actual function; the
	result comes back as another message in the conversation. What everyone calls "the model calling a
	tool" is really the harness reading a wish and granting it.
</p>

<p>
	That arrangement has a price you can watch. Every tool's schema rides along in <em>every</em>
	request, used or not. Sixteen tools is a standing cost on every single turn, and the context tab shows
	it as its own band.
</p>

<h2>Who wrote them?</h2>

<p>
	Barely half were written for this app. The paper craft is ours — <em>search_papers</em>,
	<em>fetch_paper</em>, <em>cite</em>, <em>bibliography</em>, <em>extract_figures</em> — plus
	<em>present_outline</em> and <em>generate_image</em>, the two that stop for your approval (chapter
	9). The harness contributes the rest without being asked: <em>write_todos</em>, the six file
	tools, and <em>task</em>.
</p>

<p>
	That ratio is normal, and it is rather the point of using a harness. You write the tools that are
	specific to your problem and inherit the ones every agent needs.
</p>

<img
	class="plate"
	src="{base}/book/03-tools-tech.jpg"
	alt="Schematic: the model emits a tool call, the harness executes it, the result rejoins the context; every schema re-sent with every request"
	width="1536"
	height="1024"
	loading="lazy"
/>

<h2>One rule worth stealing</h2>

<p>
	These tools never throw. When a download fails, the tool catches it and returns the words
	<em>ERROR: …</em> as its result. The model reads that like any other output and routes around it: retries,
	picks a different paper, moves on.
</p>

<p>
	We learned this the hard way. One thrown exception, inside a fan-out of five subagents all
	fetching at once, killed an entire run with a bare "Failed to fetch". A failure the model can read
	is a setback. An exception is a crash.
</p>

<p class="live">
	See it live: tool rows on the events timeline — ochre for this app's, slate for the harness's —
	and the schemas band in the context tab.
</p>
