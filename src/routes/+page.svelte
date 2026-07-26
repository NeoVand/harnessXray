<script lang="ts">
	import * as Resizable from '$lib/components/ui/resizable';
	import Conversation from '$lib/components/chat/Conversation.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import EventTimeline from '$lib/components/xray/EventTimeline.svelte';
	import Inspector from '$lib/components/xray/Inspector.svelte';
	import RunPanel from '$lib/components/xray/RunPanel.svelte';
	import SettingsSheet from '$lib/components/SettingsSheet.svelte';
	import DocumentViewer from '$lib/components/DocumentViewer.svelte';
	import HelpSheet from '$lib/components/HelpSheet.svelte';
	import SkillsSheet from '$lib/components/SkillsSheet.svelte';
	import ContextPanel from '$lib/components/xray/ContextPanel.svelte';
	import ContextDonut from '$lib/components/xray/ContextDonut.svelte';
	import FilterMenu from '$lib/components/xray/FilterMenu.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { KIND_COLOR } from '$lib/xray/format';
	import type { DisplayKind } from '$lib/xray/events';
	import { shotStubs } from '$lib/xray/context';
	import { INPUT_LIMIT, COMPACT_AT } from '$lib/agent/models';
	import { compact } from '$lib/xray/usage';
	import { session } from '$lib/agent/session.svelte';
	import { skills } from '$lib/agent/skills.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	let selectedId = $state<string | null>(null);
	let settingsOpen = $state(false);
	let historyOpen = $state(false);
	let openPath = $state<string | null>(null);
	let readPath = $state<string | null>(null);
	let helpOpen = $state(false);
	let skillsOpen = $state(false);
	let dark = $state(false);

	/** The left column of the X-ray: what happened, or what is in the window. */
	let lens = $state<'timeline' | 'context'>('timeline');
	let showFrames = $state(false);

	/** Height of the floating tab bar; panels leave this much room at the top. */
	const TAB_H = '36px';

	const frameCount = $derived.by(() => {
		void bus.version;
		return bus.events.reduce((n, e) => n + (e.kind === 'http_sse_frame' ? 1 : 0), 0);
	});

	// Filters hold what is *hidden*, so "nothing hidden" is the empty set and a
	// kind that only appears later is visible without anyone updating a list.
	let hiddenKinds = $state(new Set<string>());
	let hiddenGroups = $state(new Set<string>());

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
		const seen = new Map<string, number>();
		for (const e of bus.events) {
			if (e.kind === 'http_sse_frame' && !showFrames) continue;
			seen.set(e.displayKind, (seen.get(e.displayKind) ?? 0) + 1);
		}
		return (Object.keys(KIND_LABELS) as DisplayKind[])
			.filter((k) => seen.has(k))
			.map((k) => ({
				key: k,
				label: KIND_LABELS[k],
				color: KIND_COLOR[k],
				count: seen.get(k)
			}));
	});

	const GROUP_OPTIONS = [
		{ key: 'system', label: 'system prompt', color: 'var(--hx-model)' },
		{ key: 'tools', label: 'tool schemas', color: 'var(--hx-tool)' },
		{ key: 'messages', label: 'messages', color: 'var(--hx-user)' }
	];

	/** Bumped to send the conversation to its latest message. */
	let jumpChat = $state(0);

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

	function toggleTheme() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
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

