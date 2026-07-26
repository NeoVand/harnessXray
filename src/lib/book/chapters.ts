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
 * Each chapter is a component — one diagram, then prose — rather than markdown,
 * because the diagrams are hand-authored SVG keyed to the `--hx-*` legend and a
 * renderer would put an escaping layer between them and the theme. The prose is
 * about *this* application: every tool name, subagent contract and middleware
 * layer it mentions was read from the agent code, so if the harness changes,
 * the chapter that describes it is wrong until someone edits it. That is the
 * intended maintenance pressure.
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
		title: 'A filesystem made of state',
		icon: ICON.files,
		component: Filesystem
	},
	{
		id: 'tools',
		label: 'tools',
		title: 'Tools: asking, not doing',
		icon: ICON.tool,
		component: Tools
	},
	{
		id: 'plan',
		label: 'plan',
		title: 'The plan is a channel',
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
		title: 'Gates: pausing the graph',
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
