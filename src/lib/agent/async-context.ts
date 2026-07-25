import { browser } from '$app/environment';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';

/**
 * A synchronous AsyncLocalStorage shim for the browser.
 *
 * LangGraph's `interrupt()` (and context vars) read the current run config from
 * `AsyncLocalStorageProviderSingleton`. In Node that's backed by real
 * `node:async_hooks`; the browser has none, so LangChain falls back to a mock
 * whose `getStore()` always returns `undefined` — which is why `interrupt()`
 * throws "Called interrupt() outside the context of a graph" in the browser
 * (see langchain-ai/langgraphjs#879).
 *
 * We can't fully replicate async_hooks: native `await` bypasses userland Promise
 * hooks in V8, so context cannot survive an `await`. But it CAN survive the
 * synchronous portion of a node — which is all `interrupt()` needs, because it is
 * called synchronously at the top of a node (before any await). That's the
 * pattern every interrupt site in this app uses, so a stack-restoring `run()` is
 * enough to make HITL work in the browser.
 */
class SyncAsyncLocalStorage<T> {
	#store: T | undefined = undefined;

	getStore(): T | undefined {
		return this.#store;
	}

	run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
		const previous = this.#store;
		this.#store = store;
		try {
			return callback(...args);
		} finally {
			this.#store = previous;
		}
	}

	enterWith(store: T): void {
		this.#store = store;
	}
}

let installed = false;

/**
 * Installs the browser shim as the global async-context store. No-op on the
 * server (Node already has a real one) and idempotent. `initializeGlobalInstance`
 * only sets the instance if none exists yet, so this never clobbers Node's.
 */
export function installBrowserAsyncContext(): void {
	if (!browser || installed) return;
	installed = true;
	AsyncLocalStorageProviderSingleton.initializeGlobalInstance(
		new SyncAsyncLocalStorage() as never
	);
}
