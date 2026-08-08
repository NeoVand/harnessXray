import type { Component } from 'svelte';
import { ICON, type IconValue } from '$lib/icons';
import TheHarness from './chapters/TheHarness.svelte';
import Filesystem from './chapters/Filesystem.svelte';
import Tools from './chapters/Tools.svelte';
import Plan from './chapters/Plan.svelte';
import Subagents from './chapters/Subagents.svelte';
import Skills from './chapters/Skills.svelte';
import Memory from './chapters/Memory.svelte';
import Middleware from './chapters/Middleware.svelte';
import Gates from './chapters/Gates.svelte';
import BuildingYourOwn from './chapters/BuildingYourOwn.svelte';

/**
 * The book's spine.
 *
 * Each chapter is a component rather than markdown, so the plates, the lead,
 * the subheads and the closing `p.live` pointer are structure the page can
 * style directly instead of output from a renderer.
 *
 * The prose is about *this* application: every tool name, subagent contract
 * and middleware layer it mentions was read from the agent code, so if the
 * harness changes, the chapter describing it is wrong until someone edits it.
 * That is the intended maintenance pressure.
 *
 * The voice is load-bearing too, and easy to lose. A chapter opens with a
 * `p.lead` stating the idea in plain words before any jargon, keeps
 * paragraphs to one thought each, and puts anything enumerable in a list
 * rather than a sentence full of semicolons. Density is not rigour — the
 * reader is meeting these ideas for the first time, and every fact here can
 * be told plainly. Where we learned something the hard way, the chapter says
 * so; the failures teach faster than the descriptions do.
 */
export interface Chapter {
	id: string;
	/** Rail label — short, lowercase, eyebrow-set. */
	label: string;
	/** Header title — a claim, not a keyword. */
	title: string;
	icon: IconValue;
	component: Component;
}

export const CHAPTERS: Chapter[] = [
	{
		id: 'the-harness',
		label: 'the harness',
		title: 'What a harness is',
		icon: ICON.agent,
		component: TheHarness
	},
	{
		id: 'filesystem',
		label: 'filesystem',
		title: 'A filesystem with no disk',
		icon: ICON.files,
		component: Filesystem
	},
	{
		id: 'tools',
		label: 'tools',
		title: 'The model asks, the harness does',
		icon: ICON.tool,
		component: Tools
	},
	{
		id: 'plan',
		label: 'plan',
		title: 'A to-do list the harness owns',
		icon: ICON.todo,
		component: Plan
	},
	{
		id: 'subagents',
		label: 'subagents',
		title: 'Subagents spend their own context',
		icon: ICON.subagent,
		component: Subagents
	},
	{
		id: 'skills',
		label: 'skills',
		title: 'Skills are files',
		icon: ICON.skill,
		component: Skills
	},
	{
		id: 'memory',
		label: 'memory',
		title: 'Memory has two lifetimes',
		icon: ICON.memory,
		component: Memory
	},
	{
		id: 'middleware',
		label: 'middleware',
		title: 'The middleware onion',
		icon: ICON.state,
		component: Middleware
	},
	{
		id: 'gates',
		label: 'gates',
		title: 'Gates: stopping to ask a human',
		icon: ICON.pause,
		component: Gates
	},
	{
		id: 'building-your-own',
		label: 'build your own',
		title: 'Building your own',
		icon: ICON.graph,
		component: BuildingYourOwn
	}
];
