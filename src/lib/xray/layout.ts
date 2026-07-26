/**
 * A small layered layout for the compiled graph.
 *
 * Hand-rolled rather than imported, deliberately. The graphs here are tiny —
 * a deep agent compiles to a dozen-odd nodes — and every diagram library
 * brings its own fonts, its own colours and half a megabyte of generality for
 * shapes this app will never draw. A hundred lines that produce coordinates,
 * and nothing else, keeps the drawing in the app's own visual language and
 * keeps this file testable as a pure function.
 *
 * The algorithm is the classic recipe at its smallest: BFS layering from the
 * entry, a single barycenter pass to reduce crossings, then fixed spacing.
 * Cycles — and an agent loop IS a cycle — are handled by assigning each node
 * a layer only once; the edge that closes the loop simply travels backwards,
 * and the renderer draws it as an arc.
 */

export interface EdgeIn {
	from: string;
	to: string;
	conditional: boolean;
}

export interface LaidNode {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	layer: number;
}

export interface LaidEdge extends EdgeIn {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	/** True when the edge points to an earlier (or same) layer — a loop. */
	back: boolean;
}

export interface Layout {
	nodes: LaidNode[];
	edges: LaidEdge[];
	width: number;
	height: number;
}

export interface LayoutOptions {
	nodeWidth?: number;
	nodeHeight?: number;
	gapX?: number;
	gapY?: number;
}

export function layoutDag(ids: string[], edges: EdgeIn[], opts: LayoutOptions = {}): Layout {
	const { nodeWidth = 168, nodeHeight = 32, gapX = 20, gapY = 18 } = opts;
	if (!ids.length) return { nodes: [], edges: [], width: 0, height: 0 };

	const out = new Map<string, string[]>();
	const indeg = new Map<string, number>();
	for (const id of ids) {
		out.set(id, []);
		indeg.set(id, 0);
	}
	for (const e of edges) {
		if (!out.has(e.from) || !indeg.has(e.to)) continue;
		out.get(e.from)!.push(e.to);
		indeg.set(e.to, indeg.get(e.to)! + 1);
	}

	// Entry points: __start__ if present, else anything nothing points at,
	// else (fully cyclic graph) the first node — something has to be first.
	const start = ids.includes('__start__') ? ['__start__'] : ids.filter((id) => indeg.get(id) === 0);
	const roots = start.length ? start : [ids[0]];

	// First-assignment BFS. A node's layer is set the first time it is reached,
	// never raised afterwards — raising is what turns a cycle into an infinite
	// staircase.
	const layer = new Map<string, number>();
	const queue: string[] = [];
	for (const r of roots) {
		layer.set(r, 0);
		queue.push(r);
	}
	while (queue.length) {
		const n = queue.shift()!;
		for (const to of out.get(n) ?? []) {
			if (layer.has(to)) continue;
			layer.set(to, layer.get(n)! + 1);
			queue.push(to);
		}
	}
	// Anything unreachable parks after everything reachable, visible not lost.
	const deepest = Math.max(0, ...layer.values());
	for (const id of ids) if (!layer.has(id)) layer.set(id, deepest + 1);

	// __end__ reads better as the final column even when a short edge reaches
	// it early.
	if (layer.has('__end__')) layer.set('__end__', Math.max(...layer.values()));

	const columns = new Map<number, string[]>();
	for (const id of ids) {
		const l = layer.get(id)!;
		(columns.get(l) ?? columns.set(l, []).get(l)!).push(id);
	}

	// One barycenter pass: order each column by the average position of its
	// parents in the previous column. One pass is not optimal; on graphs this
	// size it is indistinguishable from optimal.
	const order = new Map<string, number>();
	const layersSorted = [...columns.keys()].sort((a, b) => a - b);
	for (const l of layersSorted) {
		const col = columns.get(l)!;
		if (l === layersSorted[0]) {
			col.forEach((id, i) => order.set(id, i));
			continue;
		}
		const parentsOf = (id: string) =>
			edges.filter((e) => e.to === id && order.has(e.from)).map((e) => order.get(e.from)!);
		col.sort((a, b) => {
			const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
			return avg(parentsOf(a)) - avg(parentsOf(b));
		});
		col.forEach((id, i) => order.set(id, i));
	}

	// Vertical flow: layers are rows, siblings sit side by side. An agent graph
	// is mostly a pipeline, and a pipeline drawn sideways is a scrollbar — drawn
	// downwards it is a column that fits the pane and reads top to bottom.
	const widest = Math.max(...[...columns.values()].map((c) => c.length));
	const width = widest * nodeWidth + (widest - 1) * gapX;

	const nodes: LaidNode[] = ids.map((id) => {
		const l = layer.get(id)!;
		const row = columns.get(l)!;
		const rowWidth = row.length * nodeWidth + (row.length - 1) * gapX;
		const x = (width - rowWidth) / 2 + order.get(id)! * (nodeWidth + gapX);
		return { id, x, y: l * (nodeHeight + gapY), w: nodeWidth, h: nodeHeight, layer: l };
	});

	const at = new Map(nodes.map((n) => [n.id, n]));
	const laidEdges: LaidEdge[] = edges
		.filter((e) => at.has(e.from) && at.has(e.to))
		.map((e) => {
			const a = at.get(e.from)!;
			const b = at.get(e.to)!;
			const back = b.layer <= a.layer;
			return back
				? // Loops leave the right side and re-enter the right side, so the
					// return path reads as a return path beside the pipeline.
					{
						...e,
						back,
						x1: a.x + a.w,
						y1: a.y + a.h / 2,
						x2: b.x + b.w,
						y2: b.y + b.h / 2
					}
				: {
						...e,
						back,
						x1: a.x + a.w / 2,
						y1: a.y + a.h,
						x2: b.x + b.w / 2,
						y2: b.y
					};
		});

	return {
		nodes,
		edges: laidEdges,
		width,
		height: (layersSorted.length - 1) * (nodeHeight + gapY) + nodeHeight
	};
}
