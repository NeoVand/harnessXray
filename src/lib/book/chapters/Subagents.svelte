<svg
	class="d"
	viewBox="0 0 640 256"
	role="img"
	aria-label="The parent dispatches a subagent with one task call; the subagent reads the full paper inside its own context window and only a 200-word digest returns to the parent"
>
	<defs>
		<marker
			id="bk-sb-a"
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

	<text x="24" y="28">PARENT CONTEXT</text>
	<rect class="b" x="24" y="40" width="150" height="120" rx="3" />
	<rect x="36" y="58" width="126" height="5" fill="var(--hx-model)" opacity="0.55" />
	<rect x="36" y="70" width="126" height="5" fill="var(--hx-tool)" opacity="0.55" />
	<rect x="36" y="82" width="126" height="5" fill="var(--hx-fs)" opacity="0.55" />
	<rect x="36" y="94" width="126" height="5" fill="var(--hx-user)" opacity="0.55" />
	<text class="m" x="36" y="130">pays for the digest,</text>
	<text class="m" x="36" y="142">never the paper</text>

	<g style="color: var(--hx-subagent)">
		<text class="m c" x="226" y="92">task — one tool call</text>
		<path class="w" d="M174,100 H276" marker-end="url(#bk-sb-a)" />
		<rect class="b" x="280" y="32" width="200" height="136" rx="3" />
		<text x="292" y="52">SUBAGENT</text>
		<rect class="b" x="292" y="62" width="110" height="80" rx="3" />
		<rect x="300" y="74" width="94" height="5" fill="var(--hx-model)" opacity="0.55" />
		<rect x="300" y="86" width="94" height="5" fill="var(--hx-tool)" opacity="0.55" />
		<rect x="300" y="98" width="94" height="5" fill="var(--hx-fs)" opacity="0.55" />
		<rect x="300" y="110" width="94" height="5" fill="var(--hx-user)" opacity="0.55" />
		<text class="m" x="292" y="158">its own window · its own tools</text>
	</g>

	<g style="color: var(--hx-fs)">
		<rect class="b" x="540" y="48" width="76" height="56" rx="3" />
		<text class="m c" x="578" y="70">the full</text>
		<text class="m c" x="578" y="82">paper</text>
		<text class="m c" x="578" y="94">~40k tokens</text>
		<path class="w" style="stroke-width: 3" d="M540,76 H486" marker-end="url(#bk-sb-a)" />
	</g>

	<path
		class="w"
		d="M380,168 V196 a10,10 0 0 1 -10,10 H110 a10,10 0 0 1 -10,-10 V166"
		marker-end="url(#bk-sb-a)"
	/>
	<text class="m c" x="250" y="222">a 200-word digest — the only thing that comes back</text>

	<text class="m c" x="320" y="246" style="fill: var(--hx-subagent)"
		>paper-reader · image-smith · report-writer · critic</text
	>
</svg>

<p>
	The harness's <em>task</em> tool dispatches a <em>subagent</em>: a complete agent run inside a
	single tool call, with its own context window, its own tools, its own system prompt. The parent's
	transcript does not come along, and nothing the subagent does enters the parent's context — except
	its final reply. That asymmetry is the entire point. A paper-reader can burn forty thousand tokens
	digesting a full paper; the parent pays for the two hundred it hands back. The X-ray shows both
	numbers, which turns the compression from a claim into a fact.
</p>

<p>This app defines four, and each one's reply is a contract, not a courtesy:</p>

<ul>
	<li>
		<em>paper-reader</em> reads exactly one arXiv paper, writes structured notes to /notes/, and may extract
		up to two of its real figures. It returns at most 200 words — the paper's claim, what it actually
		demonstrates, one caveat — plus a line naming each extracted figure. Several run in parallel.
	</li>
	<li>
		<em>image-smith</em> is an art director: it writes the actual gpt-image-2 brief and calls generate_image,
		which pauses for your approval — on the prompt the subagent wrote, not the vague request the parent
		delegated. It returns the saved path and one sentence.
	</li>
	<li>
		<em>report-writer</em> assembles the final review from the notes: every citation obtained from the
		cite tool, the References section taken from bibliography verbatim, figures placed where they earn
		their keep. It returns the path and a one-line description of the structure.
	</li>
	<li>
		<em>critic</em> checks the finished draft against the notes and the source registry on a hard budget
		of six tool calls, and returns either the single word CLEAN or a numbered list of violations, worst
		first.
	</li>
</ul>

<p>
	They coordinate through the filesystem, not through conversation: notes a reader writes are files
	the writer reads. And one configuration lesson learned the hard way here — custom subagents
	inherit nothing. Each of the four names its skills directory explicitly, because a subagent that
	is never told skills exist cannot read one, even when its prompt says to.
</p>

<p class="live">
	See it live: the subagent lanes on the events timeline — the dispatch, everything it did in its
	own window, and the one summary that returned.
</p>
