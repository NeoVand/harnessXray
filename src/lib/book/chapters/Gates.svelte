<svg
	class="d"
	viewBox="0 0 640 216"
	role="img"
	aria-label="A gated tool call interrupts the run: the stream ends, the graph parks at a checkpoint, and your approve, edit or reject decision resumes it as a second invocation"
>
	<defs>
		<marker
			id="bk-gt-a"
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
		<rect class="b" x="24" y="36" width="96" height="48" rx="3" />
		<text class="c" x="72" y="64">MODEL</text>
	</g>

	<g style="color: var(--hx-interrupt)">
		<path class="w" d="M120,60 H166" marker-end="url(#bk-gt-a)" />
		<rect class="b" x="170" y="36" width="140" height="48" rx="3" />
		<text class="m c" x="240" y="57">generate_image</text>
		<text class="m c" x="240" y="71">a gated call</text>
		<path class="g" d="M340,20 V130" />
		<text class="m" x="332" y="146">interrupt — the stream ends;</text>
		<text class="m" x="332" y="158">the graph parks at a checkpoint</text>
	</g>

	<path class="w" d="M340,40 H426" marker-end="url(#bk-gt-a)" />
	<rect class="b" x="430" y="24" width="186" height="32" rx="3" />
	<text x="442" y="38">APPROVE</text>
	<text class="m" x="442" y="50">runs exactly as written</text>

	<path class="w" d="M340,82 H426" marker-end="url(#bk-gt-a)" />
	<rect class="b" x="430" y="66" width="186" height="32" rx="3" />
	<text x="442" y="80">EDIT</text>
	<text class="m" x="442" y="92">your arguments run instead</text>

	<path class="w" d="M340,124 H426" marker-end="url(#bk-gt-a)" />
	<rect class="b" x="430" y="108" width="186" height="32" rx="3" />
	<text x="442" y="122">REJECT</text>
	<text class="m" x="442" y="134">your reason becomes the result</text>

	<path
		class="w"
		d="M523,140 V178 a10,10 0 0 1 -10,10 H82 a10,10 0 0 1 -10,-10 V88"
		marker-end="url(#bk-gt-a)"
	/>
	<text class="m c" x="300" y="206"
		>resume — a second invocation; the checkpoint supplies everything the first one built</text
	>
</svg>

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
