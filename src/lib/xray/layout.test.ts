import { describe, it, expect } from 'vitest';
import { classify, collapseMiddleware, hookOf, layoutDag, roundedPath } from './layout';
import type { EdgeIn } from './layout';

/**
 * The layout is a pure function, which is the whole reason it exists as its
 * own module — the graph drawing's geometry can be pinned down without a DOM.
 */

/** The real compiled topology of the harness, verbatim from getGraphAsync. */
const REAL_IDS = [
	'__start__',
	'todoListMiddleware.after_model',
	'SkillsMiddleware.before_agent',
	'FilesystemMiddleware.before_agent',
	'patchToolCallsMiddleware.before_agent',
	'oneGatePerTurnMiddleware.after_model',
	'HumanInTheLoopMiddleware.after_model',
	'model_request',
	'tools',
	'__end__'
];
const REAL_EDGES: EdgeIn[] = [
	{
		from: 'FilesystemMiddleware.before_agent',
		to: 'patchToolCallsMiddleware.before_agent',
		conditional: false
	},
	{
		from: 'SkillsMiddleware.before_agent',
		to: 'FilesystemMiddleware.before_agent',
		conditional: false
	},
	{ from: '__start__', to: 'SkillsMiddleware.before_agent', conditional: false },
	{ from: 'model_request', to: 'HumanInTheLoopMiddleware.after_model', conditional: false },
	{
		from: 'oneGatePerTurnMiddleware.after_model',
		to: 'todoListMiddleware.after_model',
		conditional: false
	},
	{ from: 'patchToolCallsMiddleware.before_agent', to: 'model_request', conditional: false },
	{ from: 'tools', to: 'model_request', conditional: false },
	{
		from: 'HumanInTheLoopMiddleware.after_model',
		to: 'oneGatePerTurnMiddleware.after_model',
		conditional: true
	},
	{ from: 'HumanInTheLoopMiddleware.after_model', to: 'model_request', conditional: true },
	{ from: 'todoListMiddleware.after_model', to: 'tools', conditional: true },
	{ from: 'todoListMiddleware.after_model', to: 'model_request', conditional: true },
	{ from: 'todoListMiddleware.after_model', to: '__end__', conditional: true }
];

const BEFORE_GROUP = 'mw:SkillsMiddleware.before_agent';
const AFTER_GROUP = 'mw:HumanInTheLoopMiddleware.after_model';

