import { idb } from './idb';

/**
 * Binary assets — generated images and PDF page thumbnails.
 *
 * Kept deliberately *outside* the agent's virtual filesystem. The VFS is a
 * LangGraph state channel, which means every value in it is serialized into
 * every checkpoint; a single 1024×1024 PNG is ~950KB of base64, so a handful of
 * figures would make each checkpoint many megabytes and each resume slow.
 *
 * Instead the agent writes a *path* into the filesystem and the bytes live
 * here, addressed by that path. The markdown references `/figures/x.png`, the
 * viewer resolves it, and the graph stays small. This is the same split every
 * real system ends up with: metadata in the database, blobs in object storage.
 */

const KEY = 'assets:v1';

export interface Asset {
	path: string;
	/** A data: URL, ready to use as an <img> src. */
	dataUrl: string;
	kind: 'image' | 'thumb' | 'pdf';
	bytes: number;
	createdAt: number;
	meta?: Record<string, unknown>;
}

let cache: Record<string, Asset> | null = null;

/**
 * Bumped whenever the asset set changes. Renderers read this to re-resolve
 * figure paths once bytes arrive — the store is a plain object by design (a
 * data URL is ~1MB of string; proxying it would be pure cost).
 */
export const assetVersion = $state({ n: 0 });

async function load(): Promise<Record<string, Asset>> {
	if (cache) return cache;
	cache = (await idb.get<Record<string, Asset>>(KEY)) ?? {};
	return cache;
}

export const assets = {
	async put(asset: Asset) {
		const store = await load();
		store[asset.path] = asset;
		assetVersion.n++;
		void idb.set(KEY, store);
	},

	async get(path: string): Promise<Asset | undefined> {
		return (await load())[path];
	},

	/** Synchronous read for render paths; only valid after `warm()`. */
	peek(path: string): Asset | undefined {
		return cache?.[path];
	},

	async list(prefix = ''): Promise<Asset[]> {
		const store = await load();
		return Object.values(store)
			.filter((a) => a.path.startsWith(prefix))
			.sort((a, b) => a.createdAt - b.createdAt);
	},

	async warm() {
		await load();
		assetVersion.n++;
	},

	async clear() {
		cache = {};
		await idb.del(KEY);
	}
};

/**
 * ArrayBuffer → base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` blows the call stack somewhere around a
 * hundred thousand arguments, and arXiv PDFs are megabytes — so the obvious
 * one-liner works on every test file and fails on real input.
 */
export function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const CHUNK = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/**
 * Shrink an image to a preview.
 *
 * Timeline events are held for the life of the run and rendered repeatedly, so
 * they carry a thumbnail rather than the full frame — a ~950KB partial becomes
 * a few KB. The full-size image stays in the asset store.
 */
export async function thumbnail(dataUrl: string, max = 320): Promise<string> {
	const img = new Image();
	img.src = dataUrl;
	await img.decode();

	const scale = Math.min(1, max / Math.max(img.width, img.height));
	const w = Math.round(img.width * scale);
	const h = Math.round(img.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	canvas.getContext('2d')?.drawImage(img, 0, 0, w, h);
	return canvas.toDataURL('image/jpeg', 0.7);
}
