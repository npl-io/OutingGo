import { describe, it, expect } from 'vitest';
import { buildGraph, type Graph } from '../../src/engine/graph';
import { shortestTimes } from '../../src/engine/dijkstra';
import { largestComponentSubgraph, stronglyConnectedComponents } from '../../src/engine/scc';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Edge {
  from: number;
  to: number;
  seconds: number;
}

function makeGraph(n: number, pairs: [number, number][], seconds = 1): Graph {
  const lat = Array.from({ length: n }, (_, i) => 10 + i * 0.001);
  const lng = Array.from({ length: n }, (_, i) => 106 + i * 0.002);
  return buildGraph(
    lat,
    lng,
    pairs.map(([from, to]) => ({ from, to, seconds })),
  );
}

function sortedSizes(sizes: Uint32Array): number[] {
  return Array.from(sizes).sort((a, b) => a - b);
}

/** Set of nodes reachable from start (iterative BFS). */
function reachable(graph: Graph, start: number): Set<number> {
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const u = queue[head]!;
    for (let e = graph.offsets[u]!; e < graph.offsets[u + 1]!; e += 1) {
      const v = graph.targets[e]!;
      if (!seen.has(v)) {
        seen.add(v);
        queue.push(v);
      }
    }
  }
  return seen;
}

describe('stronglyConnectedComponents', () => {
  it('treats a single cycle as one component', () => {
    const graph = makeGraph(4, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ]);
    const result = stronglyConnectedComponents(graph);
    expect(result.componentCount).toBe(1);
    expect(Array.from(result.sizes)).toEqual([4]);
    expect(new Set(result.componentOf).size).toBe(1);
  });

  it('splits off a dead-end spur', () => {
    const graph = makeGraph(4, [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [1, 3],
    ]);
    const result = stronglyConnectedComponents(graph);
    expect(result.componentCount).toBe(2);
    expect(result.componentOf[0]).toBe(result.componentOf[1]);
    expect(result.componentOf[1]).toBe(result.componentOf[2]);
    expect(result.componentOf[3]).not.toBe(result.componentOf[0]);
    expect(sortedSizes(result.sizes)).toEqual([1, 3]);

    const kept = largestComponentSubgraph(graph);
    expect(Array.from(kept.keptNodes)).toEqual([0, 1, 2]);
    expect(kept.graph.nodeCount).toBe(3);
    expect(kept.graph.edgeCount).toBe(4);
  });

  it('gives two components for two cycles joined by a one-way bridge', () => {
    const cycles: [number, number][] = [
      [1, 4],
      [4, 5],
      [5, 1],
      [0, 2],
      [2, 3],
      [3, 0],
    ];
    for (const bridge of [[4, 0], [0, 4]] as [number, number][]) {
      const graph = makeGraph(6, [...cycles, bridge]);
      expect(stronglyConnectedComponents(graph).componentCount).toBe(2);
      const kept = largestComponentSubgraph(graph);
      expect(Array.from(kept.keptNodes)).toEqual([0, 2, 3]);
    }
  });

  it('makes self-loops and isolated nodes singletons', () => {
    const graph = makeGraph(4, [
      [0, 0],
      [2, 3],
      [3, 2],
    ]);
    const result = stronglyConnectedComponents(graph);
    expect(result.componentCount).toBe(3);
    expect(sortedSizes(result.sizes)).toEqual([1, 1, 2]);
  });

  it('handles the empty graph', () => {
    const graph = buildGraph([], [], []);
    const result = stronglyConnectedComponents(graph);
    expect(result.componentCount).toBe(0);
    expect(result.componentOf.length).toBe(0);
    expect(result.sizes.length).toBe(0);

    const kept = largestComponentSubgraph(graph);
    expect(kept.graph.nodeCount).toBe(0);
    expect(kept.graph.edgeCount).toBe(0);
    expect(kept.graph.offsets.length).toBe(1);
    expect(kept.keptNodes.length).toBe(0);
  });

  it('handles a 200,000-node ring without overflowing the stack', () => {
    const n = 200_000;
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i += 1) pairs.push([i, (i + 1) % n]);
    const result = stronglyConnectedComponents(makeGraph(n, pairs));
    expect(result.componentCount).toBe(1);
    expect(result.sizes[0]).toBe(n);
  });

  it('gives 200,000 components for a 200,000-node chain', () => {
    const n = 200_000;
    const pairs: [number, number][] = [];
    for (let i = 0; i + 1 < n; i += 1) pairs.push([i, i + 1]);
    const result = stronglyConnectedComponents(makeGraph(n, pairs));
    expect(result.componentCount).toBe(n);
  });

  it('matches a mutual-reachability oracle on 30 random graphs', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = mulberry32(seed * 104729);
      const n = 1 + Math.floor(rng() * 40);
      const edgeTotal = Math.floor(rng() * n * 2.5);
      const pairs: [number, number][] = [];
      for (let i = 0; i < edgeTotal; i += 1) {
        pairs.push([Math.floor(rng() * n), Math.floor(rng() * n)]);
      }
      const graph = makeGraph(n, pairs);
      const result = stronglyConnectedComponents(graph);
      const reach = Array.from({ length: n }, (_, u) => reachable(graph, u));
      const classes = new Set<number>();
      for (let u = 0; u < n; u += 1) {
        classes.add(result.componentOf[u]!);
        for (let v = 0; v < n; v += 1) {
          const mutual = reach[u]!.has(v) && reach[v]!.has(u);
          expect(result.componentOf[u] === result.componentOf[v]).toBe(mutual);
        }
      }
      expect(result.componentCount).toBe(classes.size);
      expect(Array.from(result.sizes).reduce((a, b) => a + b, 0)).toBe(n);
    }
  });
});

