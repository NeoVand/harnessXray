import { bus } from '$lib/xray/bus.svelte';
import { session } from '$lib/agent/session.svelte';
import { skills } from '$lib/agent/skills.svelte';
import { sources } from '$lib/agent/sources';
import { replay } from '$lib/xray/replay.svelte';
import { labComplete, sidecarReady } from './sidecar.svelte';
import { buildDigest } from './digest';

/**
 * Explain mode — the app explaining its own run.
 *
 * A lab-side model path, like the sidecar it borrows: plain fetch, never the
 * instrumented fetch, never the event bus, never the agent's thread. The agent
 * under observation stays unmodified and unaware; the tutor only ever reads
 * the digest, which is itself only a fold over what already happened.
 *
 * The transcript is page-lifetime by design — not persisted, not replayed to
 * any model, never in session.messages. A tutoring aside is scaffolding, and
 * scaffolding that survived the reload would start to look like the building.
 */

export interface TutorEntry {
	role: 'you' | 'lab';
	text: string;
	status: 'thinking' | 'done' | 'error';
}

/** What a student can always ask, before any run exists to point at. */
const STATIC_CHIPS = [
	'Walk me through this run',
	'How is the context window organized?',
	'What do the dashed edges in the graph mean?',
	'What did this run cost and why?'
] as const;

const TUTOR_PROMPT = `You are the tutor built into harnessXray, a lab that runs a real Deep Agents (LangChain/LangGraph) harness in the browser and dissects it live. The student flipped on Explain mode and is asking about the run they can see on screen right now. You are the app speaking, not the agent.

Below is the lab's own digest of the run, folded from the same event log the panels render. It is your complete ground truth. Never invent tools, events, files or costs that are not in it; if the digest cannot answer, say so plainly and point at where in the app to look instead.

%DIGEST%
%RECENT%
How to teach: a patient teacher, explaining in the order things actually happened. Use the real names in the digest — tools, subagents, skills, file paths — and anchor them to what the student can see ("you can see this as the ochre tool rows in the events timeline", "the run panel's ledger carries this number"). The first time a term of art appears, define it in one short clause. Short paragraphs. No headings. No bullet points unless you are listing steps.

For pointing at the interface: the left lens is the event timeline (colour-coded — teal for model traffic, ochre for tools, amber for pauses, sage for files, clay for memory) with a context lens beside it; the inspector on the right has detail/raw/files/memory tabs on top and plan/skills/graph below; the run panel holds the token and cost ledger.

The student asks: %QUESTION%`;

class Tutor {
	active = $state(false);
	transcript = $state<TutorEntry[]>([]);
	/** Chips already asked, greyed out rather than removed. */
	used = $state<string[]>([]);

