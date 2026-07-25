import type { DisplayKind, EventKind, XrayEvent } from './events';
import { ICON, type IconValue } from '$lib/icons';

/** One glyph per capture kind, so a run is scannable without reading labels. */
export const KIND_ICON: Record<EventKind, IconValue> = {
	http_request: ICON.next,
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
	node: ICON.graph
};

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

/** Relative timestamp, monospace-stable: +1.284s */
export function stamp(ms: number): string {
	return `+${(ms / 1000).toFixed(3)}s`;
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
			const a = e.args as Record<string, unknown> | null;
			const first = a && typeof a === 'object' ? Object.values(a)[0] : undefined;
			const hint = typeof first === 'string' ? ` ${first.slice(0, 34)}` : '';
			return `${e.name}${hint}`;
		}
		case 'tool_end':
			return `${e.name} → ${e.chars.toLocaleString()} chars`;
		case 'todo_update':
			return e.statusChanged.length
				? `${e.statusChanged[0].content.slice(0, 30)} → ${e.statusChanged[0].to}`
				: `${e.todos.length} items planned`;
		case 'fs_write':
			return `${e.op} ${e.path}`;
		case 'node':
			return e.nodeName;
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