describe('layoutDag', () => {
	it('layers a pipeline top to bottom', () => {
		const g = layoutDag(
			['__start__', 'a', 'b', '__end__'],
			[
				{ from: '__start__', to: 'a', conditional: false },
				{ from: 'a', to: 'b', conditional: false },
				{ from: 'b', to: '__end__', conditional: false }
			]
		);
		const layerOf = Object.fromEntries(g.nodes.map((n) => [n.id, n.layer]));
		expect(layerOf['__start__']).toBe(0);
		expect(layerOf['a']).toBe(1);
		expect(layerOf['b']).toBe(2);
		expect(layerOf['__end__']).toBe(3);
		// A chain is one node wide and never wider — terminals are slimmer
		// pills now, so the widest node is the measure.
		expect(g.width).toBe(Math.max(...g.nodes.map((n) => n.w)));
	});

	it('survives the agent loop without inventing extra layers', () => {
		const g = layoutDag(
			['__start__', 'model', 'tools', '__end__'],
			[
				{ from: '__start__', to: 'model', conditional: false },
				{ from: 'model', to: 'tools', conditional: true },
				{ from: 'tools', to: 'model', conditional: false }, // the loop
				{ from: 'model', to: '__end__', conditional: true }
			]
		);
		const back = g.edges.find((e) => e.from === 'tools' && e.to === 'model');
		expect(back?.back).toBe(true);
		expect(back?.route).toBe('back');
		// The loop must not stretch the pipeline: four nodes, at most four layers.
		expect(Math.max(...g.nodes.map((n) => n.layer))).toBeLessThanOrEqual(3);
	});

	it('parks unreachable nodes instead of losing them', () => {
		const g = layoutDag(
			['__start__', 'a', 'island'],
			[{ from: '__start__', to: 'a', conditional: false }]
		);
		expect(g.nodes.map((n) => n.id)).toContain('island');
		const island = g.nodes.find((n) => n.id === 'island')!;
		expect(island.layer).toBeGreaterThan(1);
	});

	it('keeps __end__ in the final row even when a short edge reaches it early', () => {
		const g = layoutDag(
			['__start__', 'a', 'b', '__end__'],
			[
				{ from: '__start__', to: 'a', conditional: false },
				{ from: 'a', to: '__end__', conditional: true }, // early exit
				{ from: 'a', to: 'b', conditional: true },
				{ from: 'b', to: '__end__', conditional: false }
			]
		);
		const layerOf = Object.fromEntries(g.nodes.map((n) => [n.id, n.layer]));
		expect(layerOf['__end__']).toBe(Math.max(...g.nodes.map((n) => n.layer)));
	});

	it('draws a linear spine with straight vertical edges — zero crossings', () => {
		const g = layoutDag(
			['__start__', 'a', 'b', '__end__'],
			[
				{ from: '__start__', to: 'a', conditional: false },
				{ from: 'a', to: 'b', conditional: false },
				{ from: 'b', to: '__end__', conditional: false }
			]
		);
		// Every node centred on the same axis, every edge a plain drop.
		const centers = new Set(g.nodes.map((n) => n.x + n.w / 2));
		expect(centers.size).toBe(1);
		for (const e of g.edges) {
			expect(e.route).toBe('flow');
			expect(new Set(e.points.map((p) => p.x)).size).toBe(1);
		}
	});

	it('collapses the middleware onion into ordered groups', () => {
		const g = layoutDag(REAL_IDS, REAL_EDGES);
		// Ten compiled nodes draw as six shapes: two terminals, two groups,
		// model, tools.
		expect(g.nodes).toHaveLength(6);
		const before = g.nodes.find((n) => n.id === BEFORE_GROUP)!;
		expect(before.members).toEqual([
			'SkillsMiddleware.before_agent',
			'FilesystemMiddleware.before_agent',
			'patchToolCallsMiddleware.before_agent'
		]);
		// Onion order is execution order: HITL runs first after the model.
		const after = g.nodes.find((n) => n.id === AFTER_GROUP)!;
		expect(after.members).toEqual([
			'HumanInTheLoopMiddleware.after_model',
			'oneGatePerTurnMiddleware.after_model',
			'todoListMiddleware.after_model'
		]);
	});

	it('rewires group edges once each and keeps the conditional promise', () => {
		const { edges } = collapseMiddleware(REAL_IDS, REAL_EDGES);
		expect(edges).toHaveLength(7);
		// Two hooks jump back to the model; the fold must not draw two rails.
		const jump = edges.filter((e) => e.from === AFTER_GROUP && e.to === 'model_request');
		expect(jump).toHaveLength(1);
		expect(jump[0].conditional).toBe(true);
	});

	it('reads START → hooks → model → hooks → tools, END beside tools', () => {
		const g = layoutDag(REAL_IDS, REAL_EDGES);
		const layerOf = Object.fromEntries(g.nodes.map((n) => [n.id, n.layer]));
		expect(layerOf['__start__']).toBeLessThan(layerOf[BEFORE_GROUP]);
		expect(layerOf[BEFORE_GROUP]).toBeLessThan(layerOf['model_request']);
		expect(layerOf['model_request']).toBeLessThan(layerOf[AFTER_GROUP]);
		expect(layerOf[AFTER_GROUP]).toBeLessThan(layerOf['tools']);
		expect(layerOf['__end__']).toBe(layerOf['tools']);
	});

	it('routes loops on a rail right of the content, entering the target side-on', () => {
		const g = layoutDag(REAL_IDS, REAL_EDGES);
		const model = g.nodes.find((n) => n.id === 'model_request')!;
		const backs = g.edges.filter((e) => e.route === 'back');
		expect(backs.length).toBeGreaterThanOrEqual(2);
		for (const e of backs) {
			expect(Math.max(...e.points.map((p) => p.x))).toBeGreaterThan(model.x + model.w);
			const [a, b] = e.points.slice(-2);
			expect(a.y).toBe(b.y); // final approach is horizontal — the arrow points inward
		}
	});

	it('nests the return rails instead of crossing them', () => {
		const g = layoutDag(REAL_IDS, REAL_EDGES);
		const segs = (points: { x: number; y: number }[]) =>
			points.slice(1).map((p, i) => [points[i], p] as const);
		const backs = g.edges.filter((e) => e.route === 'back');
		let crossings = 0;
		for (let i = 0; i < backs.length; i++)
			for (let j = i + 1; j < backs.length; j++)
				for (const [a1, a2] of segs(backs[i].points))
					for (const [b1, b2] of segs(backs[j].points)) {
						// Axis-aligned segments cross iff one is vertical, one is
						// horizontal, and each spans the other's fixed coordinate.
						const aV = a1.x === a2.x;
						const bV = b1.x === b2.x;
						if (aV === bV) continue;
						const [v1, v2, h1, h2] = aV ? [a1, a2, b1, b2] : [b1, b2, a1, a2];
						const inside = (lo: number, hi: number, v: number) =>
							v > Math.min(lo, hi) && v < Math.max(lo, hi);
						if (inside(h1.x, h2.x, v1.x) && inside(v1.y, v2.y, h1.y)) crossings++;
					}
		expect(crossings).toBe(0);
	});

	it('seats the looping sibling next to the rail, not across it', () => {
		const g = layoutDag(REAL_IDS, REAL_EDGES);
		const tools = g.nodes.find((n) => n.id === 'tools')!;
		const end = g.nodes.find((n) => n.id === '__end__')!;
		expect(tools.x).toBeGreaterThan(end.x);
	});

	it('grows an expanded group without touching anything pure', () => {
		const ids = Object.freeze([...REAL_IDS]) as unknown as string[];
		const edges = Object.freeze(
			REAL_EDGES.map((e) => Object.freeze({ ...e }))
		) as unknown as EdgeIn[];
		const closed = layoutDag(ids, edges);
		const opened = layoutDag(ids, edges, { expanded: [AFTER_GROUP] });
		const was = closed.nodes.find((n) => n.id === AFTER_GROUP)!;
		const now = opened.nodes.find((n) => n.id === AFTER_GROUP)!;
		expect(now.h).toBeGreaterThan(was.h);
		expect(now.members).toEqual(was.members);
		// The other group stays slim.
		expect(opened.nodes.find((n) => n.id === BEFORE_GROUP)!.h).toBe(was.h);
	});

	it('is deterministic for a fixed input', () => {
		const a = layoutDag(REAL_IDS, REAL_EDGES, { expanded: [BEFORE_GROUP] });
		const b = layoutDag(REAL_IDS, REAL_EDGES, { expanded: [BEFORE_GROUP] });
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});
});

