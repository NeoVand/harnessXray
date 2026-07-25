import { browser } from '$app/environment';
import { bus } from '$lib/xray/bus.svelte';
import { makeModel, type ModelId } from './models';
import { keys } from '$lib/state/keys.svelte';
import { AGENT_TOOLS } from './tools';
import { SYSTEM_PROMPT } from './prompt';
import type { Todo } from '$lib/xray/events';
import type { InMemoryStore } from '@langchain/langgraph/web';

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
	role: 'user' | 'assistant';
	text: string;
	toolCalls: ToolCall[];
	streaming?: boolean;
}

export interface ThreadSummary {
	id: string;
	title: string;
	updated: number;
	messages: number;
}

export type RunStatus = 'idle' | 'running' | 'error';

/** Which tools we wrote, so the UI can mark the rest as the harness's own. */
const OUR_TOOLS: ReadonlySet<string> = new Set<string>(AGENT_TOOLS.map((t) => t.name));
const THREADS_KEY = 'hx:threads';

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

	#agent: unknown = null;
	#agentKey = '';
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
	#store: InMemoryStore | undefined = undefined;

	constructor() {
		if (browser) this.#loadThreads();
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
			const items = (await this.#store.search(['filesystem'], { limit: 100 })) as {
				key: string;
				value: unknown;
			}[];
			this.memories = items.map((i) => ({ key: i.key, value: i.value }));
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
		}
	}

	#persist() {
		if (!browser) return;
		const first = this.messages.find((m) => m.role === 'user')?.text ?? 'New chat';
		const summary: ThreadSummary = {
			id: this.threadId,
			title: first.slice(0, 60),
			updated: Date.now(),
			messages: this.messages.length
		};
		this.threads = [summary, ...this.threads.filter((t) => t.id !== this.threadId)].slice(0, 30);
		localStorage.setItem(THREADS_KEY, JSON.stringify(this.threads));
		localStorage.setItem(
			`hx:thread:${this.threadId}`,
			JSON.stringify({ messages: this.messages, todos: this.todos, files: this.files })
		);
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
		} catch {
			/* a corrupt thread should not brick the app */
		}
	}

	openThread(id: string) {
		if (this.busy) return;
		this.threadId = id;
		this.#agent = null; // a thread is a checkpoint scope; don't carry state across
		this.messages = [];
		this.todos = [];
		this.files = {};
		this.#n = 0;
		bus.clear();
		this.#restore(id); // re-seeds #n past the restored ids
	}

	newThread() {
		if (this.busy) return;
		this.threadId = `t${Date.now().toString(36)}`;
		this.#agent = null;
		this.messages = [];
		this.todos = [];
		this.files = {};
		this.#n = 0;
		this.error = '';
		this.status = 'idle';
		bus.clear();
	}

	stop() {
		this.#abort?.abort();
	}

	// ── the agent ────────────────────────────────────────────────────────────

	async peekAgent(): Promise<unknown> {
		if (this.#agent) return this.#agent;
		if (this.#shape) return this.#shape;
		const { createDeepAgent } = await import('deepagents/browser');
		this.#shape = await createDeepAgent({
			model: `openai:${this.model}`,
			tools: AGENT_TOOLS,
			systemPrompt: SYSTEM_PROMPT
		});
		return this.#shape;
	}

	async #ensureAgent() {
		// The checkpointer is keyed to the agent, and threads are addressed by
		// `thread_id` *within* it — so the thread is not part of the signature.
		// Rebuilding per thread would throw the conversation history away, which
		// is precisely the bug this replaced.
		const signature = `${this.model}:${keys.tail}`;
		if (this.#agent && this.#agentKey === signature) return this.#agent;

		const { createDeepAgent, StateBackend, StoreBackend, CompositeBackend } = await import(
			'deepagents/browser'
		);
		const { MemorySaver, InMemoryStore } = await import('@langchain/langgraph/web');

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
		this.#store ??= new InMemoryStore();

		this.#agent = await createDeepAgent({
			model: makeModel(bus, { model: this.model }),
			tools: AGENT_TOOLS,
			systemPrompt: SYSTEM_PROMPT,
			store: this.#store,
			// The FACTORY form, not the zero-arg form — and this is forced, not
			// stylistic. Zero-arg backends resolve state and store out of async
			// context, and our browser AsyncLocalStorage shim cannot survive an
			// `await`. `ls` awaits before it reaches the store, so the context is
			// already gone and it fails with "Config not retrievable".
			//
			// The factory receives {state, store} explicitly, so nothing has to be
			// recovered from ambient context and the shim never comes into it.
			backend: (config) =>
				new CompositeBackend(new StateBackend(config), {
					'/memories': new StoreBackend(config)
				}),
			// Without a checkpointer every invocation is a *fresh graph run*: the
			// agent sees only the message you just sent, and its own `files` and
			// `todos` channels reset too. That is not "the model forgetting" — the
			// state was never carried across turns in the first place.
			//
			// MemorySaver lives for the life of the page. Durable, reload-surviving
			// persistence is the IndexedDB checkpointer (M6.5); until then a
			// restored thread is re-seeded from stored messages on its first send.
			checkpointer: new MemorySaver()
		});
		this.#agentKey = signature;
		this.#shape = null;
		this.#seeded.clear();
		this.agentVersion++;
		return this.#agent;
	}

	async send(text: string) {
		if (!text.trim() || this.busy) return;

		this.error = '';

		// Anything already on screen but not yet in the checkpointer — the case
		// after a reload, where the UI restored a thread from localStorage but the
		// in-memory checkpointer starts empty. Replay it once so the agent's view
		// matches the user's.
		const backfill = this.#seeded.has(this.threadId)
			? []
			: this.messages
					.filter((m) => m.text.trim())
					.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
		this.#seeded.add(this.threadId);

		this.messages.push({ id: `m${++this.#n}`, role: 'user', text, toolCalls: [] });
		this.messages.push({
			id: `m${++this.#n}`,
			role: 'assistant',
			text: '',
			toolCalls: [],
			streaming: true
		});
		// Re-acquire through the array: `$state` proxies on read, so mutating the
		// object we pushed would bypass the proxy and never notify the UI.
		const reply = this.messages[this.messages.length - 1];
		this.status = 'running';

		const started = performance.now();
		this.#abort = new AbortController();
		bus.emit({ kind: 'run_start', scope: 'main', input: text, label: 'user turn' });

		try {
			const agent = (await this.#ensureAgent()) as {
				stream: (input: unknown, opts: unknown) => Promise<AsyncIterable<unknown>>;
			};

			const stream = await agent.stream(
				{ messages: [...backfill, { role: 'user', content: text }] },
				{
					streamMode: ['updates', 'messages'],
					subgraphs: true,
					configurable: { thread_id: this.threadId },
					recursionLimit: 60,
					signal: this.#abort.signal
				}
			);

			for await (const chunk of stream) {
				const [ns, mode, payload] = chunk as [string[], string, unknown];

				if (mode === 'messages') {
					const [msg] = payload as [Record<string, unknown>];
					// A ToolMessage carries text too — its result. That belongs to the
					// tool card, not the assistant's prose.
					if (!msg.tool_call_id) reply.text += textOf(msg);
					this.#absorbMessage(msg, reply);
					continue;
				}

				if (mode === 'updates') {
					for (const [nodeName, update] of Object.entries(payload as Record<string, unknown>)) {
						this.#absorbUpdate(nodeName, update as Record<string, unknown>, reply, ns);
					}
				}
			}

			bus.emit({
				kind: 'run_end',
				scope: 'main',
				status: 'done',
				ms: performance.now() - started,
				label: 'turn complete'
			});
			this.status = 'idle';
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			const aborted = /abort/i.test(message);
			this.error = aborted ? '' : message;
			this.status = aborted ? 'idle' : 'error';
			bus.emit({
				kind: 'run_end',
				scope: 'main',
				status: aborted ? 'done' : 'error',
				ms: performance.now() - started,
				label: aborted ? 'stopped' : message.slice(0, 60)
			});
		} finally {
			reply.streaming = false;
			this.#abort = null;
			this.#persist();
			// The Store emits nothing on the graph stream, so the mirror is pulled.
			await this.refreshMemories();
		}
	}

	/** Tool calls and results, as they stream. */
	#absorbMessage(m: Record<string, unknown>, reply: ChatMessage) {
		const calls = m.tool_calls as { id?: string; name: string; args: unknown }[] | undefined;
		if (Array.isArray(calls)) {
			for (const c of calls) {
				if (!c?.name) continue;
				const id = c.id ?? `${c.name}-${reply.toolCalls.length}`;
				const existing = reply.toolCalls.find((t) => t.id === id);
				if (existing) {
					if (c.args && Object.keys(c.args as object).length) existing.args = c.args;
				} else {
					reply.toolCalls.push({
						id,
						name: c.name,
						args: c.args ?? {},
						status: 'running',
						ours: OUR_TOOLS.has(c.name)
					});
					bus.emit({
						kind: 'tool_start',
						scope: 'main',
						toolCallId: id,
						name: c.name,
						args: c.args ?? {},
						ours: OUR_TOOLS.has(c.name),
						label: c.name
					});
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
				bus.emit({
					kind: 'tool_end',
					scope: 'main',
					toolCallId,
					name: hit.name,
					result: content,
					status: m.status === 'error' ? 'error' : 'success',
					chars: content.length,
					label: `${hit.name} → ${content.length} chars`
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

		bus.emit({
			kind: 'node',
			scope: ns.length ? (`sub:${ns[0]}` as const) : 'main',
			nodeName,
			channels: Object.keys(update),
			label: nodeName
		});

		const msgs = update.messages;
		if (Array.isArray(msgs)) {
			for (const m of msgs) this.#absorbMessage(m as Record<string, unknown>, reply);
		}

		// The planning channel. Last-write-wins, so a partial write destroys it —
		// which is itself worth seeing.
		if (Array.isArray(update.todos)) {
			const next = update.todos as Todo[];
			const before = new Map(this.todos.map((t) => [t.content, t.status]));
			const added = next.filter((t) => !before.has(t.content)).map((t) => t.content);
			const statusChanged = next
				.filter((t) => before.has(t.content) && before.get(t.content) !== t.status)
				.map((t) => ({ content: t.content, from: before.get(t.content)!, to: t.status }));
			this.todos = next;
			bus.emit({
				kind: 'todo_update',
				scope: 'main',
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
					scope: 'main',
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
