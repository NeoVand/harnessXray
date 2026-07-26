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
	'user' | 'model' | 'tool' | 'state' | 'fs' | 'memory' | 'subagent' | 'interrupt' | 'error';

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
	/**
	 * Which subagent produced this, when it is known.
	 *
	 * `scope` says *that* an event came from a subgraph — this says which one in
	 * human terms ("paper-reader"), recovered by pairing new namespaces with the
	 * `task` calls that spawned them. Absent on main-lane events, and absent when
	 * the pairing could not be made honestly.
	 */
	lane?: string;
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
	/**
	 * FNV-1a over the exact outgoing body string, stamped at capture.
	 *
	 * This is the replay key: a recorded exchange is matched to a live request
	 * by hash first, sequence second. Hashed here — not derived later from the
	 * parsed `body` — because re-stringifying does not always reproduce the
	 * bytes that were actually sent.
	 */
	bodyHash?: string;
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
	/**
	 * Set when this call is the agent opening a skill.
	 *
	 * Reaching for a skill is an ordinary `read_file` — that is the whole design,
	 * and it is why the moment is otherwise invisible in a list of tool calls.
	 * Naming it here lets the row say what is really happening without inventing
	 * an event that did not occur.
	 */
	skill?: string;
}

export interface ToolEnd extends EventBase {
	kind: 'tool_end';
	toolCallId: string;
	name: string;
	result: string;
	status: 'success' | 'error';
	chars: number;
	skill?: string;
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

export interface ImageStart extends EventBase {
	kind: 'image_start';
	path: string;
	prompt: string;
	size: string;
	quality: string;
}

/** A progressive frame. Carries a thumbnail, never the ~950KB original. */
export interface ImagePartial extends EventBase {
	kind: 'image_partial';
	path: string;
	index: number;
	preview: string;
}

export interface ImageDone extends EventBase {
	kind: 'image_done';
	path: string;
	preview: string;
	bytes: number;
	ms: number;
}

export interface PaperFetched extends EventBase {
	kind: 'paper_fetched';
	arxivId: string;
	title?: string;
	source: 'html' | 'pdf';
	chars: number;
	/** Data-URL thumbnails of the first few pages, when the source was a PDF. */
	pages: string[];
}

export interface InterruptEvent extends EventBase {
	kind: 'interrupt';
	interruptId: string;
	actions: { name: string; args: Record<string, unknown> }[];
	allowed: string[];
}

export interface ResumeEvent extends EventBase {
	kind: 'resume';
	decisions: unknown[];
	actions: string[];
}

export interface NodeRun extends EventBase {
	kind: 'node';
	nodeName: string;
	channels: string[];
}

/**
 * The context got too big and the harness folded it up.
 *
 * `SummarizationMiddleware` ships inside `createDeepAgent`, so this is not
 * something we implemented — it is something we noticed. It publishes a
 * `_summarizationEvent` on the updates stream, which is how a mechanism buried
 * three layers down becomes a row you can click.
 */
export interface Compaction extends EventBase {
	kind: 'compaction';
	/** How many messages were folded away. */
	cutoffIndex: number;
	summary: string;
	/** Where the originals were written. They are archived, not deleted. */
	filePath: string | null;
	trigger: 'auto' | 'manual';
	tokensBefore?: number;
}

/**
 * The conversation was taken back to an earlier checkpoint and re-run.
 *
 * Nothing was deleted to make this happen — the turns that followed are still
 * in the checkpointer as an orphaned branch. That is what a fork is, and it is
 * the most surprising thing about time travel in a graph, so it gets a row.
 */
export interface Rewind extends EventBase {
	kind: 'rewind';
	checkpointId: string;
	/** How many chat messages the live branch dropped. */
	dropped: number;
}

/** A file the user handed the agent. */
export interface Upload extends EventBase {
	kind: 'upload';
	path: string;
	mime: string;
	bytes: number;
	/** Extracted text length — a PDF is read, not attached. */
	chars: number;
}

/** The skill library the run started with. */
export interface SkillsLoaded extends EventBase {
	kind: 'skills_loaded';
	names: string[];
	/** What the whole library costs in the prompt: names and descriptions only. */
	chars: number;
	/** What it would cost if every SKILL.md were pasted in instead. */
	fullChars: number;
}

/**
 * A real figure lifted out of a paper's HTML edition.
 *
 * Not generated — extracted. The bytes came from arXiv, the caption from the
 * paper's own <figcaption>, and both are kept in the asset store so a review
 * can carry the actual figure with attribution instead of a description of it.
 */
export interface FigureExtracted extends EventBase {
	kind: 'figure_extracted';
	arxivId: string;
	path: string;
	caption: string;
	/** Thumbnail data-URL; the full image lives in the asset store. */
	preview: string;
	bytes: number;
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
	| ImageStart
	| ImagePartial
	| ImageDone
	| PaperFetched
	| InterruptEvent
	| ResumeEvent
	| NodeRun
	| Compaction
	| Rewind
	| Upload
	| SkillsLoaded
	| FigureExtracted;

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
	image_start: 'tool',
	image_partial: 'tool',
	image_done: 'tool',
	paper_fetched: 'fs',
	interrupt: 'interrupt',
	resume: 'interrupt',
	node: 'state',
	// Compaction is bucketed with memory rather than with the graph's own
	// bookkeeping: what it is really deciding is what gets kept.
	compaction: 'memory',
	// A fork is the graph's own bookkeeping about which run is live.
	rewind: 'state',
	upload: 'fs',
	skills_loaded: 'state',
	figure_extracted: 'fs'
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
	image_start: 'image',
	image_partial: 'frame',
	image_done: 'image',
	paper_fetched: 'paper',
	interrupt: 'pause',
	resume: 'resume',
	node: 'node',
	compaction: 'compact',
	rewind: 'rewind',
	upload: 'upload',
	skills_loaded: 'skills',
	figure_extracted: 'figure'
};

/**
 * One honest sentence per capture kind.
 *
 * Two consumers: the timeline shows these as tooltips on the kind label, and
 * the explain sidecar prepends them to its prompt so the model starts from the
 * app's own definition rather than inventing one. Definitions, not marketing —
 * each line should survive being read by someone who can also see the bytes.
 */
/**
 * Tooltip for a tool row that is really a skill being opened.
 *
 * The row's kind stays `tool_start` — reaching for a skill IS a read_file,
 * that is the design — but the moment deserves its own sentence, because it
 * is the second half of progressive disclosure: the point where one line of
 * prompt becomes the whole instruction file.
 */
export const SKILL_READ_HELP =
	'The agent opened a skill — an ordinary read_file of its SKILL.md. Until now the skill cost one line of prompt; its full instructions enter context here.';

export const KIND_HELP: Record<EventKind, string> = {
	http_request: 'The literal JSON body handed to the provider — every byte the model will see.',
	http_sse_frame: 'One raw server-sent frame, exactly as it came off the wire.',
	http_response: 'The reply envelope: status, headers, and the usage the provider billed.',
	http_error: 'The fetch itself failed — offline, or a bad key rejected with no CORS header.',
	run_start: 'One graph invocation begins: your message enters the state.',
	run_end: 'The invocation returned — finished, paused for approval, or errored.',
	note: 'The lab annotating its own log; the agent did not do this.',
	tool_start: 'The model asked for a tool; the harness is about to execute it.',
	tool_end: 'The tool returned. Its result is now part of every later request.',
	todo_update:
		'The agent rewrote its plan. write_todos is last-write-wins, so this is the whole list.',
	fs_write: 'A write to the virtual filesystem — a state channel, checkpointed with the run.',
	image_start: 'An image generation started; billed the moment it completes.',
	image_partial: 'A progressive frame of the image still being generated.',
	image_done: 'The finished image, saved to the asset store and referenced by path.',
	paper_fetched: 'A paper’s full text entered the run; the PDF itself was kept for you.',
	interrupt: 'The graph paused for a human decision. The stream ended; the state is checkpointed.',
	resume: 'A second invocation carrying your decision — same thread, so everything comes back.',
	node: 'One graph node committed its state update.',
	compaction:
		'Older messages were folded into a summary for the model. The originals are archived.',
	rewind:
		'The thread forked from an earlier checkpoint; the turns after it became an orphan branch.',
	upload: 'A file you handed the agent, written into its filesystem as text.',
	skills_loaded:
		'The library’s names and descriptions entered the prompt. Bodies load only when read.',
	figure_extracted: 'A real figure lifted from the paper’s HTML edition into the asset store.'
};
