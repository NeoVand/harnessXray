import type { EventBus } from './bus.svelte';
import type { XrayEvent } from './events';
import { SYSTEM_PROMPT } from '$lib/agent/prompt';
import { INPUT_LIMIT } from '$lib/agent/models';
import { BASE_AGENT_PROMPT, TASK_SYSTEM_PROMPT } from 'deepagents/browser';

/** The first line with something on it — how a prompt fragment announces itself. */
function firstLine(prompt: string): string {
	return (
		prompt
			.split('\n')
			.map((l) => l.trim())
			.find((l) => l.length > 3) ?? ''
	);
}

/** Where the earliest of several markers appears, or -1 if none do. */
function firstIndexOf(text: string, markers: string[]): number {
	let at = -1;
	for (const m of markers) {
		if (!m) continue;
		const i = text.indexOf(m);
		if (i >= 0 && (at < 0 || i < at)) at = i;
	}
	return at;
}

/**
 * What was actually in the context window.
 *
 * Not a model of what we think we sent — a decomposition of the exact request
 * body that went out. Every byte the model saw is in there, in order, and the
 * paired response tells us what the provider charged for it. So the panel can
 * be specific in a way a reconstruction never could: this is the prompt, these
 * are the schemas, this is the eleventh tool result, and together they cost
 * that many tokens.
 *
 * Two shapes are handled. The Responses API (what we use) carries an `input`
 * array and *no* `instructions` field — the system prompt is simply the first
 * item, with role `developer` for reasoning models. Reading `body.instructions`
 * therefore finds nothing, which is exactly why the old Prompt panel was always
 * empty. Chat Completions is handled too, so the panel does not break if the
 * model seam ever switches back.
 */

export type PieceGroup = 'system' | 'tools' | 'messages';

export interface ContextPiece {
	id: string;
	group: PieceGroup;
	/** Short name shown in the row. */
	label: string;
	/** One or two words of context for the row, e.g. a tool name or role. */
	note?: string;
	color: string;
	chars: number;
	/** Apportioned share of the request's real input tokens. */
	tokens: number;
	/** The full text, for expansion. */
	text: string;
	/** Only meaningful inside `system`: did we write this, or the harness? */
	ours?: boolean;
}

export interface ContextShot {
	/** The `http_request` event this was read from. */
	id: string;
	seq: number;
	t: number;
	model: string;
	pieces: ContextPiece[];
	chars: number;
	/** Real input tokens when the reply came back, estimated until then. */
	tokens: number;
	/** True once the provider has told us the real number. */
	measured: boolean;
	/** Of `tokens`, how many were cache hits — i.e. billed at a tenth. */
	cached: number;
	limit: number;
	/** Which model call this is within the loaded run, 1-based. */
	turn: number;
}

/**
 * The seams in the system prompt.
 *
 * `createDeepAgent` builds one string: our prefix, then its own base prompt,
 * then one fragment per middleware it installs. Nothing separates them on the
 * wire, so the split has to be recovered by looking for each fragment's opening
 * line.
 *
 * Each band carries a LIST of markers, first hit wins, and that is not
 * over-engineering — it is what an upgrade actually looks like. deepagents
 * 1.12 deleted the filesystem middleware's prompt fragment outright (its
 * guidance moved into the tool schemas), so `## Filesystem Tools` matches
 * nothing on a current run. But the bundled demo and every archived thread were
 * recorded against 1.11, and those still contain it. A single marker would have
 * to choose which of the two to read correctly.
 *
 * Markers that upstream exports as constants are taken from the package rather
 * than retyped here, so they cannot drift from the thing they describe — with
 * the short historical literal kept behind them for exactly the reason above.
 * A band that matches nothing degrades into the one before it rather than
 * breaking the panel.
 */
const BANDS: { key: string; label: string; markers: string[]; color: string }[] = [
	{
		key: 'base',
		label: 'deep agent base',
		markers: [firstLine(BASE_AGENT_PROMPT), 'You are a Deep Agent'],
		color: 'var(--hx-model)'
	},
	{ key: 'plan', label: 'plan', markers: ['## `write_todos`'], color: 'var(--hx-state)' },
	{
		key: 'files',
		label: 'filesystem',
		// Gone as of 1.12 — kept so archived runs still decompose correctly.
		markers: ['## Filesystem Tools'],
		color: 'var(--hx-fs)'
	},
	{
		key: 'task',
		label: 'subagents',
		markers: [firstLine(TASK_SYSTEM_PROMPT), '## `task`'],
		color: 'var(--hx-subagent)'
	},
	{ key: 'skills', label: 'skills', markers: ['## Skills System'], color: 'var(--hx-tool)' },
	{ key: 'memory', label: 'memory', markers: ['<agent_memory>'], color: 'var(--hx-memory)' }
];

