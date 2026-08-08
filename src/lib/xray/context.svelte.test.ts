import { describe, it, expect } from 'vitest';
import { BASE_AGENT_PROMPT, TASK_SYSTEM_PROMPT } from 'deepagents/browser';
import { splitSystem } from './context';

/**
 * The system prompt's seams, pinned against the installed package.
 *
 * The panel recovers these by string-matching, because `createDeepAgent`
 * concatenates its fragments with nothing between them. That makes an upgrade
 * able to blank a band silently — which is exactly what 1.12 did to the
 * filesystem fragment, deleting it in favour of guidance inside the tool
 * schemas. These tests fail when a marker stops matching, so the next one is
 * caught here rather than in front of a class.
 */
describe('splitSystem', () => {
	it('finds the harness bands the installed version actually emits', () => {
		const prompt = [
			'Our own prefix, written in prompt.ts.',
			BASE_AGENT_PROMPT,
			'## `write_todos`\nplan guidance',
			TASK_SYSTEM_PROMPT,
			'## Skills System\nskill list',
			'<agent_memory>\nremembered things'
		].join('\n\n');

		const keys = splitSystem(prompt).map((p) => p.id);
		expect(keys).toEqual([
			'sys:ours',
			'sys:base',
			'sys:plan',
			'sys:task',
			'sys:skills',
			'sys:memory'
		]);
	});

	it('still decomposes a run recorded before the filesystem fragment was removed', () => {
		// The bundled demo and every archived thread carry 1.11's prompt. A single
		// marker per band would have to choose between reading those correctly and
		// reading a current run correctly.
		const prompt = [
			'ours',
			'You are a Deep Agent, an AI assistant that helps users accomplish tasks.',
			'## Filesystem Tools `ls`, `read_file`\nfilesystem guidance',
			'## `task` (subagent spawner)\ndelegation guidance'
		].join('\n\n');

		const pieces = splitSystem(prompt);
		expect(pieces.map((p) => p.id)).toEqual(['sys:ours', 'sys:base', 'sys:files', 'sys:task']);
		expect(pieces.find((p) => p.id === 'sys:files')?.text).toContain('filesystem guidance');
	});

	it('attributes everything before the first harness fragment to us', () => {
		const pieces = splitSystem(`mine\n\n${BASE_AGENT_PROMPT}`);
		expect(pieces[0].id).toBe('sys:ours');
		expect(pieces[0].ours).toBe(true);
		expect(pieces[0].text.trim()).toBe('mine');
		expect(pieces[1].ours).toBe(false);
	});

	it('degrades to one band rather than breaking when nothing matches', () => {
		const pieces = splitSystem('a prompt from some other harness entirely');
		expect(pieces).toHaveLength(1);
		expect(pieces[0].id).toBe('sys:ours');
	});
});
