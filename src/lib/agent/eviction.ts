/**
 * Large-result eviction — the harness intervention nobody sees.
 *
 * `createFilesystemMiddleware` carries a `toolTokenLimitBeforeEvict`, default
 * 20,000 tokens (~80KB of text), and `createDeepAgent` never overrides it. When
 * a tool result crosses that line the middleware writes the whole thing to
 * `/large_tool_results/<toolCallId>.txt` and replaces the message the model sees
 * with a pointer plus a short sample. The model never receives the result it
 * asked for.
 *
 * Everything about that is reasonable and nothing about it was visible. The
 * write already streams as an ordinary `fs_write`, so a file simply *appeared*
 * in the files panel that the agent never asked to create — indistinguishable
 * from its own work product. This module is the interpretation layer that names
 * it: no new instrumentation, just a path prefix the timeline and the file tree
 * can recognise.
 *
 * Filesystem tools are exempt upstream (`ls`, `read_file`, `write_file`,
 * `edit_file`, `glob`, `grep`), so only this app's own tools and `task` can
 * trigger it. Our `fetch_paper` caps at 60,000 chars, comfortably under ~80KB,
 * which is why it has probably never fired in a real run here — and why the
 * threshold is now a setting. Turn it down to 2,000 and the next paper evicts,
 * which turns a mechanism you have to take on faith into one you can watch.
 */

/** Where the middleware parks an oversized tool result. Upstream's path. */
export const EVICT_ROOT = '/large_tool_results/';

/**
 * The default the framework applies when nobody says otherwise, in tokens.
 * Stated so the settings input can show what it is departing from.
 */
export const EVICT_DEFAULT_TOKENS = 20_000;

/**
 * Roughly four characters per token — upstream's own conversion, which it uses
 * to turn the token limit into the byte comparison it actually performs
 * (`textContent.length > toolTokenLimitBeforeEvict * 4`). Reproduced here only
 * to describe the threshold in bytes; nothing depends on it being exact.
 */
export const CHARS_PER_TOKEN = 4;

/** True when this path is the harness parking an oversized result, not the agent. */
export function isEvicted(path: string): boolean {
	return path.startsWith(EVICT_ROOT);
}

export const EVICT_HELP =
	'Not the agent writing a file — a tool result too large for the context. ' +
	'The harness parked the whole thing here and handed the model a pointer and a sample instead.';
