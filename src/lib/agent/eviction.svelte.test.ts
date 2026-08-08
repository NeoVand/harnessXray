import { describe, it, expect } from 'vitest';
import { createFilesystemMiddleware, StateBackend } from 'deepagents/browser';
import { ToolMessage } from '@langchain/core/messages';
import { EVICT_ROOT } from './eviction';

/**
 * Eviction, proven against the installed package rather than described.
 *
 * Two claims this app now depends on, both of which would fail silently.
 *
 * The first is that naming `createFilesystemMiddleware` in the middleware array
 * REPLACES the framework's default instance instead of adding a second one.
 * `mergeMiddlewareStack` matches on `.name`, so it does — but a duplicate would
 * mean two of every file tool on the wire, and nothing about that shouts. The
 * middleware's own name is the whole mechanism, so that is what gets pinned.
 *
 * The second is the parking path. The timeline captions a write as an eviction
 * purely by prefix, so if upstream moves the directory the caption stops
 * appearing and an eviction goes back to looking like the agent writing a file
 * for no reason. Here we make the real middleware actually evict, and read the
 * path back out of the state update it produces.
 */

const backend = (cfg: { state: unknown }) => new StateBackend(cfg as never);

describe('the filesystem middleware we now configure ourselves', () => {
	it('carries the name the merge matches on, so ours replaces the default', () => {
		const mine = createFilesystemMiddleware({ backend, toolTokenLimitBeforeEvict: 500 });
		const theirs = createFilesystemMiddleware();
		expect((mine as { name?: string }).name).toBe((theirs as { name?: string }).name);
		expect((mine as { name?: string }).name).toBeTruthy();
	});

	it('registers the six file tools exactly once', () => {
		const mw = createFilesystemMiddleware({ backend, toolTokenLimitBeforeEvict: 500 });
		const names = ((mw as { tools?: { name?: string }[] }).tools ?? []).map((t) => t.name);
		for (const t of ['ls', 'read_file', 'write_file', 'edit_file', 'glob', 'grep']) {
			expect(names.filter((n) => n === t)).toHaveLength(1);
		}
	});

	it('parks an oversized tool result at the path the timeline looks for', async () => {
		const limit = 500; // tokens; upstream compares against limit * 4 characters
		const mw = createFilesystemMiddleware({
			backend,
			toolTokenLimitBeforeEvict: limit
		}) as unknown as {
			name: string;
			wrapToolCall?: (
				request: unknown,
				handler: (r: unknown) => unknown
			) => Promise<unknown> | unknown;
		};

		// Not a filesystem tool: upstream exempts its own six from eviction, so a
		// read_file result would never be parked however large it got.
		// Realistically large: the pointer message carries a fixed slab of
		// read_file instructions plus a head/tail preview, so a payload only just
		// over the line would be dominated by boilerplate and prove nothing.
		const huge = 'x'.repeat(200_000);
		const toolCallId = 'call_evict_me';
		const result = await mw.wrapToolCall?.(
			{
				toolCall: { name: 'fetch_paper', id: toolCallId, args: {} },
				state: { files: {} },
				runtime: { state: { files: {} } }
			},
			// A real ToolMessage, not a shaped object: upstream gates the whole
			// eviction path on `ToolMessage.isInstance(result)`, so a lookalike
			// sails straight through and the test would pass by not testing.
			() => new ToolMessage({ content: huge, tool_call_id: toolCallId, name: 'fetch_paper' })
		);

		// The middleware answers with a Command carrying two halves of the trade:
		// the file it parked, and the much smaller message it hands the model.
		const update = (
			result as { update?: { files?: Record<string, unknown>; messages?: unknown[] } }
		)?.update;

		// Half one: the whole result is on disk, at the path the timeline matches.
		const parkedAt = Object.keys(update?.files ?? {});
		expect(parkedAt).toEqual([`${EVICT_ROOT}${toolCallId}.txt`]);
		const parked = update?.files?.[parkedAt[0]] as { content?: string };
		expect(parked.content).toBe(huge);

		// Half two — the point of the whole mechanism: what the MODEL receives is
		// a pointer and a sample, not the result it asked for.
		const seen = String((update?.messages?.[0] as { content?: unknown })?.content ?? '');
		expect(seen).toContain(`${EVICT_ROOT}${toolCallId}.txt`);
		expect(seen).toContain('read_file');
		// The real claim: the model's view is BOUNDED while the result is not. A
		// 200KB result reaches it as a couple of KB.
		expect(seen.length).toBeLessThan(5_000);
	});

	it('leaves a result under the threshold completely alone', async () => {
		const limit = 500;
		const mw = createFilesystemMiddleware({
			backend,
			toolTokenLimitBeforeEvict: limit
		}) as unknown as {
			wrapToolCall?: (r: unknown, h: (r: unknown) => unknown) => Promise<unknown> | unknown;
		};
		const small = 'y'.repeat(limit * 2);
		const msg = new ToolMessage({ content: small, tool_call_id: 'call_ok', name: 'fetch_paper' });
		const result = await mw.wrapToolCall?.(
			{
				toolCall: { name: 'fetch_paper', id: 'call_ok', args: {} },
				state: { files: {} },
				runtime: { state: { files: {} } }
			},
			() => msg
		);
		// Same message object back, no Command, no file written.
		expect(result).toBe(msg);
	});
});
