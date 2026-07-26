<img
	class="plate"
	src="/book/09-gates.jpg"
	alt="A conveyor stopped at a barrier while a human hand hovers over approve, edit and reject buttons"
	width="1536"
	height="1024"
	loading="lazy"
/>

<p>
	Some calls should not run just because the model asked. In this app two tools pause for a human by
	default: <em>present_outline</em>, because the outline steers everything after it, and
	<em>generate_image</em>, because it costs real money and produces something you may not want.
	Nothing else is gated, on principle — approving reads trains people to click approve without
	looking, which is worse than not asking.
</p>

<p>
	The mechanics are stranger than they look, and worth knowing exactly. When a gated call arrives,
	the approval layer raises an <em>interrupt</em>, and the stream simply <em>ends</em>. Nothing
	blocks; no promise is held open. The graph parks at its last checkpoint, and the run is over as
	far as the machinery is concerned. What keeps it resumable is persistence: the checkpoint holds
	everything the run had built, so answering the approval card starts a
	<em>second, complete invocation</em> — same thread, a resume command instead of a message — and the
	checkpointer supplies the rest. Without a checkpointer, human-in-the-loop cannot exist. That dependency
	runs one way only, and it is why persistence had to land in this app before gates could.
</p>

<p>
	Your decision is one of exactly three. <em>Approve</em> runs the call as written.
	<em>Edit</em> lets you rewrite the arguments first — the outline's sections can be reworded
	directly in the card — and the edited call runs as if the model had made it.
	<em>Reject</em> does not kill the run: your reason is returned to the model as the tool's result, and
	it reads it, adapts, and continues. A rejection is information, not an ejection.
</p>

<p>
	And once you have checkpoints, you have more than pauses. Every user message in this app remembers
	the checkpoint that preceded it, so editing an earlier message re-runs the graph from that exact
	state — files and plan restored to what they were, the discarded turns kept as an orphaned branch
	rather than deleted. Pause, resume, rewind: three features, one primitive.
</p>

<p class="live">
	See it live: the approval card in the conversation when a gated call fires, and the amber
	interrupt and resume rows on the events timeline.
</p>
