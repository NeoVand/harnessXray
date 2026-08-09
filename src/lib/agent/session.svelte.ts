import { browser } from '$app/environment';
import { bus } from '$lib/xray/bus.svelte';
import { runTotals } from '$lib/xray/usage';
import { idb } from '$lib/storage/idb';
import { resetInProgress } from '$lib/storage/reset';
import type { XrayEvent } from '$lib/xray/events';
import { makeModel, INPUT_LIMIT, COMPACT_AT, type ModelId } from './models';
import { keys } from '$lib/state/keys.svelte';
import { AGENT_TOOLS } from './tools';
import { SUBAGENTS } from './subagents';
import { SYSTEM_PROMPT } from './prompt';
import { skills, SKILLS_ROOT, skillPath, skillReadIn } from './skills.svelte';
import { compactRequest, compactThread } from './compaction';
import { todoListMiddleware } from 'langchain';
import { worldStateMiddleware } from './awareness';
import { oneGatePerTurnMiddleware } from './one-gate';
import { manifest, type Attachment } from './uploads';
import { assets, setAssetScope } from '$lib/storage/assets.svelte';
import { sources } from './sources';
import { setPaperScope, paperText } from './paper-text';
import { replay } from '$lib/xray/replay.svelte';
import type { Todo, ToolStart as ToolStartEvent } from '$lib/xray/events';
import type { IdbStore, IdbCheckpointSaver } from './persistence';
import { EVICT_DEFAULT_TOKENS } from './eviction';
import { emptyLanes, laneName, sealLanes } from './lanes';
import {
	DEFAULT_INTERRUPT_ON,
	type Decision,
	type HITLRequest,
	type HITLResponse,
	type Pending
} from './hitl';

/**
 * One conversation, one agent, one event log.
 *
 * The agent still has no idea it is observed — nothing here is passed *into*
 * the harness. Everything below reads what LangGraph already publishes on its
 * stream: `messages` for token and tool-call deltas, `updates` for each node's
 * committed state. The harness's own channels (`todos`, `files`) come through
 * `updates` for free, which is why the todo list and virtual filesystem can be
 * mirrored without the agent cooperating.
 */

export interface ToolCall {
	id: string;
	name: string;
	args: unknown;
	result?: string;
	status: 'running' | 'done' | 'error';
	/** False when the harness supplied the tool rather than us. */
	ours: boolean;
}

export interface ChatMessage {
	id: string;
	/**
	 * `notice` is neither party speaking — it marks something the harness did to
	 * the conversation itself, like folding the earlier half into a summary. It
	 * belongs in the flow, because it happened at a point in the flow, but it is
	 * not a turn and is never replayed to the model.
	 */
	role: 'user' | 'assistant' | 'notice';
	text: string;
	/** A file the notice refers to, e.g. an archived transcript. */
	noticePath?: string;
	/**
	 * The graph checkpoint as it stood *before* this turn ran — the state of the
	 * world in which this message does not yet exist. Editing the message
	 * re-runs from here, which is why it must be captured before the send and
	 * not after it. Only meaningful on user messages.
	 */
	baseCheckpointId?: string;
	/** Where this turn starts in the event log, so a rewind can trim it. */
	busSeq?: number;
	toolCalls: ToolCall[];
	streaming?: boolean;
	/**
	 * What this turn actually cost, accumulated across resumes.
	 *
	 * Read from the wire's usage objects — the same fold the Run panel uses —
	 * as a before/after delta around the drive. On the message rather than
	 * derived at render time, because the log is capped and pruned while a
	 * receipt should survive its own evidence.
	 */
	usage?: {
		input: number;
		cached: number;
		output: number;
		costUsd: number;
		ms: number;
		calls: number;
	};
	/**
	 * Files sent with this message.
	 *
	 * Kept beside the text rather than inside it. The model is told about them in
	 * prose — it has to be, that is the only channel it reads — but repeating
	 * that prose to the person who just attached the file is noise, and it made
	 * their own message unreadable.
	 */
	attachments?: { kind: string; name: string; path: string; chars: number }[];
}

export interface ThreadSummary {
	id: string;
	title: string;
	updated: number;
	messages: number;
	/** True once the sidecar has named this thread; the fallback stops overwriting it. */
	titled?: boolean;
}

export type RunStatus = 'idle' | 'running' | 'error';

/** Which tools we wrote, so the UI can mark the rest as the harness's own. */
const OUR_TOOLS: ReadonlySet<string> = new Set<string>(AGENT_TOOLS.map((t) => t.name));
const THREADS_KEY = 'hx:threads';

/**
 * The runaway-loop guard, not a work budget.
 *
 * LangGraph counts super-steps, and in this stack every middleware hook is
 * one — a single model→tools cycle costs several. The old 60 was ~a dozen
 * cycles, which starved a two-page review mid-poster after five honest
 * minutes. 250 is roughly fifty cycles: beyond any legitimate run seen so
 * far, still finite the day a loop actually runs away. Tunable in settings;
 * hitting it pauses with a Continue button rather than erroring, because the
 * checkpoint holds everything and resuming is one null-input invoke.
 */
const DEFAULT_STEP_CEILING = 250;
const CEILING_KEY = 'hx:step-ceiling';
const EVICT_KEY = 'hx:evict-tokens';

/** Pull display text from a message chunk. v1 content is typed blocks, not a string. */
function textOf(msg: Record<string, unknown>): string {
	if (typeof msg.text === 'string' && msg.text) return msg.text;
	const content = msg.content;
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.map((b) =>
			b && typeof b === 'object' && (b as { type?: string }).type === 'text'
				? ((b as { text?: string }).text ?? '')
				: ''
		)
		.join('');
}

class Session {
	messages = $state<ChatMessage[]>([]);
	status = $state<RunStatus>('idle');
	error = $state('');
	model = $state<ModelId>('gpt-5.6-terra');

	/** Mirrors of the harness's own state channels. */
	todos = $state<Todo[]>([]);
	files = $state<Record<string, string>>({});

	threadId = $state('t1');
	threads = $state<ThreadSummary[]>([]);

	agentVersion = $state(0);

	/** The run is paused, waiting on a human. */
	pending = $state<Pending | null>(null);
	/** Which tools pause for approval. Rebuilds the agent when changed. */
	interruptOn = $state<Record<string, boolean>>({ ...DEFAULT_INTERRUPT_ON });

	/** Files staged in the composer, not yet sent. */
	attachments = $state<Attachment[]>([]);
	/** True while a compaction is folding the history up. */
	compacting = $state(false);
	/** Super-step budget per invocation — the runaway guard, user-tunable. */
	stepCeiling = $state(DEFAULT_STEP_CEILING);
	/**
	 * Tool-result size, in tokens, past which the filesystem middleware parks the
	 * result in a file and hands the model a pointer instead.
	 *
	 * Exposed because at the framework default (20,000 tokens, ~80KB) it never
	 * fires here — our own `fetch_paper` caps at 60,000 chars — so a real harness
	 * behaviour sat armed and undemonstrable. Turn it down and the next paper
	 * evicts, in front of the class. See eviction.ts.
	 */
	evictTokens = $state(EVICT_DEFAULT_TOKENS);
	/**
	 * The last run stopped without finishing, and a Continue resumes it.
	 * 'ceiling' is the step guard; 'network' is a dropped connection mid-run.
	 * Either way the checkpoint holds everything and resuming is one
	 * null-input invoke — the difference is only what the card should say.
	 */
	stalled = $state<'' | 'ceiling' | 'network'>('');

