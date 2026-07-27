<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import * as Resizable from '$lib/components/ui/resizable';
	import Conversation from '$lib/components/chat/Conversation.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import EventTimeline from '$lib/components/xray/EventTimeline.svelte';
	import TodoPanel from '$lib/components/xray/TodoPanel.svelte';
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
	let inspectorBottom = $state<'graph' | 'skills' | 'memory' | 'ledger'>('graph');

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

	// The last model call is the live context — what the next request will be
	// built on top of. Read from the wire like everything else here.
	const lastShot = $derived.by(() => {
		void bus.version;
		return shotStubs(bus).at(-1);
	});
	const contextUsed = $derived(lastShot ? Math.min(1, lastShot.tokens / INPUT_LIMIT) : 0);

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

	function select(id: string) {
		following = false;
		selectedId = id;
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
			title="About harnessXray"
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
					title="Leave replay mode and start a fresh live chat"
				>
					exit
				</button>
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-3">
			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={session.newThread.bind(session)}
				title="New chat (⌘N)"
				aria-label="New chat"
			>
				<HugeiconsIcon icon={ICON.newChat} size={15} strokeWidth={1.5} />
			</button>

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				style:color={historyOpen ? 'var(--hx-accent)' : undefined}
				onclick={() => (historyOpen = !historyOpen)}
				title="History"
				aria-label="History"
			>
				<HugeiconsIcon icon={ICON.history} size={15} strokeWidth={1.5} />
			</button>

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				style:color={bookPage ? 'var(--hx-accent)' : undefined}
				onclick={() => (bookPage = bookPage ? null : 'the-harness')}
				title="The book — how this harness works"
				aria-label="The book"
			>
				<HugeiconsIcon icon={ICON.help} size={15} strokeWidth={1.5} />
			</button>

			<!-- One click, one theme. The glyph is the readout — it says where you
			     are, and the tooltip names where the next click lands, so the cycle
			     is never a guess. -->
			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => theme.cycle()}
				title="{theme.spec.label} · next: {theme.next.label}"
				aria-label="Theme: {theme.spec.label}. Switch to {theme.next.label}"
			>
				<ThemeIcon id={theme.current} />
			</button>

			<a
				href={REPO_URL}
				target="_blank"
				rel="noreferrer noopener"
				class="text-muted-foreground transition-colors hover:text-foreground"
				title="Source on GitHub"
				aria-label="Source on GitHub"
			>
				<HugeiconsIcon icon={ICON.github} size={15} strokeWidth={1.5} />
			</a>

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (settingsOpen = true)}
				title="Settings (⌘,)"
				aria-label="Settings"
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
					{#if historyOpen}
						<div class="hx-rule mt-10 flex max-h-[45%] shrink-0 flex-col border-b">
							<!-- Title and dismiss share a row: closing a panel should not mean
							     hunting for the control that opened it. -->
							<div class="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
								<span class="hx-eyebrow">history</span>
								<button
									class="text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (historyOpen = false)}
									aria-label="Close history"
									title="Close"
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
												title="Delete this chat"
											>
												<HugeiconsIcon icon={ICON.clear} size={12} strokeWidth={1.5} />
											</button>
										</div>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
					<Conversation
						onopensettings={() => (settingsOpen = true)}
						onread={(p) => (readPath = p)}
						topPad={historyOpen ? '12px' : '52px'}
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
										<div class="relative h-full min-h-0">
											<div
												class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-9 items-center
										       gap-3.5 border-b px-3"
											>
												<span
													class="hx-eyebrow flex h-full items-center gap-1.5"
													style:color="var(--hx-accent)"
												>
													<HugeiconsIcon icon={ICON.todo} size={12} strokeWidth={1.5} />
													plan
													{#if session.todos.length}
														<span class="hx-num text-[9px] opacity-60">{session.todos.length}</span>
													{/if}
												</span>
											</div>
											<div class="h-full overflow-y-auto pt-9">
												<TodoPanel />
											</div>
										</div>
									</Resizable.Pane>
									<Resizable.Handle />
									<Resizable.Pane defaultSize={50} minSize={22}>
										<div class="relative h-full min-h-0">
											<div
												class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-8 items-center
										       gap-3.5 border-y px-3"
											>
												<span
													class="hx-eyebrow flex h-full items-center gap-1.5"
													style:color="var(--hx-accent)"
												>
													<HugeiconsIcon icon={ICON.time} size={12} strokeWidth={1.5} />
													events
												</span>
												<span class="ml-auto flex items-center gap-3 text-muted-foreground">
													{#if frameCount}
														<button
															class="hx-eyebrow flex items-center gap-1 transition-colors
													       hover:text-foreground"
															style:color={showFrames ? 'var(--hx-accent)' : undefined}
															onclick={() => (showFrames = !showFrames)}
															title="Raw SSE frames — every token exactly as it arrived"
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

													{#if lastShot}
														<!-- A readout, not a control — the panel it used to open
												     is permanently below. -->
														<span
															class="flex items-center gap-1.5"
															title="context used — decomposed in the panel below"
														>
															<ContextDonut used={contextUsed} warn={COMPACT_AT} />
															<span class="hx-num text-[10px]">{compact(lastShot.tokens)}</span>
														</span>
													{/if}
												</span>
											</div>
											<div class="h-full">
												<EventTimeline
													{selectedId}
													{showFrames}
													hidden={hiddenKinds}
													topPad="32px"
													onselect={select}
													onopenasset={(p) => {
														openPath = p;
														if (p.endsWith('.pdf')) readPath = p;
													}}
												/>
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
												<span class="ml-auto flex items-center gap-3 text-muted-foreground">
													<span class="flex items-center gap-2">
														<button
															class="transition-colors hover:text-foreground"
															style:color={contextView === 'pieces'
																? 'var(--hx-accent)'
																: undefined}
															onclick={() => (contextView = 'pieces')}
															aria-pressed={contextView === 'pieces'}
															title="Pieces — the request cut into system prompt, schemas and messages"
															aria-label="Pieces view"
														>
															<HugeiconsIcon icon={ICON.state} size={13} strokeWidth={1.5} />
														</button>
														<button
															class="transition-colors hover:text-foreground"
															style:color={contextView === 'raw' ? 'var(--hx-accent)' : undefined}
															onclick={() => (contextView = 'raw')}
															aria-pressed={contextView === 'raw'}
															title="Raw — the exact request body, whole"
															aria-label="Raw view"
														>
															<HugeiconsIcon icon={ICON.code} size={13} strokeWidth={1.5} />
														</button>
														<button
															class="transition-colors hover:text-foreground disabled:opacity-30"
															onclick={() => session.compact()}
															disabled={session.busy ||
																session.compacting ||
																session.messages.length < 3}
															title="Fold the earlier conversation into a summary"
															aria-label="Compact the conversation"
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
												<ContextPanel view={contextView} hidden={hiddenGroups} topPad="32px" />
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
