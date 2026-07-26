import { browser } from '$app/environment';

/**
 * Bring-your-own-key storage.
 *
 * The app has no server, so the key genuinely never leaves the browser — that is
 * a structural property of the architecture, not a promise we're making. It does
 * mean the key sits in this tab's memory, so the default is `sessionStorage`
 * (dies with the tab) and `localStorage` is opt-in behind an explicit choice.
 *
 * The key is never written into the event log: `wire.ts` redacts the
 * `authorization` header before the request event exists.
 */

const KEY = 'hx:openai-key';
const PERSIST = 'hx:openai-key-persist';

export type KeyStatus = 'missing' | 'unverified' | 'valid' | 'rejected' | 'checking';

/**
 * A key from `.env`, for local development only.
 *
 * `import.meta.env.DEV` is replaced by Vite with the literal `false` in a
 * production build, so this whole branch becomes `if (false)` and the bundler
 * eliminates it — the key never reaches shipped output. That only holds while
 * this stays a **static** member access: assigning `import.meta.env` to a
 * variable first, or reading it through a helper, defeats the constant folding
 * and would bake the secret into the bundle.
 *
 * Verified by grepping the built assets for the key after `npm run build`.
 */
function devKey(): string {
	if (!import.meta.env.DEV) return '';
	return import.meta.env.VITE_OPENAI_API_KEY ?? '';
}

class KeyStore {
	value = $state('');
	persist = $state(false);
	status = $state<KeyStatus>('missing');
	message = $state('');
	/** True when the active key came from .env rather than the settings sheet. */
	fromEnv = $state(false);

	constructor() {
		if (!browser) return;
		this.persist = localStorage.getItem(PERSIST) === '1';
		const stored = (this.persist ? localStorage : sessionStorage).getItem(KEY) ?? '';
		if (stored) {
			this.value = stored;
			this.status = 'unverified';
			return;
		}
		// A user-entered key always wins; .env is only a convenience for dev.
		const fallback = devKey();
		if (fallback) {
			this.value = fallback;
			this.status = 'unverified';
			this.fromEnv = true;
		}
	}

	get present() {
		return this.value.trim().length > 0;
	}

	/** Last four characters, for showing which key is loaded without showing it. */
	get tail() {
		return this.value.trim().slice(-4);
	}

	set(value: string) {
		this.value = value.trim();
		this.status = this.value ? 'unverified' : 'missing';
		this.fromEnv = false;
		this.message = '';
		this.#write();
	}

	setPersist(on: boolean) {
		this.persist = on;
		if (!browser) return;
		localStorage.setItem(PERSIST, on ? '1' : '0');
		sessionStorage.removeItem(KEY);
		localStorage.removeItem(KEY);
		this.#write();
	}

	clear() {
		this.value = '';
		this.status = 'missing';
		this.fromEnv = false;
		this.message = '';
		if (!browser) return;
		sessionStorage.removeItem(KEY);
		localStorage.removeItem(KEY);
	}

	#write() {
		if (!browser || !this.value) return;
		(this.persist ? localStorage : sessionStorage).setItem(KEY, this.value);
	}

	/**
	 * Validate against `GET /v1/models`.
	 *
	 * This endpoint specifically is exempt from OpenAI's edge auth interceptor,
	 * so a bad key comes back as a *readable* 401 with CORS headers. Every other
	 * endpoint returns an opaque 401 with no CORS header, which the browser
	 * surfaces as a bare `TypeError` indistinguishable from being offline. That
	 * asymmetry is the only reason key validation is possible at all client-side.
	 */
	async verify(): Promise<boolean> {
		if (!this.present) {
			this.status = 'missing';
			return false;
		}
		this.status = 'checking';
		this.message = '';
		try {
			const res = await fetch('https://api.openai.com/v1/models', {
				headers: { authorization: `Bearer ${this.value}` }
			});
			if (res.ok) {
				this.status = 'valid';
				this.message = 'Key accepted.';
				return true;
			}
			this.status = 'rejected';
			this.message = res.status === 401 ? 'Key was rejected by OpenAI.' : `HTTP ${res.status}.`;
			return false;
		} catch {
			this.status = 'rejected';
			this.message =
				'Could not reach api.openai.com — offline, or a network policy is blocking it.';
			return false;
		}
	}

	/** Throws with a useful message rather than letting an opaque 401 happen. */
	require(): string {
		if (!this.present) throw new Error('No OpenAI API key set. Open settings (⌘,) to add one.');
		return this.value;
	}
}

export const keys = new KeyStore();
