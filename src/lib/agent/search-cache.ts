import { idb } from '$lib/storage/idb';

/**
 * A disk cache for searches.
 *
 * OpenAlex bills a *daily credit quota*, not a per-second rate: 1000 credits at
 * 10 per request is ~100 searches per day, per IP — measured from the response
 * headers, not guessed. A teaching session repeats the same handful of queries
 * constantly, and a classroom shares one IP, so caching is not an optimisation
 * here, it is what makes the app usable at all.
 *
 * Search results for published literature are stable over days, so a week-long
 * TTL costs nothing in freshness.
 */

const KEY = 'search-cache:v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

interface Entry {
	at: number;
	value: unknown;
}

let cache: Record<string, Entry> | null = null;

async function load(): Promise<Record<string, Entry>> {
	if (cache) return cache;
	cache = (await idb.get<Record<string, Entry>>(KEY)) ?? {};
	return cache;
}

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
	const store = await load();
	const hit = store[key];
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

	const value = await fetcher();
	store[key] = { at: Date.now(), value };

	// Evict oldest rather than growing without bound.
	const keys = Object.keys(store);
	if (keys.length > MAX_ENTRIES) {
		keys
			.sort((a, b) => store[a].at - store[b].at)
			.slice(0, keys.length - MAX_ENTRIES)
			.forEach((k) => delete store[k]);
	}

	void idb.set(KEY, store);
	return value;
}

export async function clearSearchCache() {
	cache = {};
	await idb.del(KEY);
}

export async function cacheSize(): Promise<number> {
	return Object.keys(await load()).length;
}
