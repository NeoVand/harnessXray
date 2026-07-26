import { browser } from '$app/environment';

/**
 * Factory reset.
 *
 * State now lives in four places, which is exactly why a single button is
 * needed: localStorage (threads, key, theme), IndexedDB (checkpoints, memory
 * store, event logs, search cache, assets), the in-memory agent, and the Vite
 * dev caches. "Start a new chat" only ever cleared the first of those, so a
 * conversation could be gone while its memories, figures and checkpoints
 * quietly persisted.
 *
 * The API key is treated separately: wiping it is usually *not* what someone
 * means by "clear my data", and re-entering it is the most annoying step to
 * repeat.
 */

export interface ResetOptions {
	/** Also forget the OpenAI key. Off by default. */
	includeKey?: boolean;
}

export interface ResetReport {
	localStorageKeys: number;
	databases: string[];
}

const KEEP_KEYS = new Set(['hx:openai-key', 'hx:openai-key-persist']);

export async function factoryReset(opts: ResetOptions = {}): Promise<ResetReport> {
	if (!browser) return { localStorageKeys: 0, databases: [] };

	// ── localStorage ────────────────────────────────────────────────────────
	const doomed = Object.keys(localStorage).filter(
		(k) => opts.includeKey || !KEEP_KEYS.has(k)
	);
	for (const k of doomed) localStorage.removeItem(k);

	// Pane sizes are stored by paneforge under its own keys; clearing them is
	// part of "put the app back how it shipped".
	sessionStorage.clear();

	// ── IndexedDB ───────────────────────────────────────────────────────────
	const databases: string[] = [];
	try {
		// `databases()` is not in older Safari; fall back to the one name we own.
		const list = (await indexedDB.databases?.()) ?? [{ name: 'harnessxray' }];
		for (const db of list) {
			if (!db.name) continue;
			databases.push(db.name);
			await new Promise<void>((resolve) => {
				const req = indexedDB.deleteDatabase(db.name!);
				// Resolve on every outcome: a blocked delete still frees the data on
				// the next load, and hanging here would leave the UI stuck.
				req.onsuccess = req.onerror = req.onblocked = () => resolve();
			});
		}
	} catch {
		/* nothing to delete */
	}

	return { localStorageKeys: doomed.length, databases };
}

/** Roughly how much is currently stored, for the settings panel. */
export async function storageUsage(): Promise<{ bytes: number; label: string }> {
	if (!browser || !navigator.storage?.estimate) return { bytes: 0, label: 'unknown' };
	const { usage = 0 } = await navigator.storage.estimate();
	const label =
		usage > 1024 * 1024 * 1024
			? `${(usage / 1024 / 1024 / 1024).toFixed(2)} GB`
			: `${(usage / 1024 / 1024).toFixed(1)} MB`;
	return { bytes: usage, label };
}
