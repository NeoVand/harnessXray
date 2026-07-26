import { bus } from '$lib/xray/bus.svelte';
import { makeModel, type ModelId } from './models';

/**
 * Folding the conversation up.
 *
 * The harness already does this on its own: `createDeepAgent` installs
 * `SummarizationMiddleware`, which watches the token count and, past a
 * threshold, replaces the older half of the message list with a summary and
 * writes the originals to `/conversation_history/` in the virtual filesystem.
 * We do not implement that — we configure its threshold and watch it happen.
 *
 * What is here is the *manual* half, because a threshold you cannot trip on
 * purpose is hard to learn from. Asking the agent to compact runs the same
 * three steps by hand, in the open:
 *
 *   1. pick a cutoff at a user-turn boundary
 *   2. summarise everything before it with a real model call
 *   3. rewrite the message list through `updateState`
 *
 * Step 3 is the one worth watching. Message history is a graph channel like any
 * other, so editing it is an ordinary state update — a `RemoveMessage` per id,
 * plus the summary. Nothing about the agent is special-cased; we are just
 * writing to a channel it happens to read.
 */

/**
 * Set by the `compact_context` tool, read by the session when the turn ends.
 *
 * It cannot happen inside the turn: the message list is the input the model is
 * being served from right now, and rewriting it mid-flight would invalidate the
 * very request in progress. So the tool schedules, and the session performs.
 */
export const compactRequest = { pending: false };

export interface CompactionResult {
	removed: number;
	summary: string;
	/** The messages that were folded away, as readable text. */
	transcript: string;
	filePath: string;
}

interface StateSnapshot {
	values: { messages?: unknown[] };
}

interface Agent {
	getState: (config: unknown) => Promise<StateSnapshot>;
	updateState: (config: unknown, values: unknown) => Promise<unknown>;
}

interface AnyMessage {
	id?: string;
	getType?: () => string;
	_getType?: () => string;
	content?: unknown;
	tool_calls?: unknown[];
}

const typeOf = (m: AnyMessage): string => m.getType?.() ?? m._getType?.() ?? '';

function textOf(m: AnyMessage): string {
	const c = m.content;
	if (typeof c === 'string') return c;
	if (!Array.isArray(c)) return '';
	return c
		.map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text) : ''))
		.join('');
}

/**
 * Where to cut.
 *
 * Not simply "keep the last N". A tool call and its result are one indivisible
 * exchange — the API rejects a `function_call` whose `function_call_output` has
 * gone missing — so the only safe boundaries are the user turns. We walk back
 * from the end looking for a human message that leaves enough recent history
 * intact, and refuse to compact if there is no such point.
 */
function findCutoff(messages: AnyMessage[], keepAtLeast: number): number {
	for (let i = messages.length - keepAtLeast; i > 0; i--) {
		if (typeOf(messages[i]) === 'human') return i;
	}
	return 0;
}

function transcribe(messages: AnyMessage[]): string {
	return messages
		.map((m) => {
			const kind = typeOf(m);
			const text = textOf(m);
			if (kind === 'tool') return `[tool result] ${text.slice(0, 600)}`;
			const calls = Array.isArray(m.tool_calls) && m.tool_calls.length
				? ` [called ${m.tool_calls.map((c) => (c as { name?: string }).name).join(', ')}]`
				: '';
			return `${kind}: ${text.slice(0, 1500)}${calls}`;
		})
		.join('\n\n');
}

const PROMPT = `Summarise the conversation below so another instance of this agent can carry on without having read it.

Keep, in this order:
1. What the user actually asked for, in their terms.
2. Decisions made and constraints agreed.
3. Findings worth keeping — papers read, results, numbers, exact file paths written.
4. What is still outstanding.

Be dense. Drop pleasantries, drop tool mechanics, drop anything already written to a file — say the path instead. No preamble.

Conversation:
`;

/**
 * Compact one thread. Returns null when there is nothing worth folding.
 *
 * `keepAtLeast` matches the automatic path's `keep: { messages: 8 }` so the two
 * triggers produce comparable results — a manual compact that discarded twice
 * as much as the automatic one would make the feature hard to reason about.
 */
export async function compactThread(
	agent: Agent,
	threadId: string,
	model: ModelId,
	keepAtLeast = 8
): Promise<CompactionResult | null> {
	const config = { configurable: { thread_id: threadId } };
	const snapshot = await agent.getState(config);
	const messages = (snapshot.values?.messages ?? []) as AnyMessage[];

	// Prefer the automatic path's keep, but do not refuse outright on a short
	// conversation: this is a lab, and being told "not enough conversation yet"
	// when you press the button teaches nothing. Fall back to keeping less.
	let cutoff = 0;
	for (const keep of [keepAtLeast, 4, 2]) {
		cutoff = findCutoff(messages, keep);
		if (cutoff >= 2) break;
	}
	if (cutoff < 2) return null;

	const older = messages.slice(0, cutoff);
	const transcript = transcribe(older);

	// A real call on the real seam, so the summary itself shows up on the wire
	// with its own token cost. Compaction is not free, and pretending otherwise
	// would be the wrong lesson.
	const llm = makeModel(bus, { model, streaming: false });
	const reply = await llm.invoke([{ role: 'user', content: PROMPT + transcript }]);
	const summary = textOf(reply as AnyMessage).trim();
	if (!summary) return null;

	const { HumanMessage } = await import('@langchain/core/messages');

	// The originals are archived, not destroyed — same convention the harness's
	// own summarizer uses, so both paths leave the same trail.
	const filePath = `/conversation_history/${threadId}-${older.length}.md`;
	const now = new Date().toISOString();

	// `lc_source: 'summarization'` is not decoration. It is what makes the
	// harness's own `isSummaryMessage` recognise this as a summary, so that a
	// later automatic compaction folds the *conversation* again rather than
	// folding our summary into a summary of a summary.
	const summaryMessage = new HumanMessage({
		content: `[Earlier conversation, compacted. Full transcript at ${filePath}]\n\n${summary}`,
		additional_kwargs: { lc_source: 'summarization' }
	});

	// Write the harness's own channel rather than rewriting the message list.
	//
	// `SummarizationMiddleware` never deletes messages. It records a cutoff and a
	// summary, then rebuilds `[summary, ...messages.slice(cutoff)]` when it calls
	// the model. Using the same channel instead of a parallel mechanism buys four
	// things at once: the stored history stays whole, the summary is *prepended*
	// rather than trailing the conversation as if it were the user's latest
	// utterance, the middleware's own cutoff arithmetic stays correct when the
	// automatic trigger later fires, and — because it is an ordinary graph
	// channel — a rewind rolls the compaction back with everything else.
	await agent.updateState(config, {
		_summarizationEvent: { cutoffIndex: cutoff, summaryMessage, filePath },
		files: {
			[filePath]: {
				content: transcript,
				mimeType: 'text/markdown',
				created_at: now,
				modified_at: now
			}
		}
	});

	return { removed: older.length, summary, transcript, filePath };
}