describe('classify', () => {
	it('names the species the drawing colours by', () => {
		expect(classify('model_request')).toBe('model');
		expect(classify('tools')).toBe('tool');
		expect(classify('__start__')).toBe('terminal');
		expect(classify('SkillsMiddleware.before_agent')).toBe('middleware');
		expect(classify('critic:model_request')).toBe('subagent');
		expect(classify('summarize')).toBe('plain');
	});
});

describe('hookOf', () => {
	it('reads the phase out of a hook name, and nothing out of a node', () => {
		expect(hookOf('SkillsMiddleware.before_agent')).toBe('before_agent');
		expect(hookOf('HumanInTheLoopMiddleware.after_model')).toBe('after_model');
		expect(hookOf('model_request')).toBeNull();
	});
});

describe('roundedPath', () => {
	it('draws a straight segment with no corner', () => {
		const d = roundedPath([
			{ x: 10, y: 0 },
			{ x: 10, y: 40 }
		]);
		expect(d).toBe('M 10 0 L 10 40');
	});

	it('rounds every interior corner exactly once', () => {
		const d = roundedPath([
			{ x: 0, y: 0 },
			{ x: 0, y: 20 },
			{ x: 30, y: 20 },
			{ x: 30, y: 50 }
		]);
		expect(d.startsWith('M 0 0')).toBe(true);
		expect(d.match(/Q/g)).toHaveLength(2);
		expect(d.endsWith('L 30 50')).toBe(true);
	});
});
