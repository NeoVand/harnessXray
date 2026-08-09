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
	request, used or not. Seventeen tools is a standing cost on every single turn — about eight thousand
	characters before anyone has typed a word — and the context tab shows it as its own band, before the
	first message and after every one that follows.
</p>

<h2>Who wrote them?</h2>

<p>
	About half were written for this app: the paper craft — <em>search_papers</em>,
	<em>fetch_paper</em>, <em>cite</em>, <em>bibliography</em>, <em>extract_figures</em>,
	<em>stylize_figure</em>, <em>list_figures</em> — plus <em>present_outline</em>, which stops for
	your approval, and <em>compact_context</em>. The harness contributes the other eight: the six file
	tools, <em>task</em>, and <em>write_todos</em>.
</p>

<p>
	That ratio is normal, and it is rather the point of using a harness. You write the tools that are
	specific to your problem and inherit the ones every agent needs.
</p>

<p>
	Inherit, but check. <em>write_todos</em> used to arrive free with the harness and no longer does — an
	upgrade moved it out of the defaults, and this app installs it itself now. Nothing broke loudly: the
	types were fine, the tests passed, the build was green, and the plan tab was simply empty for a week.
	A tool nobody has is a tool nobody calls. Chapter 4 tells that story.
</p>

<img
	class="plate"
	src="{base}/book/03-tools-tech.jpg"
	alt="Schematic: the model emits a tool call, the harness executes it, the result rejoins the context; every schema re-sent with every request"
	width="1536"
	height="1024"
	loading="lazy"
/>

<h2>Two rules worth stealing</h2>

<p>
	<em>Let tools fail as text.</em> These never throw. When a download fails, the tool catches it and
	returns the words <em>ERROR: …</em> as its result. The model reads that like any other output and routes
	around it: retries, picks a different paper, moves on.
</p>

<p>
	We learned this the hard way. One thrown exception, inside a fan-out of five subagents all
	fetching at once, killed an entire run with a bare "Failed to fetch". A failure the model can read
	is a setback. An exception is a crash.
</p>

<p>
	<em>Let tools refuse what they can check.</em> <em>cite</em> will not produce a citation for a
	paper this run never read — that much is bookkeeping. But hand it the sentence you are citing the
	paper
	<em>for</em>, and it searches the paper's real text for those words and refuses if they are not
	there. No model is consulted. "Does this paper contain this sentence" has a right answer, and
	asking a second model to judge it would be slower, dearer and less certain than looking.
</p>

<p>
	It refuses plausible things, which is the point. <q
		>SWE-bench demonstrates that language models now exceed human engineers</q
	> sounds like a finding from that paper and appears nowhere in it.
</p>

<p class="live">
	See it live: tool rows on the events timeline — ochre for this app's, slate for the harness's —
	and the schemas band in the context tab.
</p>