	/**
	 * Suggested questions, folded from the same event log the panels render.
	 *
	 * Deterministic on purpose. An earlier version asked the sidecar to write
	 * these from the digest, and it wrote plausible quiz questions about the
	 * run's *story* — different every toggle, anchored to nothing on screen.
	 * But the chips' job is to teach the instruments, so they are built the way
	 * the instruments are: a fold over the bus, naming the tool the run
	 * actually leaned on, a middleware that actually ran, the panels the
	 * answer will point at. Free, instant, stable — and they work in replay,
	 * where the lab has no network by design.
	 */
	chips = $derived.by(() => this.#chipsFor());

	/** A question is out; the composer holds further ones until it lands. */
	get busy(): boolean {
		return this.transcript.at(-1)?.status === 'thinking';
	}

	toggle() {
		this.active = !this.active;
		if (this.active) this.used = [];
	}

	#chipsFor(): string[] {
		void bus.version;
		const events = bus.events;
		if (!events.some((e) => e.kind === 'run_start')) return [...STATIC_CHIPS];

		// One pass, everything the chips could want to name. Plain object and
		// array on purpose: these live for the length of the fold, not the UI.
		const calls: Record<string, number> = {};
		const nodes: string[] = [];
		let skill: string | undefined;
		let lane: string | undefined;
		let paused = false;
		let compacted = false;
		for (const e of events) {
			if (e.kind === 'tool_start') {
				calls[e.name] = (calls[e.name] ?? 0) + 1;
				skill ??= e.skill;
			} else if (e.kind === 'node') {
				if (!nodes.includes(e.nodeName)) nodes.push(e.nodeName);
			} else if (e.kind === 'interrupt') paused = true;
			else if (e.kind === 'compaction') compacted = true;
			lane ??= e.lane;
		}

		const chips = ['How is the context window organized?'];

		const top = Object.entries(calls).sort((a, b) => b[1] - a[1])[0]?.[0];
		if (top) chips.push(`Explain the ${top} tool calls`);

		// A middleware hook beats a bare node: its name is the lesson.
		const hook = nodes.find((n) => n.includes('.'))?.split('.')[0];
		const node = nodes.find((n) => n !== 'model_request') ?? nodes[0];
		if (hook) chips.push(`What does ${hook} do?`);
		else if (node) chips.push(`What happens at the ${node} node?`);

		chips.push('What do the dashed edges in the graph mean?');
		if (paused) chips.push('Why did the run pause for approval?');
		if (lane) chips.push(`Why does ${lane} get its own context?`);
		if (skill) chips.push(`How did the ${skill} skill get loaded?`);
		if (compacted) chips.push('What did the compaction fold away?');
		chips.push('What did this run cost and why?');
		return chips.slice(0, 6);
	}

	#digest(): string {
		return buildDigest(
			bus,
			{
				model: session.model,
				todos: session.todos,
				fileList: session.fileList,
				skillNames: skills.active.map((s) => s.name)
			},
			sources.all()
		);
	}

	/** The last exchanges, so "why?" has something to be about. */
	#recent(): string {
		const done = this.transcript.filter((e) => e.status === 'done');
		const tail = done.slice(-4);
		if (!tail.length) return '';
		const lines = tail.map((e) =>
			e.role === 'you'
				? `the student asked: ${e.text.slice(0, 300)}`
				: `you answered: ${e.text.slice(0, 500)}`
		);
		return `\nEarlier in this tutoring session:\n${lines.join('\n')}\n`;
	}

	async ask(question: string) {
		const q = question.trim();
		if (!q || this.busy) return;
		if (this.chips.includes(q) && !this.used.includes(q)) this.used = [...this.used, q];

		// Snapshot before the push, or the "earlier exchanges" section would
		// quote the very question the prompt already ends with.
		const recent = this.#recent();
		this.transcript.push({ role: 'you', text: q, status: 'done' });

		if (!sidecarReady()) {
			this.transcript.push({
				role: 'lab',
				status: 'error',
				text: replay.active
					? 'Replay has no network by design — the whole point is that the run replays from a recording — so the tutor cannot make its model call here. The per-event help tooltips still work; live explanations need a live run.'
					: 'The tutor needs an OpenAI key: each answer is one small luna call from this tab. Add one in settings (⌘,).'
			});
			return;
		}

		this.transcript.push({ role: 'lab', text: '', status: 'thinking' });
		// Mutate the proxy the array holds, not the plain object we pushed —
		// writes to the original would update state without notifying anyone.
		const entry = this.transcript[this.transcript.length - 1];

		// Function replacers throughout: the digest carries `$0.43` and a user
		// question can carry anything, and String.replace treats `$` as syntax.
		const prompt = TUTOR_PROMPT.replace('%DIGEST%', () => this.#digest())
			.replace('%RECENT%', () => recent)
			.replace('%QUESTION%', () => q);

		try {
			// Streamed into the entry as it arrives; the bubble grows live, the
			// same way the agent's do.
			const text = await labComplete(prompt, 1400, (partial) => {
				entry.text = partial;
			});
			entry.text = text || 'The model returned nothing. Ask again.';
			entry.status = text ? 'done' : 'error';
		} catch (e) {
			entry.status = 'error';
			entry.text = e instanceof Error ? e.message : String(e);
		}
	}
}

export const tutor = new Tutor();
