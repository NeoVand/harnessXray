<img
	class="plate"
	src="/book/09-gates.jpg"
	alt="A conveyor stopped at a barrier while a human hand hovers over approve, edit and reject buttons"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Two tools pause for a human here — <em>present_outline</em> because it steers everything after,
	<em>generate_image</em> because it spends money — and nothing else, on principle: approving reads
	trains people to click without looking. The mechanics are stranger than they look: an interrupt
	does not block, the stream simply <em>ends</em>, the graph parks at its checkpoint, and your
	answer starts a <em>second, complete invocation</em>. Without a checkpointer, human-in-the-loop
	cannot exist.
</p>

<p>
	The decision is one of three: <em>approve</em> runs the call as written; <em>edit</em> rewrites
	the arguments first; <em>reject</em> returns your reason to the model as the tool's result — information,
	not ejection. And the same primitive gives more than pauses: every user message remembers its preceding
	checkpoint, so editing one re-runs the graph from that exact state. Pause, resume, rewind — three features,
	one mechanism.
</p>

<img
	class="plate"
	src="/book/09-gates-tech.jpg"
	alt="Schematic: a gated call stops at the interrupt, the checkpoint holds, and approve, edit or reject resumes a second invocation"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p class="live">
	See it live: the approval card in the conversation when a gated call fires, and the amber
	interrupt and resume rows on the events timeline.
</p>
