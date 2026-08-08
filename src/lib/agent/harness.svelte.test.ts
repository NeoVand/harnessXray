import { describe, it, expect } from 'vitest';
import { createDeepAgent, StateBackend, createFilesystemMiddleware } from 'deepagents/browser';
import { todoListMiddleware } from 'langchain';
import { AGENT_TOOLS } from './tools';
import { SUBAGENTS } from './subagents';
import { SYSTEM_PROMPT } from './prompt';
import { SKILLS_ROOT } from './skills.svelte';
import { worldStateMiddleware } from './awareness';
import { oneGatePerTurnMiddleware } from './one-gate';

/**
 * What the harness actually assembles, pinned.
 *
 * deepagents 1.12 moved `todoListMiddleware` out of the default stack and into
 * a Codex harness profile, which applies only when a registered profile matches
 * the model. Ours does not match one — so the upgrade silently removed
 * `write_todos`, the `todos` channel, the plan band in the system prompt, and
 * with them the whole plan tab. Nothing threw. Types were fine. 132 tests
 * passed. The panel simply had nothing left to draw, and the only way to notice
 * was to look at the app.
 *
 * So the composition itself is now a test. Every middleware here backs a panel;
 * if an upgrade drops one, this fails with the name of the thing that broke
 * rather than leaving an empty pane to be discovered in front of a class.
 */

const backend = (c: { state: unknown }) => new StateBackend(c as never);

/** The agent as `#ensureAgent` builds it, minus the parts that only choose storage. */
function realAgent() {
	return createDeepAgent({
		model: 'openai:gpt-4o-mini',
		tools: AGENT_TOOLS,
		systemPrompt: SYSTEM_PROMPT,
		subagents: SUBAGENTS as never,
		skills: [SKILLS_ROOT],
		middleware: [
			todoListMiddleware(),
			createFilesystemMiddleware({ backend }),
			worldStateMiddleware,
			oneGatePerTurnMiddleware
		] as never,
		interruptOn: { generate_image: true },
		backend
	});
}

const namesOf = (a: unknown) =>
	((a as { options?: { middleware?: { name: string }[] } }).options?.middleware ?? []).map(
		(m) => m.name
	);

const nodesOf = async (a: unknown) =>
	Object.keys(
		(
			await (
				a as { getGraphAsync: (o: unknown) => Promise<{ nodes: Record<string, unknown> }> }
			).getGraphAsync({ xray: true })
		).nodes
	);

describe('the assembled harness', () => {
	it('installs every middleware a panel depends on', async () => {
		const names = namesOf(await realAgent());
		// One entry per panel that would go blank without it.
		expect(names).toContain('todoListMiddleware'); // the plan tab
		expect(names).toContain('SkillsMiddleware'); // the skills tab
		expect(names).toContain('FilesystemMiddleware'); // the files tab
		expect(names).toContain('HumanInTheLoopMiddleware'); // approval cards
		expect(names).toContain('SummarizationMiddleware'); // the compaction notice
		expect(names).toContain('subAgentMiddleware'); // the subagents tab
		expect(names).toContain('WorldStateMiddleware'); // ours
		expect(names).toContain('OneGatePerTurnMiddleware'); // ours
	});

	it('compiles the hooks the graph tab draws', async () => {
		const nodes = await nodesOf(await realAgent());
		expect(nodes).toContain('model_request');
		expect(nodes).toContain('tools');
		// A middleware with a hook is a NODE; one without is invisible on the
		// drawing however well it works. These are the ones the graph shows.
		expect(nodes.some((n) => n.endsWith('.before_agent'))).toBe(true);
		expect(nodes.some((n) => n.endsWith('.after_model'))).toBe(true);
	});

	it('draws the same agent before a run as during one', async () => {
		// `peekAgent` builds a keyless stand-in so the graph tab works before the
		// first message. It has to carry everything that changes the SHAPE —
		// skills, gates, our middleware — or the topology quietly simplifies
		// whenever no run has happened yet, which reads as the graph breaking.
		const shape = await createDeepAgent({
			model: 'openai:gpt-4o-mini',
			tools: AGENT_TOOLS,
			systemPrompt: SYSTEM_PROMPT,
			subagents: SUBAGENTS as never,
			skills: [SKILLS_ROOT],
			middleware: [todoListMiddleware(), worldStateMiddleware, oneGatePerTurnMiddleware] as never,
			interruptOn: { generate_image: true }
		});
		expect((await nodesOf(shape)).sort()).toEqual((await nodesOf(await realAgent())).sort());
	});
});
