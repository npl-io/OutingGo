import { describe, it, expect } from 'vitest';
import { buildGraph, type Graph } from '../../src/engine/graph';
import { reconstructPath, shortestTimes } from '../../src/engine/dijkstra';

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

function makeGraph(n: number, edges: Edge[]): Graph {
  return buildGraph(new Array<number>(n).fill(0), new Array<number>(n).fill(0), edges);
}

function randomEdges(seed: number, n: number): Edge[] {
  const rng = mulberry32(seed);
  const edges: Edge[] = [];
  for (let i = 0; i < n * 3; i += 1) {
    edges.push({
      from: Math.floor(rng() * n),
      to: Math.floor(rng() * n),
      seconds: Math.floor(rng() * 51),
    });
  }
  // Guarantee parallel edges in a deterministic subset of the random graphs.
  if (seed % 3 === 0 && edges.length > 0) {
    const base = edges[0]!;
    edges.push({ from: base.from, to: base.to, seconds: (base.seconds + 17) % 51 });
    edges.push({ from: base.from, to: base.to, seconds: (base.seconds + 29) % 51 });
  }
  return edges;
}

function allNodes(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function bellmanFord(n: number, edges: Edge[], source: number): number[] {
  const dist = new Array<number>(n).fill(Infinity);
  dist[source] = 0;
  for (let round = 0; round < n; round += 1) {
    let changed = false;
    for (const e of edges) {
      if (dist[e.from]! + e.seconds < dist[e.to]!) {
        dist[e.to] = dist[e.from]! + e.seconds;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return dist;
}

const EXAMPLE: Edge[] = [
  { from: 0, to: 1, seconds: 5 },
  { from: 0, to: 2, seconds: 9 },
  { from: 1, to: 2, seconds: 2 },
  { from: 2, to: 3, seconds: 4 },
];

describe('shortestTimes', () => {
  it('computes known distances on the example graph', () => {
    const graph = makeGraph(4, EXAMPLE);
    const result = shortestTimes(graph, 0, [0, 1, 2, 3]);
    expect(Array.from(result.times)).toEqual([0, 5, 7, 11]);
    expect(result.parents).toBeNull();
  });

  it('prefers a two-hop path when the direct edge is longer', () => {
    const graph = makeGraph(3, [
      { from: 0, to: 2, seconds: 100 },
      { from: 0, to: 1, seconds: 10 },
      { from: 1, to: 2, seconds: 10 },
    ]);
    expect(Array.from(shortestTimes(graph, 0, [2]).times)).toEqual([20]);
  });

  it('respects one-way edges', () => {
    const graph = makeGraph(2, [{ from: 0, to: 1, seconds: 3 }]);
    expect(Array.from(shortestTimes(graph, 0, [1]).times)).toEqual([3]);
    expect(Array.from(shortestTimes(graph, 1, [0]).times)).toEqual([Infinity]);
  });

  it('returns Infinity for an unreachable target', () => {
    const graph = makeGraph(3, [{ from: 0, to: 1, seconds: 3 }]);
    expect(Array.from(shortestTimes(graph, 0, [1, 2]).times)).toEqual([3, Infinity]);
  });

  it('returns 0 when the source equals the target', () => {
    const graph = makeGraph(4, EXAMPLE);
    const result = shortestTimes(graph, 2, [2]);
    expect(Array.from(result.times)).toEqual([0]);
    expect(result.settled).toBe(1);
  });

  it('handles several targets including duplicates and the source', () => {
    const graph = makeGraph(4, EXAMPLE);
    const result = shortestTimes(graph, 0, [3, 1, 3, 0, 2]);
    expect(Array.from(result.times)).toEqual([11, 5, 11, 0, 7]);
  });

  it('returns immediately for empty targets', () => {
    const graph = makeGraph(4, EXAMPLE);
    const result = shortestTimes(graph, 0, [], { withParents: true });
    expect(result.times.length).toBe(0);
    expect(result.settled).toBe(0);
    expect(result.parents).not.toBeNull();
  });

  it('stops early on a long chain and matches a full run', () => {
    const n = 1000;
    const edges: Edge[] = [];
    for (let i = 0; i + 1 < n; i += 1) edges.push({ from: i, to: i + 1, seconds: 1 });
    const graph = makeGraph(n, edges);
    const early = shortestTimes(graph, 0, [5]);
    const full = shortestTimes(graph, 0, allNodes(n));
    expect(early.times[0]).toBe(5);
    expect(early.times[0]).toBe(full.times[5]);
    expect(early.settled).toBeLessThan(20);
    expect(full.settled).toBe(n);
  });

  it('gives the same times for a target subset as for all nodes as targets', () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const n = 50;
      const graph = makeGraph(n, randomEdges(seed, n));
      const full = shortestTimes(graph, 0, allNodes(n));
      const subset = [3, 17, 17, 42, 0, 29];
      const part = shortestTimes(graph, 0, subset);
      subset.forEach((node, i) => {
        expect(part.times[i]).toBe(full.times[node]);
      });
    }
  });

  it('matches a Bellman-Ford oracle on 20 random graphs', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = mulberry32(seed * 7919);
      const n = 30 + Math.floor(rng() * 31);
      const edges = randomEdges(seed, n);
      const graph = makeGraph(n, edges);
      const source = Math.floor(rng() * n);
      const expected = bellmanFord(n, edges, source);
      const actual = shortestTimes(graph, source, allNodes(n));
      expect(Array.from(actual.times)).toEqual(expected);
    }
  });

  it('handles a 200,000-node chain', () => {
    const n = 200_000;
    const edges: Edge[] = [];
    for (let i = 0; i + 1 < n; i += 1) edges.push({ from: i, to: i + 1, seconds: 1 });
    const graph = makeGraph(n, edges);
    const result = shortestTimes(graph, 0, [n - 1], { withParents: true });
    expect(result.times[0]).toBe(199_999);
    expect(reconstructPath(result.parents!, 0, n - 1).length).toBe(n);
  });

  it('throws RangeError for a source or target outside the graph', () => {
    const graph = makeGraph(4, EXAMPLE);
    expect(() => shortestTimes(graph, 4, [0])).toThrow(RangeError);
    expect(() => shortestTimes(graph, -1, [0])).toThrow(RangeError);
    expect(() => shortestTimes(graph, 0, [4])).toThrow(RangeError);
    expect(() => shortestTimes(graph, 0, [-1])).toThrow(RangeError);
  });
});