	#agent: unknown = null;
	#agentKey = '';
	/** The skill library (names and bodies) the timeline last reported, so it only reports changes. */
	#skillsSeen = '';
	/** Emitted tool_start rows, so streamed arguments can be folded back in. */
	#toolStarts = new Map<string, ToolStartEvent>();
	/** Subgraph namespace → subagent name, paired as dispatches are seen. See lanes.ts. */
	#lanes = emptyLanes();

	/** Every dispatch on the transcript, oldest first. */
	*#dispatches() {
		for (const m of this.messages) for (const t of m.toolCalls) yield t;
	}

	#sealLanes() {
		sealLanes(this.#lanes, this.#dispatches());
	}
	/**
	 * The last plan written in each namespace, so a revision is diffed against
	 * the list it actually replaced rather than against whoever wrote last.
	 */
	#planBy = new Map<string, Todo[]>();
	#shape: unknown = null;
	#n = 0;
	#abort: AbortController | null = null;
	/** Threads whose history the live checkpointer already holds. */
	#seeded = new Set<string>();
	/**
	 * Long-term memory. Outlives every thread, so it is created once and
	 * deliberately NOT cleared by newThread() — that is the difference between
	 * it and the checkpointer.
	 */
	#store: IdbStore | undefined = undefined;
	#checkpointer: IdbCheckpointSaver | undefined = undefined;

	constructor() {
		if (browser) {
			this.#loadThreads();
			// Binaries are per-thread; point the store at whichever we restored.
			setAssetScope(this.threadId);
			sources.setScope(this.threadId);
			setPaperScope(this.threadId);
			const stored = Number(localStorage.getItem(CEILING_KEY));
			if (Number.isFinite(stored) && stored >= 50) this.stepCeiling = Math.min(stored, 2000);
			const evict = Number(localStorage.getItem(EVICT_KEY));
			if (Number.isFinite(evict) && evict >= 500) this.evictTokens = Math.min(evict, 200_000);
		}
	}

	setStepCeiling(n: number) {
		this.stepCeiling = Math.max(50, Math.min(2000, Math.round(n) || DEFAULT_STEP_CEILING));
		if (browser) localStorage.setItem(CEILING_KEY, String(this.stepCeiling));
	}

	setEvictTokens(n: number) {
		this.evictTokens = Math.max(500, Math.min(200_000, Math.round(n) || EVICT_DEFAULT_TOKENS));
		if (browser) localStorage.setItem(EVICT_KEY, String(this.evictTokens));
	}

	/**
	 * Pick the run back up after the step ceiling stopped it.
	 *
	 * Nothing needs repairing: the checkpoint holds every completed super-step,
	 * and a null-input invocation tells LangGraph to proceed from exactly there.
	 * The same mechanism resume() uses for interrupts, minus the Command.
	 */
	async continueRun() {
		if (this.busy || !this.stalled) return;
		const why = this.stalled;
		this.stalled = '';
		this.error = '';
		bus.emit({
			kind: 'note',
			scope: 'main',
			message:
				why === 'ceiling'
					? `continued past the step ceiling (${this.stepCeiling})`
					: 'continued after a network failure',
			label: 'continue'
		});
		await this.#drive(null);
	}

	get busy() {
		return this.status === 'running';
	}

	get fileList() {
		return Object.keys(this.files).sort();
	}

	/** Mirror of the long-term store, for the Memory panel. */
	memories = $state<{ key: string; value: unknown }[]>([]);

	/**
	 * Read the Store directly.
	 *
	 * The Store is not part of graph state, so nothing about it appears on the
	 * `updates` stream — unlike `files` and `todos`, which we get for free. It
	 * has to be polled, and that asymmetry is itself the lesson: state is
	 * observable because the graph owns it; the store is not because it does not.
	 */
	async refreshMemories() {
		if (!this.#store) return;
		try {
			this.memories = this.#store.snapshot().map((i) => ({ key: i.key, value: i.value }));
		} catch {
			this.memories = [];
		}
	}

	// ── threads ──────────────────────────────────────────────────────────────

	#loadThreads() {
		try {
			this.threads = JSON.parse(localStorage.getItem(THREADS_KEY) ?? '[]');
		} catch {
			this.threads = [];
		}
		const last = this.threads[0];
		if (last) {
			this.threadId = last.id;
			this.#restore(last.id);
			// The reload that started this page session. Every dispatch that came
			// back with the transcript belongs to a run we did not watch, so none
			// of them can claim a namespace we are about to see.
			this.#sealLanes();
		}
	}

	#persist() {
		if (!browser) return;
		// A factory reset has wiped storage and is about to reload. The pagehide
		// flush still calls this on the way out, and writing now would resurrect
		// the very state the user just erased.
		if (resetInProgress.value) return;
		const first = this.messages.find((m) => m.role === 'user')?.text ?? 'New chat';
		// A sidecar-generated title survives; the first-message fallback is only
		// for threads nothing has named yet.
		const prior = this.threads.find((t) => t.id === this.threadId);
		const summary: ThreadSummary = {
			id: this.threadId,
			title: prior?.titled ? prior.title : first.slice(0, 60),
			titled: prior?.titled ?? false,
			updated: Date.now(),
			messages: this.messages.length
		};
		this.threads = [summary, ...this.threads.filter((t) => t.id !== this.threadId)].slice(0, 30);
		localStorage.setItem(THREADS_KEY, JSON.stringify(this.threads));
		localStorage.setItem(
			`hx:thread:${this.threadId}`,
			JSON.stringify({ messages: this.messages, todos: this.todos, files: this.files })
		);
		// The event log goes to IndexedDB, not localStorage — it is megabytes, and
		// localStorage caps at ~5MB for the whole origin.
		void idb.set(`events:${this.threadId}`, bus.snapshot());
	}

	#restore(id: string) {
		try {
			const raw = localStorage.getItem(`hx:thread:${id}`);
			if (!raw) return;
			const data = JSON.parse(raw);
			this.todos = data.todos ?? [];
			this.files = data.files ?? {};

			// Renumber on the way in, rather than trusting the stored ids.
			//
			// A duplicate key in a keyed {#each} does not degrade gracefully — it
			// throws during mount and takes the entire app down with it, so a
			// blank screen is the failure mode. Earlier builds minted ids from a
			// counter that reset to 0 on load while restoring messages that
			// already used m1, m2…, which wrote collisions into localStorage that
			// then bricked every subsequent load. Reassigning here is both the
			// repair for that stored data and a guarantee it cannot recur,
			// whatever ends up in storage.
			const restored: ChatMessage[] = data.messages ?? [];
			this.messages = restored.map((m, i) => ({ ...m, id: `m${i + 1}`, streaming: false }));
			this.#n = this.messages.length;

			// Bring the timeline back too, so it does not look like it reset itself.
			void idb.get<XrayEvent[]>(`events:${id}`).then((events) => {
				if (events?.length && this.threadId === id) bus.hydrate(events);
			});
		} catch {
			/* a corrupt thread should not brick the app */
		}
	}

	openThread(id: string) {
		if (this.busy) return;
		this.threadId = id;
		setAssetScope(id);
		sources.setScope(id);
		setPaperScope(id);
		replay.resetWebRecording();
		if (replay.active) replay.rewindServing();
		this.#agent = null; // a thread is a checkpoint scope; don't carry state across
		this.messages = [];
		this.todos = [];
		this.files = {};
		this.#n = 0;
		this.pending = null;
		this.stalled = '';
		// Anything staged in the composer belongs to the conversation you staged
		// it for, not to the next one.
		this.attachments = [];
		// A cleared timeline should report the skill set again — it is the first
		// thing that happens in a run, and it is not "unchanged" to a blank log.
		this.#skillsSeen = '';
		this.#toolStarts.clear();
		this.#planBy.clear();
		bus.clear();
		this.#restore(id); // re-seeds #n past the restored ids
		// After the restore, so it seals THIS thread's dispatches rather than the
		// ones we just navigated away from.
		this.#sealLanes();
	}

	newThread() {
		if (this.busy) return;
		this.threadId = `t${Date.now().toString(36)}`;
		setAssetScope(this.threadId);
		sources.setScope(this.threadId);
		setPaperScope(this.threadId);
		replay.resetWebRecording();
		if (replay.active) replay.rewindServing();
		this.#agent = null;
		this.messages = [];
		this.todos = [];
		this.files = {};
		this.#n = 0;
		this.pending = null;
		this.stalled = '';
		// Anything staged in the composer belongs to the conversation you staged
		// it for, not to the next one.
		this.attachments = [];
		this.error = '';
		this.status = 'idle';
		this.#skillsSeen = '';
		this.#toolStarts.clear();
		this.#planBy.clear();
		bus.clear();
		this.#sealLanes();
	}

	stop() {
		this.#abort?.abort();
	}

	/**
	 * Forget one chat.
	 *
	 * Three stores hold a piece of it — the summary list, the messages, and the
	 * event log — so all three go, or the history shrinks while the disk does
	 * not. Deleting the chat you are in lands you on a fresh one rather than on
	 * a thread whose contents were just removed.
	 */
	deleteThread(id: string) {
		if (this.busy) return;
		this.threads = this.threads.filter((t) => t.id !== id);
		if (browser) {
			localStorage.setItem(THREADS_KEY, JSON.stringify(this.threads));
			localStorage.removeItem(`hx:thread:${id}`);
			void idb.del(`events:${id}`);
			// Its figures and PDFs go too, or the disk grows forever while the
			// history shrinks.
			void assets.dropThread(id);
			sources.drop(id);
			void paperText.drop(id);
		}
		if (id === this.threadId) this.newThread();
	}

	// ── the agent ────────────────────────────────────────────────────────────

	/**
	 * An agent built only to be *looked at* — the graph before a run exists.
	 *
	 * It takes no key, because compiling a graph never calls a model. What it
	 * must take is everything that changes the graph's SHAPE: the skills
	 * directory, the gated tools and our own middleware all add nodes, and a
	 * drawing that omits them is a drawing of a different agent. It used to omit
	 * all three, so the topology quietly simplified whenever no run had happened
	 * yet — after a reload the middleware after the model just vanished, which
	 * looks exactly like a bug and was in fact a lie.
	 *
	 * No backend, store or checkpointer: those decide where state LIVES, not what
	 * the graph looks like, and building them here would mean touching IndexedDB
	 * to draw a picture.
	 */
	async peekAgent(): Promise<unknown> {
		if (this.#agent) return this.#agent;
		if (this.#shape) return this.#shape;
		const { createDeepAgent } = await import('deepagents/browser');
		this.#shape = await createDeepAgent({
			model: `openai:${this.model}`,
			tools: AGENT_TOOLS,
			systemPrompt: SYSTEM_PROMPT,
			subagents: SUBAGENTS as never,
			skills: [SKILLS_ROOT],
			middleware: [todoListMiddleware(), worldStateMiddleware, oneGatePerTurnMiddleware] as never,
			interruptOn: this.interruptOn
		});
		return this.#shape;
	}

	async #ensureAgent() {
		// The checkpointer is keyed to the agent, and threads are addressed by
		// `thread_id` *within* it — so the thread is not part of the signature.
		// Rebuilding per thread would throw the conversation history away, which
		// is precisely the bug this replaced.
		//
		// The skill library is part of the signature because SkillsMiddleware
		// scans once and caches the result in a closure. A skill added to a live
		// agent would simply never be seen.
		// evictTokens is in the signature because the threshold is captured by the
		// filesystem middleware when it is constructed — changing it on a live
		// agent would be silently ignored, which is the worst kind of setting.
		const signature = `${this.model}:${keys.tail}:${JSON.stringify(this.interruptOn)}:${skills.signature}:${this.evictTokens}:${replay.active ? `replay:${replay.fixtureName}` : 'live'}`;
		if (this.#agent && this.#agentKey === signature) return this.#agent;

		const {
			createDeepAgent,
			StateBackend,
			StoreBackend,
			CompositeBackend,
			createSummarizationMiddleware,
			createFilesystemMiddleware
		} = await import('deepagents/browser');
		const { IdbCheckpointSaver, IdbStore } = await import('./persistence');

		// Two kinds of durability, deliberately kept distinct — this is the whole
		// short-term/long-term lesson made structural:
		//
		//   checkpointer → conversation state, scoped to ONE thread. New chat,
		//                  clean slate.
		//   store        → long-term memory, scoped to nothing. Survives across
		//                  every thread.
		//
		// The CompositeBackend is what wires them together: the agent sees a
		// single filesystem, but paths under /memories/ are routed to the Store
		// while everything else stays in graph state. Same `write_file` tool,
		// two completely different lifetimes — which is exactly the thing that is
		// invisible until you can see it.
		// Hydrate before the graph is built: a checkpointer that loads after the
		// first invocation has already lost the turn it was meant to remember.
		if (!this.#store) {
			this.#store = new IdbStore();
			await this.#store.hydrate();
		}
		if (!this.#checkpointer) {
			this.#checkpointer = new IdbCheckpointSaver();
			await this.#checkpointer.hydrate();
			// State is on disk, so every thread it holds is already known to the
			// graph — nothing needs replaying from localStorage.
			this.#seeded = new Set(this.threads.map((t) => t.id));
		}

		// One factory, three consumers. The filesystem middleware, the skills
		// scan and the summarizer all resolve files through it, so they must be
		// given the same one or they disagree about what exists.
		const backend = (config: { state: unknown; store?: unknown }) =>
			new CompositeBackend(new StateBackend(config as never), {
				'/memories': new StoreBackend(config as never)
			});

		this.#agent = await createDeepAgent({
			model: makeModel(bus, { model: this.model }),
			tools: AGENT_TOOLS,
			systemPrompt: SYSTEM_PROMPT,
			subagents: SUBAGENTS as never,
			store: this.#store,
			// Skills are markdown files, nothing more. This points the harness at
			// the directory; `send()` seeds the files themselves into state. The
			// prompt then carries one line per skill — name and description — and
			// the agent reads the rest only if it decides the skill applies.
			skills: [SKILLS_ROOT],
			// Compaction. `SummarizationMiddleware` is already in the default stack;
			// naming it here replaces that instance with one whose threshold we
			// chose, rather than adding a second. The default trigger reads a
			// max-input-tokens figure off the model profile, and there is no
			// profile for this family — so it silently falls back to a fixed 170k.
			// Stating the number keeps the gauge in the UI and the moment it fires
			// describing the same limit.
			middleware: [
				// The plan channel, installed by hand as of deepagents 1.12.
				//
				// It used to be in the default stack — `[todoListMiddleware(),
				// createFilesystemMiddleware(...), …]` — and 1.12 moved it into a
				// Codex *harness profile*, which only applies when a registered
				// profile matches the model. Ours does not match one, so the upgrade
				// silently took away `write_todos`, the `todos` state channel, the
				// plan band in the system prompt, and with them the entire plan tab.
				// Nothing threw; the panel simply had nothing to draw.
				//
				// Naming it here is also the more honest arrangement for this app:
				// the plan is a middleware you opt into, and now the code says so.
				todoListMiddleware(),
				// The filesystem layer, named explicitly for one reason: the eviction
				// threshold. Naming it here REPLACES the default instance rather than
				// adding a second, exactly as with the summarizer below — so the
				// backend must be the same factory the others get, or they disagree
				// about what exists. Everything else keeps the framework's defaults.
				createFilesystemMiddleware({
					backend,
					toolTokenLimitBeforeEvict: this.evictTokens
				}),
				createSummarizationMiddleware({
					backend,
					trigger: { type: 'tokens', value: Math.round(INPUT_LIMIT * COMPACT_AT) },
					keep: { type: 'messages', value: 8 }
				}),
				// Awareness is pushed, not pulled: every model call carries a small
				// ephemeral <world_state> block naming the images and sources that
				// exist. See awareness.ts for why this is middleware and not a tool.
				worldStateMiddleware,
				// And gates are serialized, not assumed serial — see one-gate.ts.
				oneGatePerTurnMiddleware
			] as never,
			// Gated tools pause the graph via interrupt() before running.
			interruptOn: this.interruptOn,
			// The FACTORY form, not the zero-arg form — and this is forced, not
			// stylistic. Zero-arg backends resolve state and store out of async
			// context, and our browser AsyncLocalStorage shim cannot survive an
			// `await`. `ls` awaits before it reaches the store, so the context is
			// already gone and it fails with "Config not retrievable".
			//
			// The factory receives {state, store} explicitly, so nothing has to be
			// recovered from ambient context and the shim never comes into it.
			backend,
			// Without a checkpointer every invocation is a *fresh graph run*: the
			// agent sees only the message you just sent, and its own `files` and
			// `todos` channels reset too. That is not "the model forgetting" — the
			// state was never carried across turns in the first place.
			//
			// MemorySaver lives for the life of the page. Durable, reload-surviving
			// persistence is the IndexedDB checkpointer (M6.5); until then a
			// restored thread is re-seeded from stored messages on its first send.
			checkpointer: this.#checkpointer
		});
		this.#agentKey = signature;
		this.#shape = null;
		// NOT cleared. Rebuilding the agent — a model switch, a new skill — does
		// not lose conversation state, because the checkpointer instance is
		// created once and reused. Clearing here made every thread look unseeded,
		// so the next send replayed the whole stored transcript into a graph that
		// already held it, doubling the history. Everything downstream of that is
		// built on a corrupted timeline, which is exactly what a rewind would then
		// rewind into.
		this.agentVersion++;
		return this.#agent;
	}

	async send(text: string) {
		if ((!text.trim() && !this.attachments.length) || this.busy) return;

		this.error = '';
		this.stalled = '';

		// Everything the agent should be able to *read* becomes a file: its own
		// skills, and any text or PDF the user attached. Both go in through the
		// same `files` channel, because to the agent there is no difference —
		// a skill is a file it might read, and so is your paper.
		const staged = this.attachments;
		this.attachments = [];

		const now = new Date().toISOString();
		const seedFiles: Record<string, unknown> = skills.seed();
		for (const a of staged) {
			if (!a.text) continue;
			seedFiles[a.path.replace(/\.pdf$/, '.txt')] = {
				content: a.text,
				mimeType: 'text/plain',
				created_at: now,
				modified_at: now
			};
		}

		// Mirror them the way a node update would. These files really are in the
		// graph's `files` channel from this turn on — but they arrive as *input*
		// rather than as a node's output, so nothing publishes them on the
		// updates stream and the Files panel would otherwise never see them.
		for (const [path, file] of Object.entries(seedFiles)) {
			this.files[path] = (file as { content: string }).content;
		}

		// Only when the library actually changed — the same three skills every
		// turn is noise. Content-sensitive on purpose: editing a skill's body
		// keeps the names and still earns a row, because "did my edit register?"
		// is exactly the question this row answers.
		if (skills.active.length && skills.contentSignature !== this.#skillsSeen) {
			const namesOf = (sig: string) =>
				sig
					.split(',')
					.filter(Boolean)
					.map((p) => p.split(':')[0])
					.join(',');
			const edited =
				!!this.#skillsSeen && namesOf(this.#skillsSeen) === namesOf(skills.contentSignature);
			this.#skillsSeen = skills.contentSignature;
			const listed = skills.active.reduce((n, s) => n + s.name.length + s.description.length, 0);
			bus.emit({
				kind: 'skills_loaded',
				scope: 'main',
				names: skills.active.map((s) => s.name),
				chars: listed,
				fullChars: skills.active.reduce((n, s) => n + s.body.length, 0),
				label: `${skills.active.length} skills${edited ? ' · updated' : ''}`
			});
		}

		// Anything already on screen but not yet in the checkpointer — the case
		// after a reload, where the UI restored a thread from localStorage but the
		// in-memory checkpointer starts empty. Replay it once so the agent's view
		// matches the user's.
		const backfill = this.#seeded.has(this.threadId)
			? []
			: this.messages
					// Notices are ours, not the conversation's. Replaying one would
					// tell the model it said something it never said.
					.filter((m) => m.role !== 'notice' && m.text.trim())
					.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
		this.#seeded.add(this.threadId);

		// Where the graph stands *before* this turn — the anchor a later edit of
		// this message rewinds to. Built here rather than in #drive because by the
		// time the run starts the checkpoint we want has already been superseded.
		const baseCheckpointId = await this.#headCheckpoint();

		// The model gets the manifest; the chat gets chips.
		const forModel = text + manifest(staged);
		this.messages.push({
			id: `m${++this.#n}`,
			role: 'user',
			text,
			toolCalls: [],
			busSeq: bus.nextSeq,
			...(baseCheckpointId ? { baseCheckpointId } : {}),
			...(staged.length
				? {
						attachments: staged.map((a) => ({
							kind: a.kind,
							name: a.name,
							path: a.path,
							chars: a.text.length
						}))
					}
				: {})
		});
		this.messages.push({
			id: `m${++this.#n}`,
			role: 'assistant',
			text: '',
			toolCalls: [],
			streaming: true
		});
		bus.emit({ kind: 'run_start', scope: 'main', input: text, label: 'user turn' });

		// Images are the exception: they cannot be a file the agent reads, because
		// reading is a text operation. They have to ride along inside the message
		// as content blocks, which is also why they keep costing tokens on every
		// turn afterwards — they are in the history now, not on a disk.
		const pictures = staged.filter((a) => a.kind === 'image' && a.dataUrl);
		const content = pictures.length
			? [
					{ type: 'text', text: forModel },
					...pictures.map((a) => ({ type: 'image_url', image_url: { url: a.dataUrl } }))
				]
			: forModel;

		await this.#drive({
			messages: [...backfill, { role: 'user', content }],
			...(Object.keys(seedFiles).length ? { files: seedFiles } : {}),
			// The middleware caches its scan, so on a thread whose checkpoint
			// already holds a skill list it will adopt that list rather than
			// rescanning. Passing the current one keeps a newly added skill from
			// being invisible until the next chat.
			...(skills.active.length
				? {
						skillsMetadata: skills.active.map((s) => ({
							name: s.name,
							description: s.description,
							path: skillPath(s.name)
						}))
					}
				: {})
		});
	}

	/**
	 * Answer a paused run.
	 *
	 * This is the half of HITL that is easy to miss: when the graph interrupts,
	 * `stream()` *ends*. It does not block. Resuming is a second, complete
	 * invocation carrying a Command instead of messages — same thread id, so the
	 * checkpointer supplies everything the first call had built up. Without a
	 * checkpointer this could not work at all, which is why persistence had to
	 * land first.
	 */
	async resume(decisions: Decision[]) {
		if (!this.pending || this.busy) return;

		const { Command } = await import('@langchain/langgraph/web');
		const request = this.pending.request;
		this.pending = null;

		bus.emit({
			kind: 'resume',
			scope: 'main',
			decisions,
			actions: request.actionRequests.map((a) => a.name),
			label: decisions.map((d) => d.type).join(', ')
		});

		await this.#drive(new Command({ resume: { decisions } as HITLResponse }));
	}

	/**
	 * One turn of the graph, whatever started it.
	 *
	 * Shared by `send` and `resume` because an interrupt can happen on either —
	 * approving one gated call does not mean the next one is not also gated.
	 */
	async #drive(input: unknown, checkpointId?: string) {
		// Continue writing into the open assistant message if there is one, so a
		// resumed run appends to the reply rather than starting a second bubble.
		let reply = this.messages.at(-1);
		if (!reply || reply.role !== 'assistant') {
			this.messages.push({
				id: `m${++this.#n}`,
				role: 'assistant',
				text: '',
				toolCalls: [],
				streaming: true
			});
			reply = this.messages[this.messages.length - 1];
		}
		reply.streaming = true;
		this.status = 'running';

		const started = performance.now();
		const before = runTotals(bus, this.model);
		this.#abort = new AbortController();
		let interrupted = false;

		try {
			const agent = (await this.#ensureAgent()) as {
				stream: (input: unknown, opts: unknown) => Promise<AsyncIterable<unknown>>;
			};

			const stream = await agent.stream(input, {
				streamMode: ['updates', 'messages'],
				subgraphs: true,
				// A checkpoint id here forks the thread: the graph rebuilds state as
				// it stood then and runs forward from it. `checkpoint_ns` is
				// deliberately absent — a non-empty namespace makes LangGraph
				// discard the id and run from head, silently.
				configurable: {
					thread_id: this.threadId,
					...(checkpointId ? { checkpoint_id: checkpointId } : {})
				},
				recursionLimit: this.stepCeiling,
				signal: this.#abort.signal
			});

			for await (const chunk of stream) {
				const [ns, mode, payload] = chunk as [string[], string, unknown];

				if (mode === 'messages') {
					const [msg] = payload as [Record<string, unknown>];
					// On the messages stream the namespace names the *emitting node*
					// too — root deltas arrive as ["model_request:<task>"], not [].
					// The speaker's identity is the path with that last segment
					// removed: empty means the root agent, anything longer means a
					// subagent's own invocation. Without this cut, `subgraphs: true`
					// wrote the paper-reader's digest into the parent's sentence —
					// and with a naive `ns.length` cut, nothing arrived at all.
					const speaker = ns.slice(0, -1);
					if (!msg.tool_call_id && !speaker.length) reply.text += textOf(msg);
					this.#absorbMessage(msg, reply, speaker);
					continue;
				}

				if (mode === 'updates') {
					const rec = payload as Record<string, unknown>;

					// The pause. It arrives as an ordinary update on the reserved
					// `__interrupt__` channel — not as an exception, and not as a
					// blocked promise.
					if (Array.isArray(rec.__interrupt__)) {
						// One payload can carry several interrupts — the graph pauses on
						// a super-step, and a super-step can contain more than one gated
						// call. Reading only [0] silently drops the rest, so the user
						// approves one thing and the others never resolve.
						const entries = rec.__interrupt__ as { id?: string; value?: HITLRequest }[];
						const merged: HITLRequest = { actionRequests: [], reviewConfigs: [] };
						for (const entry of entries) {
							const req = entry?.value;
							if (!req?.actionRequests) continue;
							merged.actionRequests.push(...req.actionRequests);
							merged.reviewConfigs.push(...(req.reviewConfigs ?? []));
						}

						// With `subgraphs: true` a gate inside a subagent surfaces twice —
						// once on the subagent's own namespace and once bubbled at the
						// root. Same id, same pause: one row. Guarded by id rather than
						// namespace so a genuinely new interrupt after a resume still
						// lands.
						if (merged.actionRequests.length && this.pending?.id !== entries[0]?.id) {
							this.pending = { request: merged, id: entries[0]?.id };
							interrupted = true;
							bus.emit({
								kind: 'interrupt',
								scope: 'main',
								interruptId: entries[0]?.id ?? '',
								actions: merged.actionRequests.map((a) => ({ name: a.name, args: a.args })),
								allowed: merged.reviewConfigs.flatMap((r) => r.allowedDecisions),
								label: merged.actionRequests.map((a) => a.name).join(', ')
							});
						}
						continue;
					}

					for (const [nodeName, update] of Object.entries(rec)) {
						this.#absorbUpdate(nodeName, update as Record<string, unknown>, reply, ns);
					}
				}
			}

			bus.emit({
				kind: 'run_end',
				scope: 'main',
				status: interrupted ? 'interrupted' : 'done',
				ms: performance.now() - started,
				label: interrupted ? 'awaiting approval' : 'turn complete'
			});
			this.status = 'idle';
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			const aborted = /abort/i.test(message);
			// Two stops that lose nothing get a Continue button instead of an
			// error string: the step guard, and a connection dropping mid-run
			// (our tools return network failures as text now, so a throw here is
			// the model call itself — retryable by definition).
			const ceiling = /recursion limit/i.test(message);
			const network = !ceiling && /failed to fetch|networkerror|load failed/i.test(message);
			if (ceiling) this.stalled = 'ceiling';
			if (network) this.stalled = 'network';
			const paused = aborted || ceiling || network;
			this.error = paused ? '' : message;
			this.status = paused ? 'idle' : 'error';
			bus.emit({
				kind: 'run_end',
				scope: 'main',
				status: aborted ? 'done' : 'error',
				ms: performance.now() - started,
				label: aborted ? 'stopped' : message.slice(0, 60)
			});
		} finally {
			// The receipt: this drive's share of the wire, added to whatever the
			// turn had already spent before an interrupt paused it.
			const after = runTotals(bus, this.model);
			const prior = reply.usage;
			reply.usage = {
				input: (prior?.input ?? 0) + (after.input - before.input),
				cached: (prior?.cached ?? 0) + (after.cached - before.cached),
				output: (prior?.output ?? 0) + (after.output - before.output),
				costUsd: (prior?.costUsd ?? 0) + (after.costUsd - before.costUsd),
				ms: (prior?.ms ?? 0) + (performance.now() - started),
				calls: (prior?.calls ?? 0) + (after.calls - before.calls)
			};
			// A paused run is still mid-turn: keep the caret until it resumes.
			reply.streaming = interrupted;
			this.#abort = null;
			// Write the checkpoint before reporting the turn done. The head
			// checkpoint at this moment is the one the next message will anchor to,
			// and leaving it in a 400ms debounce means a reload in that window
			// produces an id nothing can resolve.
			await this.#checkpointer?.flushNow();
			this.#persist();
			await this.refreshMemories();
			// Fire-and-forget: naming the chat must never hold the turn open.
			if (!interrupted) void this.#autoTitle();
		}

		// The turn is over, so the message list is no longer being read from.
		// This is the earliest moment a `compact_context` call can actually be
		// honoured — see compaction.ts.
		if (compactRequest.pending && !interrupted) {
			compactRequest.pending = false;
			await this.compact();
		}
	}

	/**
	 * Name the thread once it has one real exchange.
	 *
	 * A lab-sidecar call (see lab/sidecar.svelte.ts) — cheapest model, invisible
	 * to the X-ray by design. Failure leaves the fallback title, silently: a
	 * chat that keeps its first words as its name is not a problem worth a
	 * banner.
	 */
	async #autoTitle() {
		if (resetInProgress.value) return;
		const entry = this.threads.find((t) => t.id === this.threadId);
		if (!entry || entry.titled) return;
		const asked = this.messages.find((m) => m.role === 'user')?.text ?? '';
		const replied = this.messages.findLast((m) => m.role === 'assistant' && m.text)?.text ?? '';
		if (!asked || !replied) return;

		const { generateTitle } = await import('$lib/lab/sidecar.svelte');
		const title = await generateTitle(asked, replied);
		if (!title) return;

		// Re-find: the turn may have switched threads while the call was out.
		const hit = this.threads.find((t) => t.id === entry.id);
		if (!hit) return;
		hit.title = title;
		hit.titled = true;
		this.threads = [...this.threads];
		if (browser && !resetInProgress.value)
			localStorage.setItem(THREADS_KEY, JSON.stringify(this.threads));
	}

	/** Write everything to disk now. Called when the page is going away. */
	async flushState(): Promise<void> {
		this.#persist();
		await this.#checkpointer?.flushNow();
	}

	// ── checkpoints ──────────────────────────────────────────────────────────

	/**
	 * The id of the thread's current head checkpoint, or undefined.
	 *
	 * Note the absent `checkpoint_ns`. Passing a non-empty namespace alongside a
	 * checkpoint id makes LangGraph silently ignore the id and run from head —
	 * no error, no warning — so the safe form is to never mention it at all.
	 */
	async #headCheckpoint(): Promise<string | undefined> {
		try {
			const agent = (await this.#ensureAgent()) as {
				getState: (
					c: unknown
				) => Promise<{ config?: { configurable?: { checkpoint_id?: string } } }>;
			};
			const snap = await agent.getState({ configurable: { thread_id: this.threadId } });
			return snap.config?.configurable?.checkpoint_id;
		} catch {
			// No key, no agent, nothing checkpointed yet. A message without an
			// anchor simply cannot be rewound to; it is not an error.
			return undefined;
		}
	}

	/**
	 * The thread's very first checkpoint.
	 *
	 * The opening message of a conversation has no anchor of its own — nothing
	 * was checkpointed before it, because nothing had happened. But once the
	 * turn has run, the thread's oldest checkpoint is the empty state that
	 * preceded it, and forking there is exactly "start this conversation again,
	 * differently". History comes back newest-first, so the last entry is the
	 * one we want.
	 */
	async #oldestCheckpoint(): Promise<string | undefined> {
		try {
			const agent = (await this.#ensureAgent()) as {
				getStateHistory: (
					c: unknown
				) => AsyncIterable<{ config?: { configurable?: { checkpoint_id?: string } } }>;
			};
			let last: string | undefined;
			for await (const snap of agent.getStateHistory({
				configurable: { thread_id: this.threadId }
			})) {
				last = snap.config?.configurable?.checkpoint_id ?? last;
			}
			return last;
		} catch {
			return undefined;
		}
	}

	/**
	 * Does this checkpoint still exist?
	 *
	 * This guard is the difference between a feature and a trap. Rewinding to a
	 * checkpoint that is no longer in the store does **not** throw — LangGraph
	 * quietly starts a fresh, empty branch, so the model would silently forget
	 * the entire conversation while the transcript on screen looked untouched.
	 * A real snapshot always carries a `createdAt`; a missing one comes back with
	 * empty values and no timestamp, which is the discriminator.
	 */
	async #checkpointExists(id: string): Promise<boolean> {
		try {
			const agent = (await this.#ensureAgent()) as {
				getState: (c: unknown) => Promise<{ createdAt?: string }>;
			};
			const snap = await agent.getState({
				configurable: { thread_id: this.threadId, checkpoint_id: id }
			});
			return snap?.createdAt !== undefined;
		} catch {
			return false;
		}
	}

	/**
	 * Edit an earlier message and run the conversation again from there.
	 *
	 * The rewind is done by *re-running* from a past checkpoint, not by editing
	 * history: LangGraph is handed `{ thread_id, checkpoint_id }` plus the new
	 * text, rebuilds the message channel as it stood at that checkpoint, and
	 * carries on. The turns that followed are not deleted — they become an
	 * orphaned branch that the checkpointer still holds — which is the honest
	 * model of what a fork is, and is why this needs no message surgery at all.
	 *
	 * Everything the UI mirrors has to be *replaced* rather than patched. `files`
	 * and `todos` are add-only mirrors, so patching would leave the abandoned
	 * branch's writes on screen as if they were still real.
	 */
	async editAndResend(messageId: string, newText: string) {
		if (this.busy || this.compacting) return;
		const index = this.messages.findIndex((m) => m.id === messageId);
		const target = this.messages[index];
		if (index < 0 || target.role !== 'user') return;

		const text = newText.trim();
		if (!text) return;

		// The opening message has no anchor of its own; the thread's oldest
		// checkpoint is the empty state that came before it.
		const base = target.baseCheckpointId ?? (await this.#oldestCheckpoint());
		if (!base) {
			this.error = 'There is no checkpoint to return to for this message.';
			return;
		}
		if (!(await this.#checkpointExists(base))) {
			this.error =
				'That checkpoint is no longer on disk, so rewinding here would silently start an empty conversation. Refusing.';
			return;
		}

		this.error = '';

		// Take the graph back first, then make the UI agree with it.
		const agent = (await this.#ensureAgent()) as {
			getState: (c: unknown) => Promise<{ values?: Record<string, unknown> }>;
		};
		const snap = await agent.getState({
			configurable: { thread_id: this.threadId, checkpoint_id: base }
		});

		const values = snap.values ?? {};
		this.todos = Array.isArray(values.todos) ? (values.todos as Todo[]) : [];
		this.files = {};
		const files = values.files;
		if (files && typeof files === 'object') {
			for (const [path, value] of Object.entries(files as Record<string, unknown>)) {
				const content = (value as { content?: unknown })?.content;
				this.files[path] = typeof content === 'string' ? content : JSON.stringify(value);
			}
		}

		// The log rewinds too, or the timeline would keep describing a run that
		// no longer happened. The discarded events are archived, not dropped.
		if (target.busSeq !== undefined) bus.fork(target.busSeq);

		bus.emit({
			kind: 'rewind',
			scope: 'main',
			checkpointId: base,
			dropped: this.messages.length - index,
			label: 'edited and re-ran'
		});

		this.messages = this.messages.slice(0, index);
		this.pending = null;
		this.#toolStarts.clear();
		this.#planBy.clear();
		// The rewind already truncated `messages`; sealing now writes off exactly
		// the dispatches that survived it.
		this.#sealLanes();
		compactRequest.pending = false;

		this.messages.push({
			id: `m${++this.#n}`,
			role: 'user',
			text,
			toolCalls: [],
			busSeq: bus.nextSeq,
			baseCheckpointId: base
		});
		this.messages.push({
			id: `m${++this.#n}`,
			role: 'assistant',
			text: '',
			toolCalls: [],
			streaming: true
		});
		bus.emit({ kind: 'run_start', scope: 'main', input: text, label: 'user turn' });

		// No backfill: the checkpoint already holds the history up to this point,
		// and replaying it as input would say everything twice.
		await this.#drive({ messages: [{ role: 'user', content: text }] }, base);
	}

	/**
	 * Fold the conversation up by hand.
	 *
	 * Same three steps the harness's summarizer performs on its own, run on
	 * demand instead of at a threshold. It is a real model call and a real state
	 * write, so both show up on the wire and in the graph exactly as the
	 * automatic path does.
	 */
	async compact() {
		if (this.busy || this.compacting) return;
		this.compacting = true;
		try {
			const agent = (await this.#ensureAgent()) as Parameters<typeof compactThread>[0];
			const result = await compactThread(agent, this.threadId, this.model);
			if (!result) {
				this.error = 'Not enough conversation to compact yet.';
				return;
			}

			bus.emit({
				kind: 'compaction',
				scope: 'main',
				cutoffIndex: result.removed,
				summary: result.summary,
				filePath: result.filePath,
				trigger: 'manual',
				label: `${result.removed} messages folded`
			});

			// The archived file holds the *transcript*, not the summary — mirroring
			// the summary here would make the notice's "read the transcript" link
			// show the summary a second time.
			this.files[result.filePath] = result.transcript;

			// The transcript stays. Compaction is about what the *model* is sent,
			// not about what you are allowed to look at — and conflating the two
			// destroyed the conversation on screen. What changed is recorded as a
			// marker in the flow, at the point where it happened. The graph's count
			// is quoted, not the chat's: the graph holds tool calls and results as
			// messages too, so the smaller number would understate it.
			this.messages.push({
				id: `m${++this.#n}`,
				role: 'notice',
				text: `Context compacted — ${result.removed} messages folded into a summary. Everything above is still here; the model now starts from the summary. Files and long-term memories are untouched.`,
				toolCalls: [],
				noticePath: result.filePath
			});
			this.#persist();
			// The conversation just changed shape; let the sidecar rename it from
			// the newer material.
			const entry = this.threads.find((t) => t.id === this.threadId);
			if (entry) entry.titled = false;
			void this.#autoTitle();
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
		} finally {
			this.compacting = false;
		}
	}

	/**
	 * Which subagent a namespace belongs to, in human terms.
	 *
	 * The stream says `sub:<node>:<taskId>`; a person wants "paper-reader". The
	 * only place that name exists is the arguments of the `task` call that did
	 * the dispatching, so the nth new namespace is paired with the nth `task`
	 * dispatch. Honest but not bulletproof — parallel dispatches start in order
	 * today, and a mispairing shows as a wrong label while the scope string
	 * stays the ground truth.
	 */
	#laneOf(ns: string[]): string | undefined {
		if (!ns.length) return undefined;
		const key = ns.join('/');
		return laneName(this.#lanes, key, this.#dispatches());
	}

	/** Tool calls and results, as they stream. `ns` is the speaker's path. */
	#absorbMessage(m: Record<string, unknown>, reply: ChatMessage, ns: string[] = []) {
		const scope = ns.length ? (`sub:${ns.join('/')}` as const) : 'main';
		const lane = this.#laneOf(ns);
		const calls = m.tool_calls as { id?: string; name: string; args: unknown }[] | undefined;
		if (Array.isArray(calls)) {
			for (const c of calls) {
				if (!c?.name) continue;
				const id = c.id ?? `${c.name}-${reply.toolCalls.length}`;
				const existing = reply.toolCalls.find((t) => t.id === id);
				if (existing) {
					// Arguments arrive after the call is announced, so the row that
					// announced it was written without them. Amend it rather than
					// leaving a permanently half-empty event in the log — this is
					// also what lets a `read_file` be recognised as a skill.
					if (c.args && Object.keys(c.args as object).length) {
						existing.args = c.args;
						const started = this.#toolStarts.get(id);
						// Each chunk hands over a fresh args object, so identity is a
						// sufficient and cheap "has anything actually arrived?".
						if (started && started.args !== c.args) {
							const skill = skillReadIn(c.name, c.args);
							this.#toolStarts.set(
								id,
								bus.revise(started, {
									args: c.args,
									...(skill ? { skill, label: skill } : {})
								})
							);
						}
					}
				} else {
					reply.toolCalls.push({
						id,
						name: c.name,
						args: c.args ?? {},
						status: 'running',
						ours: OUR_TOOLS.has(c.name)
					});
					const skill = skillReadIn(c.name, c.args);
					this.#toolStarts.set(
						id,
						bus.emit({
							kind: 'tool_start',
							scope,
							...(lane ? { lane } : {}),
							toolCallId: id,
							name: c.name,
							args: c.args ?? {},
							ours: OUR_TOOLS.has(c.name),
							...(skill ? { skill } : {}),
							label: skill ?? c.name
						})
					);
				}
			}
		}

		const toolCallId = m.tool_call_id as string | undefined;
		if (toolCallId) {
			const hit = reply.toolCalls.find((t) => t.id === toolCallId);
			const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
			if (hit && hit.status === 'running') {
				hit.result = content;
				hit.status = m.status === 'error' ? 'error' : 'done';
				// The args live on the call we recorded at start, so the skill can be
				// recognised again here without the result having to mention it.
				const skill = skillReadIn(hit.name, hit.args);
				bus.emit({
					kind: 'tool_end',
					scope,
					...(lane ? { lane } : {}),
					toolCallId,
					name: hit.name,
					result: content,
					status: m.status === 'error' ? 'error' : 'success',
					chars: content.length,
					...(skill ? { skill } : {}),
					label: `${skill ?? hit.name} → ${content.length} chars`
				});
			}
		}
	}

	/**
	 * Committed node state. This is where the harness's own channels surface —
	 * we never asked for them, LangGraph publishes them because they are part of
	 * the graph's state.
	 */
	#absorbUpdate(
		nodeName: string,
		update: Record<string, unknown> | null,
		reply: ChatMessage,
		ns: string[]
	) {
		if (!update) return;

		const lane = this.#laneOf(ns);
		bus.emit({
			kind: 'node',
			scope: ns.length ? (`sub:${ns.join('/')}` as const) : 'main',
			...(lane ? { lane } : {}),
			nodeName,
			channels: Object.keys(update),
			label: nodeName
		});

		const msgs = update.messages;
		if (Array.isArray(msgs)) {
			for (const m of msgs) this.#absorbMessage(m as Record<string, unknown>, reply);
		}

		// The harness compacting itself.
		//
		// Nothing was added to make this visible. SummarizationMiddleware returns
		// a Command carrying `_summarizationEvent`, which LangGraph publishes on
		// the same `updates` stream as every other channel — so a mechanism three
		// layers down surfaces for the same reason `todos` and `files` do.
		if (update._summarizationEvent && typeof update._summarizationEvent === 'object') {
			const ev = update._summarizationEvent as {
				cutoffIndex?: number;
				summaryMessage?: { content?: unknown };
				filePath?: string | null;
			};
			const content = ev.summaryMessage?.content;
			bus.emit({
				kind: 'compaction',
				scope: 'main',
				cutoffIndex: ev.cutoffIndex ?? 0,
				summary: typeof content === 'string' ? content : JSON.stringify(content ?? ''),
				filePath: ev.filePath ?? null,
				trigger: 'auto',
				label: `${ev.cutoffIndex ?? 0} messages folded`
			});
		}

		// The planning channel. Last-write-wins, so a partial write destroys it —
		// which is itself worth seeing.
		//
		// Per namespace, which is not a detail: `todos` is in EXCLUDED_STATE_KEYS,
		// so a subagent gets its own empty plan channel rather than the parent's,
		// and the harness hands every subagent `write_todos` whether it needs one
		// or not. Both of those were true before this line was; what was wrong was
		// this panel, which folded every namespace's writes into one list — so a
		// paper-reader jotting two steps for itself replaced the parent's plan on
		// screen and then vanished again when the parent wrote next. The lists are
		// separate in the graph and they are separate here.
		if (Array.isArray(update.todos)) {
			const next = update.todos as Todo[];
			const scope = ns.length ? (`sub:${ns.join('/')}` as const) : 'main';
			const before = new Map((this.#planBy.get(scope) ?? []).map((t) => [t.content, t.status]));
			const added = next.filter((t) => !before.has(t.content)).map((t) => t.content);
			const statusChanged = next
				.filter((t) => before.has(t.content) && before.get(t.content) !== t.status)
				.map((t) => ({ content: t.content, from: before.get(t.content)!, to: t.status }));
			this.#planBy.set(scope, next);
			// The parent's list is THE plan: a subagent's lives and dies inside its
			// own window, and the parent never sees it.
			if (!ns.length) this.todos = next;
			bus.emit({
				kind: 'todo_update',
				scope,
				...(lane ? { lane } : {}),
				todos: next,
				added,
				statusChanged,
				label:
					statusChanged.length > 0
						? `${statusChanged[0].content.slice(0, 32)} → ${statusChanged[0].to}`
						: `${next.length} items`
			});
		}

		// The virtual filesystem.
		//
		// Scoped by namespace, like the plan channel and for the same reason: a
		// subagent's writes were all landing on the parent. Files DO cross the
		// boundary — unlike `todos`, they are inherited and written back, which is
		// how these agents coordinate at all — so the mirror stays single. Only
		// the attribution was wrong, which is why the timeline never showed an
		// fs_write inside a subagent lane and the file log credited every note to
		// the parent that dispatched the reader.
		if (update.files && typeof update.files === 'object') {
			const next = update.files as Record<string, unknown>;
			for (const [path, value] of Object.entries(next)) {
				const content =
					typeof value === 'string'
						? value
						: typeof (value as { content?: string })?.content === 'string'
							? (value as { content: string }).content
							: JSON.stringify(value);
				const existed = path in this.files;
				if (this.files[path] === content) continue;
				this.files[path] = content;
				bus.emit({
					kind: 'fs_write',
					scope: ns.length ? (`sub:${ns.join('/')}` as const) : 'main',
					...(lane ? { lane } : {}),
					op: existed ? 'edit' : 'write',
					path,
					bytes: content.length,
					label: path
				});
			}
		}
	}
}

export const session = new Session();

if (import.meta.env.DEV && typeof window !== 'undefined') {
	const w = window as unknown as { __hx?: Record<string, unknown> };
	w.__hx = { ...(w.__hx ?? {}), session };
}