/** ~4 characters per token. Only used to apportion, never as a headline. */
const estimate = (chars: number) => Math.max(1, Math.round(chars / 4));

function asText(content: unknown): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
	return content
		.map((b) => {
			if (typeof b === 'string') return b;
			const part = b as { text?: string; type?: string };
			if (typeof part.text === 'string') return part.text;
			return part.type ? `[${part.type}]` : '';
		})
		.join('');
}

/**
 * Cut one assembled system prompt into its bands. Exported for the skills
 * test, which pins the installed package's prompt fragment to this
 * decomposition — if deepagents renames a marker, that test fails before the
 * panel silently degrades.
 */
export function splitSystem(text: string): ContextPiece[] {
	const hits = BANDS.map((b) => ({ ...b, at: firstIndexOf(text, b.markers) }))
		.filter((b) => b.at >= 0)
		.sort((a, b) => a.at - b.at);

	const pieces: ContextPiece[] = [];

	// Everything before the first harness fragment is what we wrote. Measured by
	// where the harness starts rather than by our own constant's length, so an
	// edit to prompt.ts can never make the two disagree.
	const head = hits.length ? text.slice(0, hits[0].at) : text;
	if (head.trim()) {
		pieces.push({
			id: 'sys:ours',
			group: 'system',
			label: 'yours',
			note: head.trim() === SYSTEM_PROMPT.trim() ? 'prompt.ts' : 'prompt.ts, adjusted',
			color: 'var(--hx-user)',
			chars: head.length,
			tokens: 0,
			text: head,
			ours: true
		});
	}

	hits.forEach((band, i) => {
		const end = i + 1 < hits.length ? hits[i + 1].at : text.length;
		const slice = text.slice(band.at, end);
		pieces.push({
			id: `sys:${band.key}`,
			group: 'system',
			label: band.label,
			note: 'added by the harness',
			color: band.color,
			chars: slice.length,
			tokens: 0,
			text: slice,
			ours: false
		});
	});

	return pieces;
}

interface ToolSchema {
	name?: string;
	description?: string;
	function?: { name?: string; description?: string };
}

function toolPieces(tools: unknown): ContextPiece[] {
	if (!Array.isArray(tools)) return [];
	return (tools as ToolSchema[]).map((t, i) => {
		const name = t.name ?? t.function?.name ?? `tool ${i + 1}`;
		const json = JSON.stringify(t, null, 2);
		return {
			id: `tool:${name}`,
			group: 'tools' as const,
			label: name,
			note: t.description ?? t.function?.description ?? '',
			color: 'var(--hx-tool)',
			chars: json.length,
			tokens: 0,
			text: json
		};
	});
}

interface InputItem {
	type?: string;
	role?: string;
	content?: unknown;
	name?: string;
	arguments?: string;
	call_id?: string;
	output?: unknown;
	summary?: unknown;
}

const ROLE_COLOR: Record<string, string> = {
	user: 'var(--hx-user)',
	developer: 'var(--hx-model)',
	system: 'var(--hx-model)',
	assistant: 'var(--hx-model)'
};

function messagePieces(items: unknown, systemSeen: { text: string }): ContextPiece[] {
	if (!Array.isArray(items)) return [];
	const pieces: ContextPiece[] = [];

	(items as InputItem[]).forEach((item, i) => {
		const type = item.type ?? 'message';
		const id = `msg:${i}`;

		if (type === 'function_call') {
			const args = item.arguments ?? '';
			pieces.push({
				id,
				group: 'messages',
				label: 'tool call',
				note: item.name ?? '',
				color: 'var(--hx-tool)',
				chars: args.length + (item.name?.length ?? 0),
				tokens: 0,
				text: `${item.name}(${args})`
			});
			return;
		}

		if (type === 'function_call_output') {
			const out = typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? '');
			pieces.push({
				id,
				group: 'messages',
				label: 'tool result',
				note: `${out.length.toLocaleString()} chars`,
				color: 'var(--hx-tool)',
				chars: out.length,
				tokens: 0,
				text: out
			});
			return;
		}

		if (type === 'reasoning') {
			const text = asText(item.summary ?? item.content);
			pieces.push({
				id,
				group: 'messages',
				label: 'reasoning',
				note: text ? 'summary' : 'opaque — billed, not shown',
				color: 'var(--hx-state)',
				chars: Math.max(text.length, 1),
				tokens: 0,
				text: text || 'The model reasoned here. Only an encrypted handle comes back.'
			});
			return;
		}

		const role = item.role ?? 'user';
		const text = asText(item.content);

		// The system prompt arrives as an ordinary input item — there is no
		// `instructions` field on this API. Peel the FIRST one off so it can be
		// decomposed into its bands. Any later system item is something a
		// middleware injected per call — show it as its own row, because "the
		// context can be edited on the way to the model" is exactly the lesson.
		if (role === 'system' || role === 'developer') {
			if (!systemSeen.text) {
				systemSeen.text = text;
				return;
			}
			pieces.push({
				id,
				group: 'messages',
				label: 'injected',
				note: 'added per call by middleware — never stored',
				color: 'var(--hx-state)',
				chars: Math.max(text.length, 1),
				tokens: 0,
				text
			});
			return;
		}

		pieces.push({
			id,
			group: 'messages',
			label: role,
			note: `${text.length.toLocaleString()} chars`,
			color: ROLE_COLOR[role] ?? 'var(--muted-foreground)',
			chars: Math.max(text.length, 1),
			tokens: 0,
			text
		});
	});

	return pieces;
}