<div class="flex h-dvh flex-col overflow-hidden">
	<!-- Header: one hairline, no card. -->
	<header class="hx-rule flex h-10 shrink-0 items-center gap-2 border-b px-3">
		<HugeiconsIcon icon={ICON.agent} size={15} strokeWidth={1.5} />
		<span class="text-[12px] font-semibold tracking-tight">harnessXray</span>

		<span class="ml-1 flex items-center gap-1.5">
			<span
				class="inline-block h-1.5 w-1.5 rounded-full"
				style:background={statusColor}
				style:animation={session.busy ? 'hx-pulse 1.2s ease-in-out infinite' : undefined}
			></span>
			<span class="hx-eyebrow">{session.status}</span>
		</span>

		<div class="ml-auto flex items-center gap-3">
			<button
				class="hx-num text-[11px] text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (settingsOpen = true)}
				title="Settings (⌘,)"
			>
				{keys.present ? `···${keys.tail}` : '—'}
			</button>

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
				class:text-foreground={historyOpen}
				onclick={() => (historyOpen = !historyOpen)}
				title="History"
				aria-label="History"
			>
				<HugeiconsIcon icon={ICON.history} size={15} strokeWidth={1.5} />
			</button>

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				class:text-foreground={helpOpen}
				onclick={() => (helpOpen = true)}
				title="What is a harness?"
				aria-label="Help"
			>
				<HugeiconsIcon icon={ICON.help} size={15} strokeWidth={1.5} />
			</button>

			<button
				class="text-muted-foreground transition-colors hover:text-foreground"
				onclick={toggleTheme}
				title={dark ? 'Switch to light' : 'Switch to dark'}
				aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
			>
				<HugeiconsIcon icon={dark ? ICON.light : ICON.dark} size={15} strokeWidth={1.5} />
			</button>

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

	<div class="min-h-0 flex-1">
		<Resizable.PaneGroup direction="horizontal" autoSaveId="hx:root">
			<!-- The app -->
			<Resizable.Pane defaultSize={42} minSize={26}>
				<div class="flex h-full min-h-0 flex-col">
					{#if historyOpen}
						<div class="hx-rule flex max-h-[45%] shrink-0 flex-col border-b">
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
						jump={jumpChat}
					/>
					<Composer onopenskills={() => (skillsOpen = true)} />
				</div>
			</Resizable.Pane>

			<Resizable.Handle />

			<!-- The X-ray -->
			<Resizable.Pane defaultSize={58} minSize={30}>
				<Resizable.PaneGroup direction="horizontal" autoSaveId="hx:xray">
					<Resizable.Pane defaultSize={34} minSize={22}>
						<!-- The timeline does not need the whole column: past a certain
						     height it is just more rows you are not looking at. The run
						     accounting lives underneath it, where it is visible while you
						     scrub rather than hidden behind a tab. -->
						<Resizable.PaneGroup direction="vertical" autoSaveId="hx:timeline">
							<Resizable.Pane defaultSize={62} minSize={25}>
								<!-- Two readings of the same run. The timeline is the record of
								     what happened; the context is what the model could see when
								     it happened. Neither is derivable from the other. -->
								<div class="relative h-full min-h-0">
									<div
										class="hx-rule hx-frost absolute inset-x-0 top-0 z-20 flex h-9 items-center
										       gap-3.5 border-b px-3"
									>
										{#each [{ id: 'timeline', label: 'timeline', icon: ICON.time }, { id: 'context', label: 'context', icon: ICON.context }] as const as t (t.id)}
											<button
												class="hx-eyebrow relative flex h-full items-center gap-1.5 transition-colors
												       hover:text-foreground"
												class:text-foreground={lens === t.id}
												onclick={() => (lens = t.id)}
											>
												<HugeiconsIcon icon={t.icon} size={12} strokeWidth={1.5} />
												{t.label}
												{#if lens === t.id}
													<span class="absolute inset-x-0 bottom-0 h-px bg-foreground"></span>
												{/if}
											</button>
										{/each}
										<span class="ml-auto flex items-center gap-3 text-muted-foreground">
											{#if lens === 'timeline' && frameCount}
												<button
													class="hx-eyebrow flex items-center gap-1 transition-colors
													       hover:text-foreground"
													class:text-foreground={showFrames}
													onclick={() => (showFrames = !showFrames)}
													title="Raw SSE frames — every token exactly as it arrived"
												>
													<HugeiconsIcon icon={ICON.frame} size={11} strokeWidth={1.5} />
													{frameCount}
												</button>
											{/if}

											{#if lens === 'timeline'}
												<FilterMenu options={kindOptions} bind:hidden={hiddenKinds} label="event kinds" />
											{:else}
												<FilterMenu options={GROUP_OPTIONS} bind:hidden={hiddenGroups} label="sections" />
											{/if}

											{#if lastShot}
												<button
													class="flex items-center gap-1.5 transition-colors hover:text-foreground"
													onclick={() => (lens = 'context')}
													title="context used"
												>
													<ContextDonut used={contextUsed} warn={COMPACT_AT} />
													<span class="hx-num text-[10px]">{compact(lastShot.tokens)}</span>
												</button>
											{/if}
										</span>
									</div>
									<div class="h-full">
										{#if lens === 'timeline'}
											<EventTimeline
												{selectedId}
												{showFrames}
												hidden={hiddenKinds}
												topPad={TAB_H}
												onselect={select}
												onopenasset={(p) => {
													openPath = p;
													if (p.endsWith('.pdf')) readPath = p;
												}}
											/>
										{:else}
											<ContextPanel hidden={hiddenGroups} topPad={TAB_H} />
										{/if}
									</div>
								</div>
							</Resizable.Pane>
							<Resizable.Handle />
							<Resizable.Pane defaultSize={38} minSize={14} collapsible collapsedSize={8}>
								<RunPanel />
							</Resizable.Pane>
						</Resizable.PaneGroup>
					</Resizable.Pane>
					<Resizable.Handle />
					<Resizable.Pane defaultSize={62} minSize={30}>
						<Inspector
							{selectedId}
							bind:openPath
							onread={(p) => (readPath = p)}
							onmanageskills={() => (skillsOpen = true)}
						/>
					</Resizable.Pane>
				</Resizable.PaneGroup>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</div>

	<!-- Status rail -->
	<footer
		class="hx-rule flex h-7 shrink-0 items-center gap-4 border-t px-4 text-[10px] text-muted-foreground"
	>
		<!-- Every reading here is a way in to the panel that explains it. -->
		<button
			class="flex items-center gap-1.5 transition-colors hover:text-foreground"
			onclick={() => (lens = 'timeline')}
			title="Show the timeline"
		>
			<HugeiconsIcon icon={ICON.wire} size={12} strokeWidth={1.5} />
			<span class="hx-num">{bus.version >= 0 ? bus.length : 0} events</span>
		</button>

		<button
			class="flex items-center gap-1.5 transition-colors hover:text-foreground"
			onclick={() => jumpChat++}
			title="Jump to the latest message"
		>
			<HugeiconsIcon icon={ICON.message} size={12} strokeWidth={1.5} />
			<span class="hx-num">{session.messages.length} messages</span>
		</button>

		<!-- The context gauge lives here rather than a keyboard hint, because it
		     is the one number that changes constantly and costs money. -->
		<button
			class="flex items-center gap-1.5 transition-colors hover:text-foreground"
			onclick={() => (lens = 'context')}
			title="{lastShot
				? `${lastShot.tokens.toLocaleString()} of ${INPUT_LIMIT.toLocaleString()} input tokens`
				: 'nothing sent yet'} — the harness compacts past {Math.round(COMPACT_AT * 100)}%"
		>
			<ContextDonut used={contextUsed} warn={COMPACT_AT} />
			<span class="hx-num">
				{#if lastShot}
					{(contextUsed * 100).toFixed(contextUsed < 0.1 ? 1 : 0)}% context
				{:else}
					context idle
				{/if}
			</span>
		</button>

		{#if session.compacting}
			<span class="hx-eyebrow" style:color="var(--hx-memory)">compacting…</span>
		{/if}

		<button
			class="ml-auto flex items-center gap-1.5 transition-colors hover:text-foreground"
			onclick={() => (skillsOpen = true)}
			title="Manage skills"
		>
			<HugeiconsIcon icon={ICON.skill} size={12} strokeWidth={1.5} />
			<span class="hx-num">{skills.active.length} skills</span>
		</button>
	</footer>
</div>

<SettingsSheet bind:open={settingsOpen} />
<HelpSheet bind:open={helpOpen} />
<SkillsSheet bind:open={skillsOpen} />
<DocumentViewer
	path={readPath}
	onclose={() => (readPath = null)}
	onopen={(p) => (readPath = p)}
/>

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
