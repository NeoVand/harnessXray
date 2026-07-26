import { browser } from '$app/environment';
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';

/**
 * An AsyncLocalStorage stand-in for the browser.
 *
 * LangGraph's `interrupt()` reads the current run config from
 * `AsyncLocalStorageProviderSingleton` — specifically
 * `getStore()?.extra?.[Symbol.for('lc:child_config')]`. In Node that is backed
 * by real `node:async_hooks`. The browser has none, so LangChain installs a mock
 * whose `getStore()` always returns `undefined`, and every interrupt throws
 * "Called interrupt() outside the context of a graph"
 * (langchain-ai/langgraphjs#879).
 *
 * ── Why this does not unwind ────────────────────────────────────────────────
 * Real ALS gives each async context its own store. We have exactly one slot, so
 * any unwinding strategy amounts to guessing which of several interleaved
 * callers currently owns it. Two were tried and measured against a live run:
 *
 *   restore in `finally`            → context gone after the first `await`;
 *                                     langchain's HITL middleware awaits before
 *                                     calling interrupt, so it always threw.
 *   restore when the promise settles → still wrong under interleaving; a
 *                                     sibling's completion tore down the active
 *                                     context. getStore() was empty on ~40% of
 *                                     calls and interrupt still threw.
 *
 * So: last-writer-wins, and never unwind. The store persists until the next
 * `run()` replaces it. Context is then always *present*; the residual risk is
 * that it is *stale* rather than missing. That trade is right here because the
 * app runs one graph at a time, and a stale config fails loudly inside
 * `interrupt()` — missing scratchpad or checkpointer — rather than silently
 * doing the wrong thing.
 *
 * Verified end to end: a gated tool pauses the graph, the approval card renders
 * the proposed call, and `Command({ resume })` completes the run.
 */
class SyncAsyncLocalStorage<T> {
	#store: T | undefined = undefined;

	getStore(): T | undefined {
		return this.#store;
	}

	run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
		this.#store = store;
		return callback(...args);
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
	AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new SyncAsyncLocalStorage() as never);
}
