import {
	AsteriskIcon,
	CheckListIcon,
	FileDownloadIcon,
	FileEditIcon,
	FileSearchIcon,
	ListViewIcon,
	PencilEdit01Icon,
	RoboticIcon,
	Search01Icon,
	Wrench01Icon
} from '@hugeicons/core-free-icons';
import type { IconValue } from '$lib/icons';

/**
 * Per-tool identity.
 *
 * The agent's tool list is 10 entries long and only 2 of them are ours — so the
 * interesting question at a glance is never "was a tool called" but "*which*
 * tool, and did we write it or did the harness supply it". One glyph per tool
 * answers the first; `origin` answers the second.
 *
 * Verified against the live wire payload rather than the docs: the request
 * carries search_papers, fetch_paper, write_todos, ls, read_file, write_file,
 * edit_file, glob, grep, task.
 */
export interface ToolMeta {
	icon: IconValue;
	origin: 'ours' | 'harness';
	blurb: string;
}

const META: Record<string, ToolMeta> = {
	// ── ours ────────────────────────────────────────────────────────────────
	search_papers: { icon: Search01Icon, origin: 'ours', blurb: 'OpenAlex literature search' },
	fetch_paper: { icon: FileDownloadIcon, origin: 'ours', blurb: 'arXiv full text' },

	// ── the harness supplies these; we never wrote them ──────────────────────
	write_todos: { icon: CheckListIcon, origin: 'harness', blurb: 'the plan channel' },
	ls: { icon: ListViewIcon, origin: 'harness', blurb: 'list the virtual filesystem' },
	read_file: { icon: FileSearchIcon, origin: 'harness', blurb: 'read from state' },
	write_file: { icon: FileEditIcon, origin: 'harness', blurb: 'write to state' },
	edit_file: { icon: PencilEdit01Icon, origin: 'harness', blurb: 'string-replace in a file' },
	glob: { icon: AsteriskIcon, origin: 'harness', blurb: 'match paths by pattern' },
	grep: { icon: Search01Icon, origin: 'harness', blurb: 'search file contents' },
	task: { icon: RoboticIcon, origin: 'harness', blurb: 'delegate to a subagent' }
};

const FALLBACK: ToolMeta = { icon: Wrench01Icon, origin: 'ours', blurb: '' };

export function toolMeta(name: string): ToolMeta {
	return META[name] ?? FALLBACK;
}

/** Colour by origin — ours vs. the harness's, the distinction worth seeing. */
export function toolColor(name: string): string {
	return toolMeta(name).origin === 'harness' ? 'var(--hx-state)' : 'var(--hx-tool)';
}
