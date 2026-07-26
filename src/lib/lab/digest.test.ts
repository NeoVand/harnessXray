import { describe, it, expect } from 'vitest';
import { buildDigest, DIGEST_CAP, type DigestSession } from './digest';
import { DISPLAY_OF, type EventKind, type XrayEvent } from '$lib/xray/events';
import type { Source } from '$lib/agent/sources';

/**
 * The digest is what the tutor is allowed to know, so these tests pin the
 * facts a student's questions hang on — tool names, lanes, gate decisions —
 * and the two structural promises: it never throws, and it never outgrows
 * the prompt budget.
 */

let n = 0;
const ev = (e: Record<string, unknown> & { kind: EventKind }): XrayEvent =>
	({
		id: `e${++n}`,
		seq: n,
		t: n,
		displayKind: DISPLAY_OF[e.kind],
		scope: 'main',
		branchId: 'main',
		...e
	}) as unknown as XrayEvent;

const sess = (over: Partial<DigestSession> = {}): DigestSession => ({
	model: 'gpt-5.6-terra',
	todos: [],
	fileList: [],
	...over
});

describe('buildDigest', () => {
	it('never throws on an empty bus and still names the model', () => {
		const out = buildDigest({ events: [] }, sess());
		expect(out).toContain('gpt-5.6-terra');
		expect(out).toContain('no turns yet');
	});

	it('carries tool names, lane labels, skill reads and gate decisions', () => {
		const events: XrayEvent[] = [
			ev({ kind: 'run_start', input: 'Review the attention papers' }),
			ev({
				kind: 'http_request',
				url: 'https://api.openai.com/v1/responses',
				method: 'POST',
				headers: {},
				body: {},
				bytes: 10
			}),
			ev({
				kind: 'http_response',
				httpId: 'e2',
				status: 200,
				headers: {},
				streamed: true,
				ms: 900,
				rawUsage: {
					input_tokens: 1000,
					input_tokens_details: { cached_tokens: 500 },
					output_tokens: 200,
					total_tokens: 1200
				}
			}),
			ev({ kind: 'tool_start', toolCallId: 'c1', name: 'write_todos', args: {}, ours: false }),
			ev({
				kind: 'tool_start',
				toolCallId: 'c2',
				name: 'fetch_paper',
				args: {},
				ours: true,
				scope: 'sub:task:1',
				lane: 'paper-reader'
			}),
			ev({
				kind: 'tool_start',
				toolCallId: 'c3',
				name: 'read_file',
				args: { file_path: '/skills/poster/SKILL.md' },
				ours: false,
				skill: 'poster'
			}),
			ev({
				kind: 'interrupt',
				interruptId: 'i1',
				actions: [{ name: 'generate_image', args: {} }],
				allowed: ['approve', 'reject']
			}),
			ev({ kind: 'resume', decisions: [{ type: 'approve' }], actions: ['generate_image'] }),
			ev({ kind: 'fs_write', op: 'write', path: '/notes/outline.md', bytes: 120 }),
			ev({ kind: 'run_end', status: 'done', ms: 4200 })
		];
		const out = buildDigest(
			{ events },
			sess({
				todos: [{ content: 'read the papers', status: 'in_progress' }],
				fileList: ['/notes/outline.md'],
				skillNames: ['poster']
			}),
			[
				{
					n: 1,
					arxivId: '2401.00001',
					title: 'Attention Is Enough',
					authors: [],
					year: 2024,
					citations: 3,
					fetched: true,
					cited: 2
				} satisfies Source
			]
		);

		expect(out).toContain('Review the attention papers');
		expect(out).toContain('fetch_paper');
		expect(out).toContain('paper-reader');
		expect(out).toContain('skill:poster');
		expect(out).toContain('gate raised: generate_image');
		expect(out).toContain('decision taken: approve');
		expect(out).toContain('write /notes/outline.md');
		expect(out).toContain('read the papers');
		expect(out).toContain('2401.00001');
		// The wire fold: 500 of 1000 input tokens were cache hits.
		expect(out).toContain('50% cached');
	});

	it('respects the hard cap by eliding whole early turns, newest kept', () => {
		const events: XrayEvent[] = [];
		for (let i = 0; i < 220; i++) {
			events.push(ev({ kind: 'run_start', input: `turn number ${i} ${'x'.repeat(140)}` }));
			for (let j = 0; j < 12; j++) {
				events.push(
					ev({
						kind: 'tool_start',
						toolCallId: `c${i}-${j}`,
						name: `tool_${j}`,
						args: {},
						ours: true
					})
				);
			}
			events.push(ev({ kind: 'run_end', status: 'done', ms: 1000 }));
		}
		const out = buildDigest({ events }, sess());
		expect(out.length).toBeLessThanOrEqual(DIGEST_CAP);
		expect(out).toContain('elided');
		expect(out).toContain('turn number 219');
		expect(out).not.toContain('turn number 0 ');
	});
});
