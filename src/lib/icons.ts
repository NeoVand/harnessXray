/**
 * The icon vocabulary.
 *
 * One place, for two reasons. Hugeicons exports 6,124 symbols and the names are
 * not guessable (`RoboticIcon`, not `RobotIcon`; `Layers01Icon`, not
 * `LayersIcon`) — every name here was checked against `dist/types/index.d.ts`
 * rather than assumed. And routing every icon through one module means a
 * semantic rename is one edit, not a grep.
 *
 * These are the free stroke set: each icon is authored with
 * `stroke: currentColor` and `strokeWidth: 1.5`, so they inherit text colour and
 * sit correctly next to type at small sizes.
 *
 * Usage — the icon is a *value* passed to the `icon` prop, not a component:
 *     <HugeiconsIcon icon={ICON.settings} size={14} />
 */
import {
	Activity01Icon,
	AiBrain01Icon,
	Alert01Icon,
	ArrowDown01Icon,
	ArrowRight01Icon,
	ArrowShrink02Icon,
	Attachment01Icon,
	BrainIcon,
	Image01Icon,
	MagicWand01Icon,
	PieChartIcon,
	Upload01Icon,
	Cancel01Icon,
	ChartLineData01Icon,
	FullScreenIcon,
	Download01Icon,
	BookOpen01Icon,
	CheckListIcon,
	PlusSignIcon,
	TextAlignLeftIcon,
	Clock01Icon,
	ComputerIcon,
	Database01Icon,
	Delete02Icon,
	File01Icon,
	FilterIcon,
	FlashIcon,
	FolderOpenIcon,
	GitBranchIcon,
	Github01Icon,
	Linkedin01Icon,
	Key01Icon,
	Layers01Icon,
	Message01Icon,
	MoreHorizontalIcon,
	PackageIcon,
	PauseIcon,
	PlayIcon,
	ArrowTurnBackwardIcon,
	RoboticIcon,
	Search01Icon,
	SentIcon,
	Settings01Icon,
	SourceCodeIcon,
	SparklesIcon,
	Sun01Icon,
	Moon02Icon,
	Tick01Icon,
	ViewIcon,
	ViewOffIcon,
	WorkflowSquare01Icon,
	Wrench01Icon
} from '@hugeicons/core-free-icons';

export const ICON = {
	// chrome
	settings: Settings01Icon,
	light: Sun01Icon,
	dark: Moon02Icon,
	key: Key01Icon,
	show: ViewIcon,
	hide: ViewOffIcon,
	clear: Delete02Icon,
	close: Cancel01Icon,
	send: SentIcon,
	more: MoreHorizontalIcon,
	next: ArrowRight01Icon,
	expand: ArrowDown01Icon,
	expandView: FullScreenIcon,
	download: Download01Icon,
	help: BookOpen01Icon,
	ok: Tick01Icon,
	alert: Alert01Icon,
	newChat: PlusSignIcon,
	history: Clock01Icon,
	todo: CheckListIcon,
	prompt: TextAlignLeftIcon,
	attach: Attachment01Icon,
	upload: Upload01Icon,
	image: Image01Icon,
	generate: MagicWand01Icon,
	context: PieChartIcon,
	compact: ArrowShrink02Icon,
	filter: FilterIcon,
	github: Github01Icon,
	linkedin: Linkedin01Icon,
	/**
	 * Take the conversation back to this point and run it again.
	 *
	 * An arrow turning back, not a rotating circle — a circle reads as "refresh",
	 * which is the wrong promise for an action that discards the turns after it.
	 */
	rewind: ArrowTurnBackwardIcon,

	// the agent's anatomy — one icon per concept, used consistently everywhere
	agent: AiBrain01Icon,
	model: BrainIcon,
	tool: Wrench01Icon,
	graph: WorkflowSquare01Icon,
	branch: GitBranchIcon,
	state: Layers01Icon,
	memory: Database01Icon,
	file: File01Icon,
	files: FolderOpenIcon,
	subagent: RoboticIcon,
	skill: PackageIcon,
	code: SourceCodeIcon,
	search: Search01Icon,
	wire: Activity01Icon,
	frame: FlashIcon,
	message: Message01Icon,
	tokens: ChartLineData01Icon,
	time: Clock01Icon,
	run: PlayIcon,
	pause: PauseIcon,
	compute: ComputerIcon,
	sparkle: SparklesIcon
} as const;

export type IconName = keyof typeof ICON;

/**
 * The type of an icon value, derived from the registry rather than imported.
 * Hugeicons' own `IconSvgElement` is not exported from the Svelte package, and
 * deriving it here means the two can never drift.
 */
export type IconValue = (typeof ICON)[IconName];
