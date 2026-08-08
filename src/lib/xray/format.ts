import type { DisplayKind, EventKind, XrayEvent } from './events';
import { ICON, type IconValue } from '$lib/icons';
import { isEvicted } from '$lib/agent/eviction';
import { subagentIcon } from '$lib/agent/subagent-meta';

/** One glyph per capture kind, so a run is scannable without reading labels. */
export const KIND_ICON: Record<EventKind, IconValue> = {
	http_request: ICON.request,
	http_sse_frame: ICON.frame,
	http_response: ICON.model,
	http_error: ICON.alert,
	run_start: ICON.message,
	run_end: ICON.ok,
	note: ICON.state,
	tool_start: ICON.tool,
	tool_end: ICON.tool,
	todo_update: ICON.todo,
	fs_write: ICON.file,
	image_start: ICON.sparkle,
	image_partial: ICON.sparkle,
	image_done: ICON.sparkle,
	paper_fetched: ICON.file,
	interrupt: ICON.pause,
	resume: ICON.run,
	node: ICON.node,
	compaction: ICON.compact,
	rewind: ICON.branch,
	upload: ICON.upload,
	skills_loaded: ICON.skill,
	figure_extracted: ICON.image
};

/**
 * The glyph for one event, after any per-event override.
 *
 * A skill being opened is a `read_file` like any other, so the kind alone would
 * draw a wrench. The override is what lets the row look like what it means.
 */
export function iconOf(e: XrayEvent): IconValue {
	if ((e.kind === 'tool_start' || e.kind === 'tool_end') && e.skill) return ICON.skill;
	// A dispatch is drawn as the delegate it dispatches, not as a generic robot —
	// the same glyph the lane header, the crew and the toolbox use, so the row
	// that opens a lane and the lane itself read as one thing.
	if (e.kind === 'tool_start' && e.name === 'task') {
		const type = (e.args as { subagent_type?: unknown } | null)?.subagent_type;
		if (typeof type === 'string') return subagentIcon(type);
	}
	return KIND_ICON[e.kind];
}

/** Timeline colour per display kind. */
export const KIND_COLOR: Record<DisplayKind, string> = {
	user: 'var(--hx-user)',
	model: 'var(--hx-model)',
	tool: 'var(--hx-tool)',
	state: 'var(--hx-state)',
	fs: 'var(--hx-fs)',
	memory: 'var(--hx-memory)',
	subagent: 'var(--hx-subagent)',
	interrupt: 'var(--hx-interrupt)',
	error: 'var(--hx-error)'
};

/**
 * Relative timestamp, at the precision the magnitude deserves: `+8.3s`,
 * `+42s`, `+3:44`. Milliseconds on a four-minute mark are noise — the exact
 * value is always one click away in the detail pane, which prints the whole
 * event. Still hx-num mono at every call site, so columns of these stay put.
 */
export function stamp(ms: number): string {
	const s = ms / 1000;
	if (s < 10) return `+${s.toFixed(1)}s`;
	if (s < 90) return `+${Math.round(s)}s`;
	const whole = Math.floor(s);
	return `+${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function bytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** A one-glance summary of an event for the timeline row. */
export function summarise(e: XrayEvent): string {
	switch (e.kind) {
		case 'http_request': {
			const model = (e.body as { model?: string } | null)?.model;
			return model ? `POST ${model}` : `${e.method} ${e.label ?? ''}`;
		}
		case 'http_sse_frame':
			return `frame ${e.i}`;
		case 'http_response':
			return e.streamed ? `${e.status} · ${e.frames} frames` : `${e.status}`;
		case 'http_error':
			return e.maybeRejectedKey ? 'blocked — key or network' : e.message.slice(0, 48);
		case 'run_start':
			return e.input.slice(0, 48);
		case 'run_end':
			return `${e.status} · ${(e.ms / 1000).toFixed(2)}s`;
		case 'note':
			return e.message;
		case 'tool_start': {
			if (e.skill) return `opening the ${e.skill} skill`;
			const a = e.args as Record<string, unknown> | null;
			const first = a && typeof a === 'object' ? Object.values(a)[0] : undefined;
			const hint = typeof first === 'string' ? ` ${first.slice(0, 34)}` : '';
			return `${e.name}${hint}`;
		}
		case 'tool_end':
			if (e.skill) return `${e.skill} → ${e.chars.toLocaleString()} chars of instructions`;
			return `${e.name} → ${e.chars.toLocaleString()} chars`;
		case 'todo_update':
			return e.statusChanged.length
				? `${e.statusChanged[0].content.slice(0, 30)} → ${e.statusChanged[0].to}`
				: `${e.todos.length} items planned`;
		case 'fs_write':
			// An eviction is not a write the agent chose to make, so it does not get
			// described as one. The size is the point: it is what the model was
			// spared, and it is the only number that explains why this happened.
			return isEvicted(e.path)
				? `${bytes(e.bytes)} of tool result parked — the model got a pointer`
				: `${e.op} ${e.path}`;
		case 'interrupt':
			return `paused — ${e.actions.map((a) => a.name).join(', ')}`;
		case 'resume':
			return `${e.decisions.map((d) => (d as { type?: string }).type).join(', ')} — ${e.actions.join(', ')}`;
		case 'image_start':
			return e.prompt.slice(0, 48);
		case 'image_partial':
			return `frame ${e.index + 1} · ${e.path}`;
		case 'image_done':
			return `${e.path} · ${(e.bytes / 1024).toFixed(0)} KB`;
		case 'paper_fetched':
			return `${e.arxivId} · ${e.source} · ${e.chars.toLocaleString()} chars`;
		case 'node':
			return e.nodeName;
		case 'rewind':
			return `re-ran from an earlier checkpoint · ${e.dropped} messages left the live branch`;
		case 'compaction':
			return `folded ${e.cutoffIndex} messages into a summary`;
		case 'upload':
			return `${e.path} · ${e.chars.toLocaleString()} chars`;
		case 'skills_loaded':
			return e.names.length ? e.names.join(', ') : 'no skills loaded';
		case 'figure_extracted':
			return `${e.path} · from arXiv:${e.arxivId}`;
	}
}

/** The pretty-printed payload the inspector shows for an event. */
export function detailOf(e: XrayEvent): unknown {
	switch (e.kind) {
		case 'http_request':
			return { url: e.url, method: e.method, headers: e.headers, body: e.body };
		case 'http_response':
			return {
				status: e.status,
				headers: e.headers,
				ms: Math.round(e.ms),
				...(e.ttfbMs ? { ttfbMs: Math.round(e.ttfbMs) } : {}),
				...(e.streamed ? { streamed: true, frames: e.frames } : { body: e.body }),
				...(e.rawUsage ? { rawUsage: e.rawUsage } : {})
			};
		case 'http_sse_frame':
			return e.parsed ?? e.raw;
		default:
			return e;
	}
}
