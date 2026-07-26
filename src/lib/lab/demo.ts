import { replay, parseFixture, downloadFixture, type Fixture } from '$lib/xray/replay.svelte';
import { session } from '$lib/agent/session.svelte';
import { bus } from '$lib/xray/bus.svelte';

/**
 * The few moves that involve both the replay engine and the session, kept in
 * one place so neither has to import the other. Entering replay always starts
 * a fresh thread: the fixture's script plays from an empty conversation, the
 * way it was recorded.
 */

export function exportCurrentRun(): void {
	const script = session.messages.filter((m) => m.role === 'user').map((m) => m.text);
	const name = session.threads.find((t) => t.id === session.threadId)?.title ?? 'recorded run';
	downloadFixture(replay.build(bus, name, session.model, script));
}

export function enterReplay(fixture: Fixture): void {
	replay.start(fixture);
	session.newThread();
}

export function exitReplay(): void {
	replay.stop();
	session.newThread();
}

/** Load the fixture shipped with the app. Returns '' or a readable error. */
export async function loadBundledDemo(): Promise<string> {
	try {
		const res = await fetch('/fixtures/demo.json');
		if (!res.ok) return 'No demo fixture is bundled with this build — record one from Settings.';
		enterReplay(parseFixture(await res.text()));
		return '';
	} catch (e) {
		return e instanceof Error ? e.message : String(e);
	}
}
