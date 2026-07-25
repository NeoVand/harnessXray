/**
 * Stub for Node builtins that are reachable in the dependency graph but never
 * actually executed in this app.
 *
 * `langsmith/experimental/sandbox` lazily `await import()`s `node:fs/promises`
 * and `node:path` inside its sandbox client. We never construct a
 * LangSmithSandbox — the Mill (a Web Worker) is our sandbox — but the bundler
 * still has to resolve the specifier. Aliasing it here keeps the build honest:
 * nothing is silently polyfilled, and if that code path is ever reached it
 * fails immediately with a message that says exactly why.
 */

const message =
	'A Node-only module was called in the browser build. harnessXray runs entirely ' +
	'client-side and has no filesystem. If you meant to run code, use the Mill ' +
	'(src/lib/runtime/compute) — a Web Worker isolate — instead.';

function unavailable(): never {
	throw new Error(message);
}

export const readFile = unavailable;
export const writeFile = unavailable;
export const mkdir = unavailable;
export const rm = unavailable;
export const stat = unavailable;

export default new Proxy(
	{},
	{
		get: unavailable,
		apply: unavailable
	}
);
