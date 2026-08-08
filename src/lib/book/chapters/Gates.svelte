<script lang="ts">
	import { base } from '$app/paths';
</script>

<img
	class="plate"
	src="{base}/book/09-gates.jpg"
	alt="A conveyor stopped at a barrier while a human hand hovers over approve, edit and reject buttons"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="lead">
	Sometimes the right move is to stop and ask. This harness stops for exactly two tools:
	<em>present_outline</em>, because the outline steers everything that comes after it, and
	<em>generate_image</em>, because it spends real money.
</p>

<p>
	Nothing else, and that restraint is deliberate. An agent that asks permission to read a file
	trains you to click Approve without looking, which is worse than never asking. Gate what is
	expensive or steering; never gate a read.
</p>

<h2>What actually happens when it pauses</h2>

<p>
	The mechanics are stranger than the little card in the conversation suggests. The interrupt does
	not block and wait — the stream simply <em>ends</em>. The graph parks at its last checkpoint, and
	as far as the machinery is concerned the run is over. When you answer, a second, completely fresh
	invocation starts and picks up from that checkpoint.
</p>

<p>
	Which is why the checkpointer from chapter 7 is not optional. Without somewhere to park,
	human-in-the-loop cannot exist at all.
</p>

<h2>Three ways to answer</h2>

<ul>
	<li><em>approve</em> runs the call exactly as written.</li>
	<li><em>edit</em> lets you rewrite the arguments first, then runs it.</li>
	<li>
		<em>reject</em> hands your reason back to the model as the tool's result. It is information, not ejection
		— the model reads why you said no and tries something else.
	</li>
</ul>

<img
	class="plate"
	src="{base}/book/09-gates-tech.jpg"
	alt="Schematic: a gated call stops at the interrupt, the checkpoint holds, and approve, edit or reject resumes a second invocation"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	The same primitive buys more than pauses. Every message you send remembers the checkpoint that
	came before it, so editing an old message re-runs the graph from exactly that state. Pause,
	resume, rewind: three features, one mechanism.
</p>

<p class="live">
	See it live: the approval card in the conversation when a gated call fires, and the amber
	interrupt and resume rows on the events timeline.
</p>
