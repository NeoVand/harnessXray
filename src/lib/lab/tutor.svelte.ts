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

/** What a student can always ask, whatever the run did. */
const STATIC_CHIPS = [
	'Walk me through this run',
	'Why did it pause for approval?',
	'What did the subagents do?',
	'What did this cost and why?'
] as const;

const CHIPS_PROMPT = `You are the tutor built into harnessXray, a lab that runs a real Deep Agents (LangChain/LangGraph) harness in the browser and dissects it live. Below is the lab's digest of the run currently on screen.

Write exactly 4 short questions a curious student might click to have THIS run explained — about a gate that fired, a subagent, a cost, a compaction, a loop, a file it wrote. Only ask about things the digest actually contains. One question per line. No numbering, no bullets, no quotes. Each under 8 words.

%DIGEST%`;

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
	chips = $state<string[]>([]);
	/** Chips already asked, greyed out rather than removed. */
	used = $state<string[]>([]);

	/** Guards a slow chip generation landing after the mode was toggled again. */
	#epoch = 0;

	/** A question is out; the composer holds further ones until it lands. */
	get busy(): boolean {
		return this.transcript.at(-1)?.status === 'thinking';
	}

	toggle() {
		this.active = !this.active;
		if (this.active) void this.#refreshChips();
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

	async #refreshChips() {
		const epoch = ++this.#epoch;
		this.used = [];
		// Static first, so there is something to click while the better set is
		// being written — and something left if it never arrives.
		this.chips = [...STATIC_CHIPS];
		if (!sidecarReady()) return;
		if (!bus.events.some((e) => e.kind === 'run_start')) return;
		try {
			const raw = await labComplete(
				CHIPS_PROMPT.replace('%DIGEST%', () => this.#digest()),
				500
			);
			const lines = raw
				.split('\n')
				.map((l) =>
					l
						.replace(/^["'\s\-*•\d.)]+/, '')
						.replace(/["']+$/, '')
						.trim()
				)
				.filter(Boolean)
				.filter((l) => l.split(/\s+/).length <= 10)
				.map((l) => l.slice(0, 80));
			if (epoch !== this.#epoch || !this.active) return;
			if (lines.length >= 4) this.chips = lines.slice(0, 4);
		} catch {
			/* the static set is already in place */
		}
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
			const text = await labComplete(prompt, 1400);
			entry.text = text || 'The model returned nothing. Ask again.';
			entry.status = text ? 'done' : 'error';
		} catch (e) {
			entry.status = 'error';
			entry.text = e instanceof Error ? e.message : String(e);
		}
	}
}

export const tutor = new Tutor();
