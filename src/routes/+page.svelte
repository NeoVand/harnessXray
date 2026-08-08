<script lang="ts">
	import { tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as Resizable from '$lib/components/ui/resizable';
	import Conversation from '$lib/components/chat/Conversation.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import EventTimeline from '$lib/components/xray/EventTimeline.svelte';
	import PlanPanel from '$lib/components/xray/PlanPanel.svelte';
	import Inspector from '$lib/components/xray/Inspector.svelte';
	import SettingsSheet from '$lib/components/SettingsSheet.svelte';
	import DocumentViewer from '$lib/components/DocumentViewer.svelte';
	import BookViewer from '$lib/components/BookViewer.svelte';
	import SkillsSheet from '$lib/components/SkillsSheet.svelte';
	import AboutSheet from '$lib/components/AboutSheet.svelte';
	import { REPO_URL } from '$lib/meta';
	import ThemeIcon from '$lib/components/ThemeIcon.svelte';
	import { theme } from '$lib/state/theme.svelte';
	import ContextPanel from '$lib/components/xray/ContextPanel.svelte';
	import { replay } from '$lib/xray/replay.svelte';
	import { exitReplay } from '$lib/lab/demo';
	import ContextDonut from '$lib/components/xray/ContextDonut.svelte';
	import RunPanel from '$lib/components/xray/RunPanel.svelte';
	import FilterMenu from '$lib/components/xray/FilterMenu.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { KIND_COLOR } from '$lib/xray/format';
	import type { DisplayKind } from '$lib/xray/events';
	import { shotStubs } from '$lib/xray/context';
	import { INPUT_LIMIT, COMPACT_AT } from '$lib/agent/models';
	import { compact } from '$lib/xray/usage';
	import { session } from '$lib/agent/session.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';
	import { tip } from '$lib/hooks/tip';

	let selectedId = $state<string | null>(null);
	let settingsOpen = $state(false);
	let historyOpen = $state(false);
	let openPath = $state<string | null>(null);
	let readPath = $state<string | null>(null);
	/** The open book chapter, or null when the X-ray has its pane. */
	let bookPage = $state<string | null>(null);
	let skillsOpen = $state(false);
	let aboutOpen = $state(false);

	let showFrames = $state(false);

	/** The composer's live height — it grows with text, chips and attachments,
	 * and the conversation's bottom padding has to grow with it. */
	let composerH = $state(64);

	// The context panel's two readings. Owned here, not in the panel, because
	// the switch lives in the pane's own bar — a component boundary above the
	// thing it drives.
	let contextView = $state<'pieces' | 'raw'>('pieces');

	// Owned here so the inspector's dashboard tab survives a document being
	// opened and closed — that unmounts the whole component, and local state
	// would snap back on every close. Graph first: it is the fastest-moving
	// panel, and the default view should be the one that is alive.
	let inspectorBottom = $state<'graph' | 'tools' | 'subagents' | 'skills' | 'memory'>('graph');

	/**
	 * The middle pane's second reading.
	 *
	 * The ledger used to sit in the inspector's dashboard row, competing with the
	 * graph for a slot nobody wanted it in — it answers the same question the
	 * timeline does ("what did this run do") in a different unit, so it belongs
	 * beside the timeline rather than beside the topology.
	 */
	let midView = $state<'events' | 'ledger'>('events');

	const frameCount = $derived.by(() => {
		void bus.version;
		return bus.events.reduce((n, e) => n + (e.kind === 'http_sse_frame' ? 1 : 0), 0);
	});

	// Filters hold what is *hidden*, so "nothing hidden" is the empty set and a
	// kind that only appears later is visible without anyone updating a list.
	// SvelteSets: the FilterMenu mutates them in place, and `.has()` in every
	// panel re-runs off those mutations — same object, live contents.
	const hiddenKinds = new SvelteSet<string>();
	const hiddenGroups = new SvelteSet<string>();

	const KIND_LABELS: Record<DisplayKind, string> = {
		user: 'you',
		model: 'model & wire',
		tool: 'tools',
		state: 'graph state',
		fs: 'filesystem',
		memory: 'memory',
		subagent: 'subagents',
		interrupt: 'pauses',
		error: 'errors'
	};

	/** Only offer to hide what is actually in the log, with live counts. */
	const kindOptions = $derived.by(() => {
		void bus.version;
		const seen: Partial<Record<DisplayKind, number>> = {};
		for (const e of bus.events) {
			if (e.kind === 'http_sse_frame' && !showFrames) continue;
			seen[e.displayKind] = (seen[e.displayKind] ?? 0) + 1;
		}
		return (Object.keys(KIND_LABELS) as DisplayKind[])
			.filter((k) => seen[k] !== undefined)
			.map((k) => ({
				key: k,
				label: KIND_LABELS[k],
				color: KIND_COLOR[k],
				count: seen[k]
			}));
	});

	const GROUP_OPTIONS = [
		{ key: 'system', label: 'system prompt', color: 'var(--hx-model)' },
		{ key: 'tools', label: 'tool schemas', color: 'var(--hx-tool)' },
		{ key: 'messages', label: 'messages', color: 'var(--hx-user)' }
	];

	// Every model call in the run, for the context pane's pager — and its last
	// entry is the live context the next request builds on. Read from the wire
	// like everything else here.
	const ctxStubs = $derived.by(() => {
		void bus.version;
		return shotStubs(bus);
	});
	const lastShot = $derived(ctxStubs.at(-1));
	/** The live window, for the chat header — always the head, never the pager. */
	const liveUsed = $derived(lastShot ? Math.min(1, lastShot.tokens / INPUT_LIMIT) : 0);
	/** Turns you have taken, which is what "how long is this chat" means. */
	const turns = $derived(session.messages.filter((m) => m.role === 'user').length);

	/** Which model call the context panel shows; null follows the run. */
	let ctxPinned = $state<string | null>(null);
	const ctxIndex = $derived(ctxStubs.findIndex((s) => s.id === (ctxPinned ?? lastShot?.id)));

	function ctxStep(by: number) {
		if (!ctxStubs.length) return;
		const at = Math.max(
			0,
			Math.min(ctxStubs.length - 1, (ctxIndex < 0 ? ctxStubs.length - 1 : ctxIndex) + by)
		);
		ctxPinned = at === ctxStubs.length - 1 ? null : ctxStubs[at].id;
	}

	// Follow the run as it happens, but stop following the moment the user
	// takes control by selecting something. Auto-advance that fights you is
	// worse than no auto-advance.
	let following = $state(true);
	$effect(() => {
		void bus.version;
		if (!following) return;
		const last = bus.events.at(-1);
		if (last && last.kind !== 'http_sse_frame') selectedId = last.id;
	});

	/**
	 * A deliberate jump: select the row AND scroll it into view.
	 *
	 * The follow-the-run effect above sets `selectedId` too, and scrolling on
	 * that would drag the timeline back down every time an event landed. So the
	 * reveal is a separate signal that only this path raises.
	 */
	let revealId = $state<string | null>(null);
	function select(id: string) {
		following = false;
		selectedId = id;
		revealId = id;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && session.busy) {
			e.preventDefault();
			session.stop();
			return;
		}
		if (!(e.metaKey || e.ctrlKey)) return;
		if (e.key === ',') {
			e.preventDefault();
			settingsOpen = true;
		} else if (e.key === 'n') {
			e.preventDefault();
			session.newThread();
		}
	}

	function ago(t: number) {
		const s = Math.round((Date.now() - t) / 1000);
		if (s < 60) return 'just now';
		if (s < 3600) return `${Math.floor(s / 60)}m ago`;
		if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
		return `${Math.floor(s / 86400)}d ago`;
	}

	const statusColor = $derived(
		session.status === 'running'
			? 'var(--hx-model)'
			: session.status === 'error'
				? 'var(--hx-error)'
				: 'var(--muted-foreground)'
	);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="relative h-dvh overflow-hidden">
	<!-- One hairline, no card — and glass now: the header floats over the
	     columns and the conversation scrolls beneath it. -->
	<header
		class="hx-rule hx-frost absolute inset-x-0 top-0 z-40 flex h-10 items-center gap-2 border-b
		       px-3"
	>
		<button
			class="flex items-center gap-2 transition-opacity hover:opacity-70"
			onclick={() => (aboutOpen = true)}
			aria-label="About harnessXray"
			{@attach tip('About harnessXray — what this lab is and how it works')}
		>
			<HugeiconsIcon icon={ICON.agent} size={18} strokeWidth={1.5} />
			<span class="hx-wordmark text-[15px]">harness<em>Xray</em></span>
		</button>

		<span class="ml-1 flex items-center gap-1.5">
			<span
				class="inline-block h-1.5 w-1.5 rounded-full"
				style:background={statusColor}
				style:animation={session.busy ? 'hx-pulse 1.2s ease-in-out infinite' : undefined}
			></span>
			<span class="hx-eyebrow">{session.status}</span>
		</span>

		{#if replay.active}
			<!-- Replay is a different physics — no network, no key, no spend — and
			     the header is the one place that is always visible to say so. -->
			<span
				class="ml-2 flex items-center gap-1.5 rounded-full border px-2 py-0.5"
				style:border-color="color-mix(in oklab, var(--hx-interrupt) 50%, transparent)"
			>
				<span class="hx-eyebrow" style:color="var(--hx-interrupt)">
					replay · {replay.fixtureName || 'fixture'} · no network
				</span>
				<button
					class="hx-eyebrow text-muted-foreground transition-colors hover:text-foreground"
					onclick={exitReplay}
					{@attach tip('Leave replay mode and start a fresh live chat')}
				>
					exit
				</button>
			</span>
		{/if}

		<!-- New chat and history moved down into the chat column's own header:
		     they act on the conversation, not on the app, and the app bar is the
		     wrong distance from the thing they change. -->
		<div class="ml-auto flex items-center gap-3">
			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				style:color={bookPage ? 'var(--hx-accent)' : undefined}
				onclick={() => (bookPage = bookPage ? null : 'the-harness')}
				aria-label="The book"
				{@attach tip(
					bookPage ? 'Close the book' : 'The book — ten chapters on how this harness works'
				)}
			>
				<HugeiconsIcon icon={ICON.help} size={15} strokeWidth={1.5} />
			</button>

			<!-- One click, one theme. The glyph is the readout — it says where you
			     are, and the tooltip names where the next click lands, so the cycle
			     is never a guess. -->
			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => theme.cycle()}
				aria-label="Theme: {theme.spec.label}. Switch to {theme.next.label}"
				{@attach tip(`${theme.spec.label} · next: ${theme.next.label}`)}
			>
				<ThemeIcon id={theme.current} />
			</button>

			<a
				href={REPO_URL}
				target="_blank"
				rel="noreferrer noopener"
				class="text-muted-foreground transition-colors hover:text-foreground"
				aria-label="Source on GitHub"
				{@attach tip('Source on GitHub')}
			>
				<HugeiconsIcon icon={ICON.github} size={15} strokeWidth={1.5} />
			</a>

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (settingsOpen = true)}
				aria-label="Settings"
				{@attach tip('Settings — model, API key, step ceiling  ⌘,')}
			>
				<HugeiconsIcon icon={ICON.settings} size={15} strokeWidth={1.5} />
			</button>
		</div>
	</header>

	<div class="h-full">
		<Resizable.PaneGroup direction="horizontal" autoSaveId="hx:root">
			<!-- The app. The column is full-bleed: the transcript slides under
			     the frosted header above and the frosted composer below, and the
			     paddings — one fixed, one measured — keep the resting text clear
			     of both. -->
			<Resizable.Pane defaultSize={42} minSize={26}>
				<div class="relative flex h-full min-h-0 flex-col">
					<!-- The chat's own header, on the same frosted glass and the same
					     hairline as every instrument's. The column was the one part of
					     the app without one, which made it read as background rather
					     than as a panel — and left its two controls stranded in the app
					     bar beside settings and the theme, which act on something else
					     entirely. -->
					<header
						class="hx-rule hx-frost absolute inset-x-0 top-10 z-30 flex h-9 items-center gap-3
						       border-b px-3"
					>
						<span
							class="hx-eyebrow flex h-full items-center gap-1.5"
							style:color="var(--hx-accent)"
						>
							<HugeiconsIcon icon={ICON.message} size={12} strokeWidth={1.5} />
							chat
							{#if turns}
								<span class="hx-num text-[9px] opacity-60">{turns}</span>
							{/if}
						</span>

						<span class="ml-auto flex items-center gap-3 text-muted-foreground">
							{#if lastShot}
								<!-- How full the window is *now* — the number that decides whether
								     the next message is worth sending as-is. The context pane's
								     donut follows its own pager; this one always reads the live
								     head. -->
								<span
									class="flex items-center gap-1.5"
									{@attach tip(
										`${lastShot.tokens.toLocaleString()} of ${compact(INPUT_LIMIT)} tokens — ${Math.round(liveUsed * 100)}% of the window${liveUsed >= COMPACT_AT ? '; the harness compacts past here' : ''}`
									)}
								>
									<ContextDonut used={liveUsed} warn={COMPACT_AT} />
									<span class="hx-num text-[10px]">{compact(lastShot.tokens)}</span>
								</span>
							{/if}

							<button
								class="transition-colors hover:text-foreground"
								onclick={session.newThread.bind(session)}
								aria-label="New chat"
								{@attach tip('New chat  ⌘N')}
							>
								<HugeiconsIcon icon={ICON.newChat} size={14} strokeWidth={1.5} />
							</button>

							<button
								class="transition-colors hover:text-foreground"
								style:color={historyOpen ? 'var(--hx-accent)' : undefined}
								onclick={() => (historyOpen = !historyOpen)}
								aria-label="History"
								{@attach tip(historyOpen ? 'Hide saved chats' : 'Saved chats on this device')}
							>
								<HugeiconsIcon icon={ICON.history} size={14} strokeWidth={1.5} />
							</button>
						</span>
					</header>

					{#if historyOpen}
						<!-- An overlay, not a shelf.
						     It used to be a flex child, so opening it SHOVED the transcript
						     down and closing it snapped everything back — the conversation
						     jumped every time you glanced at your chats. Now it hangs over
						     the column on the same frosted glass the header and composer
						     already use, and the transcript passes underneath. -->
						<div
							class="hx-rule hx-frost absolute inset-x-0 top-[76px] z-30 flex max-h-[45%] flex-col
							       border-b shadow-[0_10px_30px_-18px_rgb(0_0_0/0.55)]"
						>
							<!-- Title and dismiss share a row: closing a panel should not mean
							     hunting for the control that opened it. -->
							<div class="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
								<span class="hx-eyebrow">history</span>
								<button
									class="text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (historyOpen = false)}
									aria-label="Close history"
									{@attach tip('Close')}
								>
									<HugeiconsIcon icon={ICON.close} size={13} strokeWidth={1.5} />
								</button>
							</div>

							<div class="min-h-0 flex-1 overflow-y-auto">
								{#if session.threads.length === 0}
									<p class="px-4 pb-3 text-xs text-muted-foreground">No saved chats yet.</p>
								{:else}
									{#each session.threads as t (t.id)}
										<div
											class="group flex items-center transition-colors hover:bg-muted/60"
											class:bg-muted={t.id === session.threadId}
										>
											<button
												class="flex min-w-0 flex-1 items-baseline gap-2 py-1.5 pl-4 text-left"
												onclick={() => {
													session.openThread(t.id);
													historyOpen = false;
												}}
											>
												<span class="min-w-0 flex-1 truncate text-xs">{t.title}</span>
												<span class="hx-num shrink-0 text-[10px] text-muted-foreground">
													{t.messages} · {ago(t.updated)}
												</span>
											</button>
											<button
												class="shrink-0 px-3 py-1.5 text-muted-foreground/0 transition-colors
												       group-hover:text-muted-foreground/70 hover:!text-[var(--hx-error)]"
												onclick={() => session.deleteThread(t.id)}
												aria-label="Delete chat"
												{@attach tip('Delete this chat')}
											>
												<HugeiconsIcon icon={ICON.clear} size={12} strokeWidth={1.5} />
											</button>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
					<!-- topPad no longer depends on historyOpen: the panel floats above the
					     transcript instead of displacing it, so the resting text keeps the
					     same clearance from the header either way. -->
					<Conversation
						onopensettings={() => (settingsOpen = true)}
						onread={(p) => (readPath = p)}
						onpreview={async (p) => {
							// The instruments have to be on screen for a preview to be a
							// preview — a reader or the book parked over them would swallow
							// the click silently.
							readPath = null;
							bookPage = null;
							// Cleared first, because the panel watches this for a *change*:
							// clicking the same chip after browsing elsewhere has to move the
							// selection back, and re-assigning the same value would not.
							openPath = null;
							await tick();
							openPath = p;
						}}
						topPad="88px"
						bottomPad="{composerH + 8}px"
					/>
					<div class="absolute inset-x-0 bottom-0 z-30" bind:clientHeight={composerH}>
						<Composer onopenskills={() => (skillsOpen = true)} />
					</div>
				</div>
			</Resizable.Pane>

			<Resizable.Handle />

			<!-- The X-ray — or a document, or the book, when one is open. Reading
			     replaces the instruments rather than covering the whole app, so the
			     conversation stays live beside whatever you are reading. A document
			     outranks the book: it was opened from the run, and the run is the
			     class's subject. -->
			<Resizable.Pane defaultSize={58} minSize={30}>
				<!-- The instruments keep their own chrome at their own tops, so this
				     side simply starts below the header rather than under it. -->
				<div class="h-full min-h-0 pt-10">
					{#if readPath}
						<DocumentViewer
							path={readPath}
							onclose={() => (readPath = null)}
							onopen={(p) => (readPath = p)}
						/>
					{:else if bookPage}
						<BookViewer bind:page={bookPage} onclose={() => (bookPage = null)} />
					{:else}
						<Resizable.PaneGroup direction="horizontal" autoSaveId="hx:xray">
							<Resizable.Pane defaultSize={34} minSize={22}>
								<!-- The middle column is everything that changes rapidly, all
						     visible at once: the plan ticking over, the event record, and
						     the context the model will see next. Tabbing between any of
						     them hid exactly the correspondence a class is there to
						     watch. The ledger and the slower panels live in the
						     inspector's dashboard row. -->
								<!-- v3: the plan pane joined the stack; a saved layout under the
						     old id would keep the two-pane split forever. -->
								<Resizable.PaneGroup direction="vertical" autoSaveId="hx:middle-v3">
									<Resizable.Pane defaultSize={16} minSize={8} collapsible collapsedSize={6}>
										<!-- The plan owns its own header now: the revision stepper and the
										     agent it is showing are its state, and threading them up here
										     to draw a bar would put the controls further from the list
										     they control than from the pane next door. -->
										<PlanPanel onjump={select} />
									</Resizable.Pane>
									<Resizable.Handle />
									<Resizable.Pane defaultSize={50} minSize={22}>
										<div class="relative h-full min-h-0">
											<div
												class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-8 items-center
										       gap-3.5 border-y px-3"
											>
												{#each [{ id: 'events', label: 'events', icon: ICON.events }, { id: 'ledger', label: 'ledger', icon: ICON.tokens }] as v (v.id)}
													<button
														class="hx-eyebrow flex h-full items-center gap-1.5 transition-colors
													       hover:text-foreground"
														style:color={midView === v.id ? 'var(--hx-accent)' : undefined}
														onclick={() => (midView = v.id as 'events' | 'ledger')}
														{@attach tip(
															v.id === 'events'
																? 'Every event in the run, as it happened'
																: 'The same run in money — which kind of token took it'
														)}
													>
														<HugeiconsIcon icon={v.icon} size={12} strokeWidth={1.5} />
														{v.label}
													</button>
												{/each}
												<span class="ml-auto flex items-center gap-3 text-muted-foreground">
													{#if midView === 'events'}
														{#if frameCount}
															<button
																class="hx-eyebrow flex items-center gap-1 transition-colors
														       hover:text-foreground"
																style:color={showFrames ? 'var(--hx-accent)' : undefined}
																onclick={() => (showFrames = !showFrames)}
																aria-label="Raw SSE frames"
																{@attach tip('Raw SSE frames — every token exactly as it arrived')}
															>
																<HugeiconsIcon icon={ICON.frame} size={11} strokeWidth={1.5} />
																{frameCount}
															</button>
														{/if}

														<FilterMenu
															options={kindOptions}
															hidden={hiddenKinds}
															label="event kinds"
														/>
													{/if}
												</span>
											</div>
											<div class="h-full">
												{#if midView === 'ledger'}
													<!-- pt-8 rather than the timeline's topPad: the ledger is a fixed
													     readout, not a scroller sliding under the bar. -->
													<div class="h-full pt-8">
														<RunPanel />
													</div>
												{:else}
													<EventTimeline
														{selectedId}
														{revealId}
														{showFrames}
														hidden={hiddenKinds}
														topPad="32px"
														onselect={select}
														onopenasset={(p) => {
															openPath = p;
															if (p.endsWith('.pdf')) readPath = p;
														}}
													/>
												{/if}
											</div>
										</div>
									</Resizable.Pane>
									<Resizable.Handle />
									<Resizable.Pane defaultSize={34} minSize={14} collapsible collapsedSize={8}>
										<div class="relative h-full min-h-0">
											<header
												class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-8 items-center
										       gap-3.5 border-y px-3"
											>
												<span
													class="hx-eyebrow flex h-full items-center gap-1.5"
													style:color="var(--hx-accent)"
												>
													<HugeiconsIcon icon={ICON.context} size={12} strokeWidth={1.5} />
													context
												</span>

												<!-- No gauge here. The panel underneath IS the gauge, in far
											     more detail, and a donut on the bar of the pane that
											     already draws the breakdown was the same number said
											     twice. The one reading worth having away from the
											     breakdown is the live one, and that lives in the chat
											     header where the decision it informs gets made. -->
												{#if ctxStubs.length > 1}
													<!-- The pager, up here with the panel's other controls,
												     so paging costs no row inside the panel. -->
													<span class="flex items-center gap-0.5 text-muted-foreground">
														<button
															class="px-0.5 transition-colors hover:text-foreground
														       disabled:opacity-25"
															onclick={() => ctxStep(-1)}
															disabled={ctxIndex <= 0}
															aria-label="Previous model call"
															{@attach tip('The model call before this one')}
														>
															<span class="inline-block rotate-180">
																<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} />
															</span>
														</button>
														<span
															class="hx-num text-[10px]"
															{@attach tip(
																ctxPinned
																	? 'Pinned to one model call — page to the end to follow the run again'
																	: 'Following the run — the latest model call'
															)}
														>
															{ctxIndex < 0 ? ctxStubs.length : ctxIndex + 1}/{ctxStubs.length}
														</span>
														<button
															class="px-0.5 transition-colors hover:text-foreground
														       disabled:opacity-25"
															onclick={() => ctxStep(1)}
															disabled={ctxIndex === ctxStubs.length - 1 || ctxIndex < 0}
															aria-label="Next model call"
															{@attach tip('The model call after this one')}
														>
															<HugeiconsIcon icon={ICON.next} size={11} strokeWidth={1.5} />
														</button>
													</span>
												{/if}
												<span class="ml-auto flex items-center gap-3 text-muted-foreground">
													<span class="flex items-center gap-2">
														<button
															class="transition-colors hover:text-foreground"
															style:color={contextView === 'pieces'
																? 'var(--hx-accent)'
																: undefined}
															onclick={() => (contextView = 'pieces')}
															aria-pressed={contextView === 'pieces'}
															aria-label="Pieces view"
															{@attach tip(
																'Pieces — the request cut into system prompt, schemas and messages'
															)}
														>
															<HugeiconsIcon icon={ICON.pieces} size={13} strokeWidth={1.5} />
														</button>
														<button
															class="transition-colors hover:text-foreground"
															style:color={contextView === 'raw' ? 'var(--hx-accent)' : undefined}
															onclick={() => (contextView = 'raw')}
															aria-pressed={contextView === 'raw'}
															aria-label="Raw view"
															{@attach tip('Raw — the exact request body, whole')}
														>
															<HugeiconsIcon icon={ICON.code} size={13} strokeWidth={1.5} />
														</button>
														<button
															class="transition-colors hover:text-foreground disabled:opacity-30"
															onclick={() => session.compact()}
															disabled={session.busy ||
																session.compacting ||
																session.messages.length < 3}
															aria-label="Compact the conversation"
															{@attach tip('Fold the earlier conversation into a summary')}
														>
															<HugeiconsIcon icon={ICON.compact} size={13} strokeWidth={1.5} />
														</button>
													</span>

													<FilterMenu
														options={GROUP_OPTIONS}
														hidden={hiddenGroups}
														label="sections"
													/>
												</span>
											</header>
											<div class="h-full">
												<ContextPanel
													view={contextView}
													hidden={hiddenGroups}
													topPad="32px"
													bind:pinnedId={ctxPinned}
												/>
											</div>
										</div>
									</Resizable.Pane>
								</Resizable.PaneGroup>
							</Resizable.Pane>
							<Resizable.Handle />
							<Resizable.Pane defaultSize={62} minSize={30}>
								<Inspector
									bind:openPath
									bind:bottom={inspectorBottom}
									onread={(p) => (readPath = p)}
									onjump={select}
									onmanageskills={() => (skillsOpen = true)}
								/>
							</Resizable.Pane>
						</Resizable.PaneGroup>
					{/if}
				</div>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</div>
</div>

<SettingsSheet bind:open={settingsOpen} />
<SkillsSheet bind:open={skillsOpen} />
<AboutSheet bind:open={aboutOpen} />

<style>
	:global(html) {
		height: 100%;
	}
	@keyframes hx-pulse {
		50% {
			opacity: 0.3;
		}
	}
</style>
