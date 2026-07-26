import { describe, it, expect } from 'vitest';
import { SystemMessage, AIMessage, type BaseMessage } from '@langchain/core/messages';
import { createSkillsMiddleware, StateBackend } from 'deepagents/browser';
import { skills, skillPath, skillReadIn, SKILLS_ROOT, BUILTIN_SKILLS } from './skills.svelte';
import { SUBAGENTS } from './subagents';
import { splitSystem } from '$lib/xray/context';

/**
 * Progressive disclosure, proven against the installed package.
 *
 * The claim on the tin: a skill costs one line of prompt until the agent
 * reads it. These tests run deepagents' own SkillsMiddleware over the exact
 * files the app seeds, and pin all three joints — the metadata scan finds
 * every skill, the prompt fragment carries names and paths but never bodies,
 * and the read itself is recognisable on the timeline. If any of that drifts
 * in an upgrade, this file fails before a class demo does.
 */

/** One phrase per built-in that lives only in the BODY, never the description. */
const BODY_SENTINELS: Record<string, string> = {
	'skill-creator': 'The description is the whole interface.',
	'arxiv-review': '## Note format',
	infographic: 'no art direction'
};

function textOf(m: BaseMessage): string {
	return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
}

/** Run the real middleware the way the harness does, capture the prompt it built. */
async function assembledPrompt(): Promise<string> {
	const mw = createSkillsMiddleware({
		// The same factory shape session.svelte.ts hands to createDeepAgent.
		backend: (cfg: { state: unknown }) => new StateBackend(cfg as never),
		sources: [SKILLS_ROOT]
	}) as unknown as {
		beforeAgent: (state: unknown) => Promise<{ skillsMetadata?: unknown[] } | undefined | void>;
		wrapModelCall: (request: unknown, handler: (r: unknown) => unknown) => unknown;
	};

	const files = skills.seed();
	const patch = await mw.beforeAgent({ files, skillsMetadata: [] });
	const meta = (patch && patch.skillsMetadata) || [];

	// The scan half: every seeded skill was found, at the path we seeded it to.
	const found = (meta as { name: string; path: string; description: string }[])
		.map((s) => s.name)
		.sort();
	expect(found).toEqual(BUILTIN_SKILLS.map((s) => s.name).sort());
	for (const s of meta as { name: string; path: string }[]) {
		expect(s.path).toBe(skillPath(s.name));
	}

	let prompt = '';
	await mw.wrapModelCall(
		{
			state: { files, skillsMetadata: meta },
			systemMessage: new SystemMessage('BASE PROMPT'),
			messages: []
		},
		(request) => {
			prompt = textOf((request as { systemMessage: BaseMessage }).systemMessage);
			return new AIMessage('ok');
		}
	);
	return prompt;
}

describe('skills through the real deepagents middleware', () => {
	it('puts every name, description and path in the prompt — and no bodies', async () => {
		const prompt = await assembledPrompt();

		expect(prompt.startsWith('BASE PROMPT')).toBe(true);
		expect(prompt).toContain('## Skills System');

		for (const s of BUILTIN_SKILLS) {
			expect(prompt).toContain(s.name);
			expect(prompt).toContain(s.description);
			expect(prompt).toContain(skillPath(s.name));
		}

		// Progressive disclosure means the instructions are NOT here yet.
		for (const [name, sentinel] of Object.entries(BODY_SENTINELS)) {
			expect(BUILTIN_SKILLS.find((s) => s.name === name)!.body).toContain(sentinel);
			expect(prompt).not.toContain(sentinel);
		}
	});

	it('is the fragment the Context panel knows how to cut back out', async () => {
		const prompt = await assembledPrompt();
		const bands = splitSystem(prompt);
		expect(bands.some((p) => p.id === 'sys:skills')).toBe(true);
		// The library's prompt cost is the listing, not the sum of the files.
		const skillsBand = bands.find((p) => p.id === 'sys:skills')!;
		const library = BUILTIN_SKILLS.reduce((n, s) => n + s.body.length, 0);
		expect(skillsBand.chars).toBeLessThan(library);
	});
});

describe('the files the agent reads', () => {
	it('seeds the complete SKILL.md, frontmatter included, at the spec path', () => {
		const files = skills.seed();
		for (const s of skills.active) {
			expect(files[skillPath(s.name)]?.content).toBe(s.body);
		}
	});
});

describe('recognising the read on the timeline', () => {
	it('names the skill for read_file and read, on exactly the SKILL.md path', () => {
		expect(skillReadIn('read_file', { file_path: '/skills/infographic/SKILL.md' })).toBe(
			'infographic'
		);
		expect(skillReadIn('read', { path: '/skills/arxiv-review/SKILL.md' })).toBe('arxiv-review');
	});

	it('stays silent for everything that is not a skill read', () => {
		expect(skillReadIn('read_file', { file_path: '/notes/2401.04088.md' })).toBeUndefined();
		expect(skillReadIn('read_file', { file_path: '/skills/a/b/SKILL.md' })).toBeUndefined();
		expect(skillReadIn('ls', { path: '/skills/infographic/SKILL.md' })).toBeUndefined();
		expect(skillReadIn('write_file', { file_path: '/skills/x/SKILL.md' })).toBeUndefined();
	});
});

describe('subagents carry the skills middleware', () => {
	it('every custom subagent states skills — deepagents does not inherit them', () => {
		// The trap this pins: only the general-purpose subagent inherits the main
		// agent's skills. A custom subagent without this line has no skills
		// section at all, and an image-smith that cannot see the infographic
		// skill quietly falls back to whatever its last prompt said.
		for (const sub of SUBAGENTS) {
			expect(sub.skills, `${sub.name} lost its skills`).toEqual([SKILLS_ROOT]);
		}
	});

	it('image-smith is told to read the doctrine, not just shown the list', () => {
		const smith = SUBAGENTS.find((s) => s.name === 'image-smith')!;
		expect(smith.systemPrompt).toMatch(/read the infographic skill/i);
	});
});