describe('reconstructPath', () => {
  it('rebuilds paths whose weights sum to the reported time', () => {
    const n = 60;
    const edges = randomEdges(99, n);
    const graph = makeGraph(n, edges);
    const source = 0;
    const result = shortestTimes(graph, source, allNodes(n), { withParents: true });
    const parents = result.parents!;
    let checked = 0;
    for (let target = 0; target < n; target += 1) {
      const path = reconstructPath(parents, source, target);
      const time = result.times[target]!;
      if (time === Infinity) {
        expect(path).toEqual([]);
        continue;
      }
      checked += 1;
      expect(path[0]).toBe(source);
      expect(path[path.length - 1]).toBe(target);
      let sum = 0;
      for (let i = 0; i + 1 < path.length; i += 1) {
        const weights = edges
          .filter((e) => e.from === path[i] && e.to === path[i + 1])
          .map((e) => e.seconds);
        expect(weights.length).toBeGreaterThan(0);
        sum += Math.min(...weights);
      }
      expect(sum).toBe(time);
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('returns [] for an unreachable target and [source] for source == target', () => {
    const graph = makeGraph(3, [{ from: 0, to: 1, seconds: 3 }]);
    const result = shortestTimes(graph, 0, [0, 1, 2], { withParents: true });
    const parents = result.parents!;
    expect(reconstructPath(parents, 0, 2)).toEqual([]);
    expect(reconstructPath(parents, 0, 0)).toEqual([0]);
    expect(reconstructPath(parents, 0, 1)).toEqual([0, 1]);
  });

  it('does not loop forever on a corrupt parents array', () => {
    const parents = Int32Array.from([-1, 2, 1]);
    expect(reconstructPath(parents, 0, 2)).toEqual([]);
  });
});
