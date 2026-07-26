import { describe, it, expect } from 'vitest';
import { layoutDag } from './layout';

/**
 * The layout is a pure function, which is the whole reason it exists as its
 * own module — the graph drawing's geometry can be pinned down without a DOM.
 */
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
		// A chain is one node wide and never wider.
		expect(g.width).toBe(g.nodes[0].w);
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
});