describe('largestComponentSubgraph', () => {
  it('keeps nodes ascending, remaps ids and carries lat, lng and weights', () => {
    const lat = [10, 11, 12, 13, 14];
    const lng = [100, 101, 102, 103, 104];
    const edges: Edge[] = [
      { from: 1, to: 3, seconds: 7 },
      { from: 3, to: 4, seconds: 5 },
      { from: 4, to: 1, seconds: 3 },
      { from: 1, to: 0, seconds: 9 },
      { from: 0, to: 2, seconds: 9 },
      { from: 1, to: 4, seconds: 2 },
    ];
    const graph = buildGraph(lat, lng, edges);
    const kept = largestComponentSubgraph(graph);
    expect(Array.from(kept.keptNodes)).toEqual([1, 3, 4]);
    expect(Array.from(kept.graph.lat)).toEqual([11, 13, 14]);
    expect(Array.from(kept.graph.lng)).toEqual([101, 103, 104]);
    expect(kept.graph.nodeCount).toBe(3);
    expect(kept.graph.edgeCount).toBe(4);
    // old 1 -> [3 (7s), 4 (2s)], old 3 -> [4], old 4 -> [1]; source edge order is kept
    expect(Array.from(kept.graph.offsets)).toEqual([0, 2, 3, 4]);
    expect(Array.from(kept.graph.targets)).toEqual([1, 2, 2, 0]);
    expect(Array.from(kept.graph.weights)).toEqual([7, 2, 5, 3]);
  });

  it('keeps shortest times between kept nodes identical on a random graph', () => {
    const rng = mulberry32(2024);
    const n = 40;
    const edges: Edge[] = [];
    for (let i = 0; i < n * 3; i += 1) {
      edges.push({
        from: Math.floor(rng() * n),
        to: Math.floor(rng() * n),
        seconds: 1 + Math.floor(rng() * 50),
      });
    }
    const graph = buildGraph(new Array<number>(n).fill(0), new Array<number>(n).fill(0), edges);
    const kept = largestComponentSubgraph(graph);
    const k = kept.graph.nodeCount;
    expect(k).toBeGreaterThan(2);

    const newIds = Array.from({ length: k }, (_, i) => i);
    const oldIds = Array.from(kept.keptNodes);
    for (let i = 0; i < k; i += 1) {
      const before = shortestTimes(graph, oldIds[i]!, oldIds).times;
      const after = shortestTimes(kept.graph, i, newIds).times;
      expect(Array.from(after)).toEqual(Array.from(before));
    }
  });
});
