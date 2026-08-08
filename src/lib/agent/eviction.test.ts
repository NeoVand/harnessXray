import { describe, it, expect } from 'vitest';
import { isEvicted, EVICT_ROOT, EVICT_DEFAULT_TOKENS, CHARS_PER_TOKEN } from './eviction';
import { summarise } from '$lib/xray/format';
import type { XrayEvent } from '$lib/xray/events';

/**
 * The eviction seam.
 *
 * There is no clever logic here — a path prefix and a caption — but both are
 * load-bearing, and both are pinned to an upstream string. If deepagents ever
 * moves the parking directory, this test is what fails instead of the timeline
 * silently going back to describing an eviction as the agent writing a file.
 */

function fsWrite(path: string, bytes: number): XrayEvent {
	return {
		id: 'e1',
		seq: 0,
		branchId: 'main',
		t: 0,
		kind: 'fs_write',
		scope: 'main',
		displayKind: 'fs',
		op: 'write',
		path,
		bytes
	} satisfies Extract<XrayEvent, { kind: 'fs_write' }>;
}

describe('isEvicted', () => {
	it('recognises the directory the middleware parks results in', () => {
		expect(EVICT_ROOT).toBe('/large_tool_results/');
		expect(isEvicted('/large_tool_results/call_abc123.txt')).toBe(true);
	});

	it("leaves the agent's own files alone", () => {
		for (const p of [
			'/notes/2402.md',
			'/paper/review.md',
			'/memories/user.md',
			'/figures/x1.png'
		]) {
			expect(isEvicted(p)).toBe(false);
		}
	});

	it('does not match a lookalike the agent could create itself', () => {
		// A prefix check, not a substring one: an agent writing to
		// /notes/large_tool_results/ is doing its own filing.
		expect(isEvicted('/notes/large_tool_results/x.txt')).toBe(false);
	});
});

describe('the timeline caption', () => {
	it('describes an eviction as the harness parking a result, not a write', () => {
		const line = summarise(fsWrite('/large_tool_results/call_1.txt', 86_000));
		expect(line).toContain('parked');
		expect(line).toContain('pointer');
		// The size is the whole explanation for why it happened, so it must survive.
		expect(line).toContain('84.0 KB');
		expect(line).not.toContain('write');
	});

	it('still describes an ordinary write as a write', () => {
		expect(summarise(fsWrite('/paper/review.md', 1200))).toBe('write /paper/review.md');
	});
});

describe('the threshold', () => {
	it('states the framework default and a byte conversion for the settings copy', () => {
		expect(EVICT_DEFAULT_TOKENS).toBe(20_000);
		// ~80KB, which is why this app's 60,000-char fetch_paper cap never trips it.
		expect((EVICT_DEFAULT_TOKENS * CHARS_PER_TOKEN) / 1024).toBeCloseTo(78.1, 1);
		expect(EVICT_DEFAULT_TOKENS * CHARS_PER_TOKEN).toBeGreaterThan(60_000);
	});
});
