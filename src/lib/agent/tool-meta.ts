import {
	AsteriskIcon,
	Bookmark01Icon,
	CheckListIcon,
	FileDownloadIcon,
	FileEditIcon,
	FileSearchIcon,
	Folder02Icon,
	Image01Icon,
	LeftToRightBlockQuoteIcon,
	ListViewIcon,
	Note01Icon,
	PaintBoardIcon,
	PaintBrush01Icon,
	PencilEdit01Icon,
	FolderSearchIcon,
	QuoteDownIcon,
	RoboticIcon,
	Search01Icon,
	SparklesIcon,
	Wrench01Icon
} from '@hugeicons/core-free-icons';
import type { IconValue } from '$lib/icons';

/**
 * Per-tool identity.
 *
 * The agent's tool list has grown well past a dozen entries and roughly half
 * are ours — so the interesting question at a glance is never "was a tool
 * called" but "*which* tool, and did we write it or did the harness supply
 * it". One glyph per tool answers the first; `origin` answers the second.
 *
 * The authoritative list is the live wire payload (Context tab → tool
 * schemas), never this comment: entries below are looked up by name and an
 * unknown name falls back to the generic wrench.
 *
 * No two tools share a glyph, and that is a rule rather than an accident. These
 * rows sit next to each other in the toolbox, in the context panel's schema
 * band, in a subagent's carrier strip and in a plan item's tool chips — some at
 * 9px — so a shared symbol makes the one list whose whole job is "*which* tool"
 * unable to answer. `search_papers` and `grep` are both searching, `ls` and
 * `list_figures` are both listing, `edit_file` and `edit_image` are both
 * editing: in each pair the object differs, and the glyph now says which.
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
	cite: { icon: QuoteDownIcon, origin: 'ours', blurb: 'a citation the run can vouch for' },
	bibliography: { icon: Bookmark01Icon, origin: 'ours', blurb: 'references from the registry' },
	extract_figures: { icon: Image01Icon, origin: 'ours', blurb: 'real figures from the paper' },
	list_figures: { icon: ListViewIcon, origin: 'ours', blurb: 'what the asset store holds' },
	present_outline: {
		icon: LeftToRightBlockQuoteIcon,
		origin: 'ours',
		blurb: 'structure, paused for approval'
	},
	generate_image: { icon: SparklesIcon, origin: 'ours', blurb: 'gpt-image-2 illustration' },
	edit_image: { icon: PaintBrush01Icon, origin: 'ours', blurb: 'redraw an existing image' },
	stylize_figure: {
		icon: PaintBoardIcon,
		origin: 'ours',
		blurb: 'redraw a paper figure as original art'
	},
	compact_context: { icon: AsteriskIcon, origin: 'ours', blurb: 'fold the conversation up' },

	// ── the harness supplies these; we never wrote them ──────────────────────
	write_todos: { icon: CheckListIcon, origin: 'harness', blurb: 'the plan channel' },
	ls: { icon: Folder02Icon, origin: 'harness', blurb: 'list the virtual filesystem' },
	read_file: { icon: Note01Icon, origin: 'harness', blurb: 'read from state' },
	write_file: { icon: FileEditIcon, origin: 'harness', blurb: 'write to state' },
	edit_file: { icon: PencilEdit01Icon, origin: 'harness', blurb: 'string-replace in a file' },
	glob: { icon: FolderSearchIcon, origin: 'harness', blurb: 'match paths by pattern' },
	grep: { icon: FileSearchIcon, origin: 'harness', blurb: 'search file contents' },
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
