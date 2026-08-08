import { describe, it, expect } from 'vitest';
import { EventBus } from './bus.svelte';
import { crew } from './crew';

/**
 * The crew roster, pinned against the strings deepagents actually puts on the
 * wire (verified against 1.11.1).
 *
 * The case worth a test is the one that motivated the panel: the harness
 * appends a `general-purpose` subagent this app never declared, and gives it
 * the main agent's whole tool set. A roster built from our own registry would
 * show four and be wrong; a roster built from the wire shows five.
 */

/** The shape of the task tool as it appears in a request body. */
function taskTool(names: string[], described = names) {
	return {
		type: 'function',
		name: 'task',
		description: [
			'Launch an ephemeral subagent to handle complex, multi-step independent tasks.',
			'',
			'Available agent types and the tools they have access to:',
			...described.map((n) => `    - ${n}: what ${n} is for`),
			'',
			'When using the Task tool, you must specify a subagent_type parameter.'
		].join('\n'),
		parameters: {
			type: 'object',
			properties: {
				description: { type: 'string', description: 'The task to execute with the selected agent' },
				subagent_type: {
					type: 'string',
					description: `Name of the agent to use. Available: ${names.join(', ')}`
				}
			}
		}
	};
}

function request(bus: EventBus, tools: unknown[]) {
	return bus.emit({
		kind: 'http_request',
		scope: 'main',
		url: 'https://api.openai.com/v1/responses',
		method: 'POST',
		headers: {},
		body: { tools },
		bytes: 10,
		label: 'POST'
	});
}

const ROSTER = ['general-purpose', 'paper-reader', 'image-smith', 'report-writer', 'critic'];

describe('crew', () => {
	it('lists what the model may dispatch, including the one we never declared', () => {
		const bus = new EventBus();
		request(bus, [{ name: 'search_papers' }, { name: 'read_file' }, taskTool(ROSTER)]);

		const roster = crew(bus);
		expect(roster.map((m) => m.name)).toEqual(ROSTER);

		const gp = roster.find((m) => m.name === 'general-purpose');
		expect(gp?.origin).toBe('harness');
		// It was handed `defaultTools` — the main agent's whole set — so its count
		// is the wire's tool count rather than anything we could look up.
		expect(gp?.tools).toEqual({ count: 3, known: true });

		// Ours are marked as ours, with counts from our own specs.
		const reader = roster.find((m) => m.name === 'paper-reader');
		expect(reader?.origin).toBe('ours');
		expect(reader?.tools.known).toBe(true);
		expect(reader?.tools.count).toBeGreaterThan(0);

		// Descriptions come from the roster lines the harness wrote.
		expect(reader?.description).toBe('what paper-reader is for');
	});

	it('is empty until a request has carried the task tool', () => {
		const bus = new EventBus();
		expect(crew(bus)).toEqual([]);
		request(bus, [{ name: 'read_file' }]);
		expect(crew(bus)).toEqual([]);
	});

	it('counts dispatches per subagent type and remembers the last one', () => {
		const bus = new EventBus();
		request(bus, [taskTool(ROSTER)]);
		const ids: string[] = [];
		for (const type of ['paper-reader', 'paper-reader', 'critic']) {
			ids.push(
				bus.emit({
					kind: 'tool_start',
					scope: 'main',
					toolCallId: `c${ids.length}`,
					name: 'task',
					args: { subagent_type: type, description: 'go' },
					ours: false,
					label: 'task'
				}).id
			);
		}

		const by = Object.fromEntries(crew(bus).map((m) => [m.name, m.calls]));
		expect(by['paper-reader'].n).toBe(2);
		expect(by['paper-reader'].last).toBe(ids[1]);
		expect(by['critic'].n).toBe(1);
		expect(by['image-smith']).toEqual({ n: 0, last: '' });
	});

	it('trusts the schema enum over the prose when they disagree', () => {
		// The enum is generated from the graph map the tool dispatches through, so
		// it can never claim a subagent that would be refused. The prose can drift.
		const bus = new EventBus();
		request(bus, [taskTool(['critic'], ['critic', 'ghost-writer'])]);
		expect(crew(bus).map((m) => m.name)).toEqual(['critic']);
	});

	it('reads the newest request, and ignores image calls that carry no tools', () => {
		const bus = new EventBus();
		request(bus, [taskTool(['critic'])]);
		bus.emit({
			kind: 'http_request',
			scope: 'main',
			url: 'https://api.openai.com/v1/images/generations',
			method: 'POST',
			headers: {},
			body: { prompt: 'a cat' },
			bytes: 4,
			label: 'POST'
		});
		expect(crew(bus).map((m) => m.name)).toEqual(['critic']);
	});
});
