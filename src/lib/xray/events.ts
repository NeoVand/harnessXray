/**
 * The event vocabulary of the lab.
 *
 * Two kinds, deliberately. `kind` is the *capture* kind — precise, one per thing
 * that can actually happen, because the inspector needs to tell an SSE frame
 * from a tool result. `displayKind` is the *timeline* kind — nine buckets, because
 * a human scanning a run needs nine colours, not thirty.
 *
 * `branchId` exists from day one. Checkpoint forking produces a *tree* of runs,
 * not a longer line, and retrofitting that into every derived view later would
 * mean rewriting all of them.
 */

export type DisplayKind =
	| 'user'
	| 'model'
	| 'tool'
	| 'state'
	| 'fs'
	| 'memory'
	| 'subagent'
	| 'interrupt'
	| 'error';

export type Scope = 'main' | `sub:${string}`;

/** Everything needed to place an event on the timeline and in the tree. */
export interface EventBase {
	id: string;
	/** Strictly monotonic. The only ordering key any view is allowed to trust. */
	seq: number;
	/** performance.now() at emit — monotonic, sub-ms. */
	t: number;
	displayKind: DisplayKind;
	scope: Scope;
	branchId: string;
	threadId?: string;
	/** LangChain callback ids — the edges that make the trace a tree. */
	runId?: string;
	parentRunId?: string;
	/** Links a semantic event to the literal bytes that carried it. */
	httpId?: string;
	toolCallId?: string;
	nodeName?: string;
	label?: string;
}

/* ── wire plane ─────────────────────────────────────────────────────────── */

export interface HttpRequest extends EventBase {
	kind: 'http_request';
	url: string;
	method: string;
	/** `authorization` is redacted before this ever exists. */
	headers: Record<string, string>;
	body: unknown;
	bytes: number;
}

export interface SseFrame extends EventBase {
	kind: 'http_sse_frame';
	httpId: string;
	i: number;
	/** The exact `data: {...}` line, unparsed. This is the raw LLM output. */
	raw: string;
	parsed?: unknown;
}

export interface HttpResponse extends EventBase {
	kind: 'http_response';
	httpId: string;
	status: number;
	headers: Record<string, string>;
	body?: unknown;
	streamed: boolean;
	frames?: number;
	ms: number;
	ttfbMs?: number;
	/** The provider usage object verbatim, before LangChain normalises it. */
	rawUsage?: unknown;
}

export interface HttpError extends EventBase {
	kind: 'http_error';
	url: string;
	message: string;
	/**
	 * A present-but-invalid key is rejected at OpenAI's edge with a 401 that
	 * carries no CORS header, so the browser reports a bare TypeError and we can
	 * read neither status nor body. Indistinguishable from being offline — which
	 * is why this is a suspicion, not a verdict.
	 */
	maybeRejectedKey: boolean;
}

/* ── run lifecycle ──────────────────────────────────────────────────────── */

export interface RunStart extends EventBase {
	kind: 'run_start';
	input: string;
}

export interface RunEnd extends EventBase {
	kind: 'run_end';
	status: 'done' | 'interrupted' | 'error';
	ms: number;
}

export interface NoteEvent extends EventBase {
	kind: 'note';
	message: string;
	detail?: unknown;
}

/* ── semantic plane: what the harness is actually doing ─────────────────── */

export interface ToolStart extends EventBase {
	kind: 'tool_start';
	toolCallId: string;
	name: string;
	args: unknown;
	/** False for tools the harness supplied rather than us — write_todos, ls, … */
	ours: boolean;
}

export interface ToolEnd extends EventBase {
	kind: 'tool_end';
	toolCallId: string;
	name: string;
	result: string;
	status: 'success' | 'error';
	chars: number;
}

export interface Todo {
	content: string;
	status: 'pending' | 'in_progress' | 'completed';
}

export interface TodoUpdate extends EventBase {
	kind: 'todo_update';
	todos: Todo[];
	/** `todos` is last-write-wins, so a partial write silently destroys the list. */
	added: string[];
	statusChanged: { content: string; from: string; to: string }[];
}

export interface FsWrite extends EventBase {
	kind: 'fs_write';
	op: 'write' | 'edit' | 'delete';
	path: string;
	bytes: number;
}

export interface NodeRun extends EventBase {
	kind: 'node';
	nodeName: string;
	channels: string[];
}

export type XrayEvent =
	| HttpRequest
	| SseFrame
	| HttpResponse
	| HttpError
	| RunStart
	| RunEnd
	| NoteEvent
	| ToolStart
	| ToolEnd
	| TodoUpdate
	| FsWrite
	| NodeRun;

export type EventKind = XrayEvent['kind'];

/** Capture kind → the timeline bucket it renders in. */
export const DISPLAY_OF: Record<EventKind, DisplayKind> = {
	http_request: 'model',
	http_sse_frame: 'model',
	http_response: 'model',
	http_error: 'error',
	run_start: 'user',
	run_end: 'state',
	note: 'state',
	tool_start: 'tool',
	tool_end: 'tool',
	todo_update: 'state',
	fs_write: 'fs',
	node: 'state'
};

/** Short mono label shown in the timeline gutter. */
export const KIND_LABEL: Record<EventKind, string> = {
	http_request: 'request',
	http_sse_frame: 'frame',
	http_response: 'response',
	http_error: 'error',
	run_start: 'run',
	run_end: 'end',
	note: 'note',
	tool_start: 'tool',
	tool_end: 'result',
	todo_update: 'plan',
	fs_write: 'file',
	node: 'node'
};
