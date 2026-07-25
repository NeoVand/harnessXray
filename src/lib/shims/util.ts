/**
 * Minimal `util` shim for the browser bundle.
 *
 * Why this exists: `deepagents/browser` transitively pulls in `micromatch` →
 * `fill-range`, both of which do a top-level CJS `require('util')`. That is a
 * hard load-time failure in a browser bundle, not a lazy one. They use exactly
 * one thing from it — `util.inspect`, and only to build error messages — so a
 * 20-line shim is honest and costs nothing, where a browserify polyfill would
 * cost ~40KB to serve the same single function.
 *
 * If a future dependency reaches for something else here, the bundle will fail
 * loudly at build time rather than silently at runtime. That is the intent.
 */

export function inspect(value: unknown): string {
	if (typeof value === 'string') return JSON.stringify(value);
	if (typeof value === 'bigint') return `${value}n`;
	if (value instanceof RegExp || value instanceof Error) return String(value);
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

export default { inspect };
