/**
 * A very small key/value wrapper over IndexedDB.
 *
 * No dependency, because the requirement is genuinely this small: put, get,
 * delete, over one object store. IndexedDB is used rather than localStorage
 * because checkpoints are `Uint8Array` blobs — structured-cloneable natively,
 * but megabytes once base64'd into a string, and localStorage caps at ~5MB.
 */

const DB_NAME = 'harnessxray';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;
	dbPromise = new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
		// A version upgrade with a second tab open blocks forever and silently.
		// Fail loudly instead of hanging with no explanation.
		req.onblocked = () =>
			reject(new Error('IndexedDB upgrade blocked — another tab has this app open. Close it.'));
	});
	return dbPromise;
}

async function tx<T>(
	mode: IDBTransactionMode,
	fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const t = db.transaction(STORE, mode);
		const req = fn(t.objectStore(STORE));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export const idb = {
	get: <T>(key: string) => tx<T>('readonly', (s) => s.get(key) as IDBRequest<T>),
	set: (key: string, value: unknown) =>
		tx('readwrite', (s) => s.put(value, key) as IDBRequest<IDBValidKey>),
	del: (key: string) => tx('readwrite', (s) => s.delete(key) as unknown as IDBRequest<undefined>),

	/**
	 * Close the held connection.
	 *
	 * `deleteDatabase` is *blocked* for as long as any connection is open, and
	 * this module keeps one for the life of the page — so a factory reset that
	 * skips this can only schedule the erase, leaving it to race the next page
	 * load. Anything that runs after close() re-opens (and re-creates the
	 * database) transparently, which is why every exit-time writer also checks
	 * `resetInProgress` — see reset.ts.
	 */
	close: () => {
		void dbPromise?.then((db) => db.close()).catch(() => {});
		dbPromise = null;
	}
};

/**
 * Coalesce bursts of writes into one.
 *
 * A single agent turn produces dozens of checkpoints; persisting each one
 * synchronously would put an IndexedDB round-trip in the middle of the graph's
 * hot path. Trailing-edge only — the last state is the one that matters.
 */
export function debounce(fn: () => void, ms = 400) {
	let handle: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (handle) clearTimeout(handle);
		handle = setTimeout(() => {
			handle = null;
			fn();
		}, ms);
	};
}