/** Only the model's own traffic — arXiv and OpenAlex are not context. */
function isModelCall(e: XrayEvent): boolean {
	return e.kind === 'http_request' && e.url.includes('/responses');
}

function build(
	request: Extract<XrayEvent, { kind: 'http_request' }>,
	usage: { input: number; cached: number } | undefined,
	turn: number
): ContextShot {
	const body = (request.body ?? {}) as Record<string, unknown>;
	const seen = { text: '' };

	// Responses API uses `input`; Chat Completions uses `messages`.
	const messages = messagePieces(body.input ?? body.messages, seen);
	const system = splitSystem(
		seen.text || (typeof body.instructions === 'string' ? body.instructions : '')
	);
	const tools = toolPieces(body.tools);

	const pieces = [...system, ...tools, ...messages];
	const chars = pieces.reduce((n, p) => n + p.chars, 0);

	// Apportion the real number rather than showing an estimate next to it.
	// Every row is approximate, the total is exact, and they add up — which is
	// the only combination that does not invite a wrong conclusion.
	const estTotal = pieces.reduce((n, p) => n + estimate(p.chars), 0) || 1;
	const total = usage?.input ?? estTotal;
	const scale = total / estTotal;
	for (const p of pieces) p.tokens = Math.round(estimate(p.chars) * scale);

	return {
		id: request.id,
		seq: request.seq,
		t: request.t,
		model: typeof body.model === 'string' ? body.model : '',
		pieces,
		chars,
		tokens: total,
		measured: !!usage,
		cached: usage?.cached ?? 0,
		limit: INPUT_LIMIT,
		turn
	};
}

function usageIndex(bus: EventBus) {
	const byHttp = new Map<string, { input: number; cached: number }>();
	for (const e of bus.events) {
		if (e.kind !== 'http_response' || !e.rawUsage) continue;
		const u = e.rawUsage as {
			input_tokens?: number;
			input_tokens_details?: { cached_tokens?: number };
		};
		byHttp.set(e.httpId, {
			input: u.input_tokens ?? 0,
			cached: u.input_tokens_details?.cached_tokens ?? 0
		});
	}
	return byHttp;
}

/** One entry per model call: enough to scrub and to draw the gauge. */
export interface ShotStub {
	id: string;
	turn: number;
	t: number;
	tokens: number;
	measured: boolean;
	/** True when this call sent *less* than the one before — i.e. it compacted. */
	shrank: boolean;
}

/**
 * The spine of the panel: every model call in the loaded run, oldest first.
 *
 * Deliberately cheap. Decomposing a request means slicing every message and
 * stringifying every tool schema, and doing that for the whole run on each
 * frame would cost more than the run does. The stubs are what the scrubber and
 * the status donut need; `shotAt` pays the real cost for the one turn on screen.
 */
export function shotStubs(bus: EventBus): ShotStub[] {
	const usage = usageIndex(bus);
	const stubs: ShotStub[] = [];
	for (const e of bus.events) {
		if (!isModelCall(e)) continue;
		const req = e as Extract<XrayEvent, { kind: 'http_request' }>;
		const known = usage.get(req.id);
		const tokens = known?.input ?? estimate(JSON.stringify(req.body ?? '').length);
		stubs.push({
			id: req.id,
			turn: stubs.length + 1,
			t: req.t,
			tokens,
			measured: !!known,
			shrank: stubs.length > 0 && tokens < stubs[stubs.length - 1].tokens
		});
	}
	return stubs;
}

/** Decompose one call. Returns undefined if that request is no longer held. */
export function shotAt(bus: EventBus, id: string): ContextShot | undefined {
	const stubs = shotStubs(bus);
	const turn = stubs.findIndex((s) => s.id === id);
	const e = bus.byId(id);
	if (!e || e.kind !== 'http_request') return undefined;
	return build(e, usageIndex(bus).get(id), turn + 1);
}

export function groupTotals(shot: ContextShot) {
	const sum = (g: PieceGroup) =>
		shot.pieces.filter((p) => p.group === g).reduce((n, p) => n + p.tokens, 0);
	return { system: sum('system'), tools: sum('tools'), messages: sum('messages') };
}
