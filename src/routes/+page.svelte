<script lang="ts">
	import * as Resizable from '$lib/components/ui/resizable';
	import Conversation from '$lib/components/chat/Conversation.svelte';
	import Composer from '$lib/components/chat/Composer.svelte';
	import EventTimeline from '$lib/components/xray/EventTimeline.svelte';
	import Inspector from '$lib/components/xray/Inspector.svelte';
	import RunPanel from '$lib/components/xray/RunPanel.svelte';
	import SettingsSheet from '$lib/components/SettingsSheet.svelte';
	import { bus } from '$lib/xray/bus.svelte';
	import { session } from '$lib/agent/session.svelte';
	import { keys } from '$lib/state/keys.svelte';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { ICON } from '$lib/icons';

	let selectedId = $state<string | null>(null);
	let settingsOpen = $state(false);
	let historyOpen = $state(false);
	let dark = $state(false);

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
						<div class="hx-rule max-h-[45%] shrink-0 overflow-y-auto border-b">
							<p class="hx-eyebrow px-4 pt-3 pb-2">history</p>
							{#if session.threads.length === 0}
								<p class="px-4 pb-3 text-xs text-muted-foreground">No saved chats yet.</p>
							{:else}
								{#each session.threads as t (t.id)}
									<button
										class="flex w-full items-baseline gap-2 px-4 py-1.5 text-left transition-colors
										       hover:bg-muted/60"
										class:bg-muted={t.id === session.threadId}
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
								{/each}
							{/if}
						</div>
					{/if}
					<Conversation onopensettings={() => (settingsOpen = true)} />
					<Composer />
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
								<EventTimeline {selectedId} onselect={select} />
							</Resizable.Pane>
							<Resizable.Handle />
							<Resizable.Pane defaultSize={38} minSize={14} collapsible collapsedSize={8}>
								<RunPanel />
							</Resizable.Pane>
						</Resizable.PaneGroup>
					</Resizable.Pane>
					<Resizable.Handle />
					<Resizable.Pane defaultSize={62} minSize={30}>
						<Inspector {selectedId} />
					</Resizable.Pane>
				</Resizable.PaneGroup>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</div>

	<!-- Status rail -->
	<footer
		class="hx-rule flex h-7 shrink-0 items-center gap-4 border-t px-4 text-[10px] text-muted-foreground"
	>
		<span class="flex items-center gap-1.5">
			<HugeiconsIcon icon={ICON.wire} size={12} strokeWidth={1.5} />
			<span class="hx-num">{bus.version >= 0 ? bus.length : 0} events</span>
		</span>
		<span class="flex items-center gap-1.5">
			<HugeiconsIcon icon={ICON.message} size={12} strokeWidth={1.5} />
			<span class="hx-num">{session.messages.length} messages</span>
		</span>
		<span class="ml-auto hx-eyebrow">⌘, settings</span>
	</footer>
</div>

<SettingsSheet bind:open={settingsOpen} />

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
