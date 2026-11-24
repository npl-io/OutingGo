import { describe, it, expect } from 'vitest';
import { buildGraph } from '../../src/engine/graph';

const LAT4 = [10, 10.1, 10.2, 10.3];
const LNG4 = [106, 106.1, 106.2, 106.3];

describe('buildGraph', () => {
  it('builds the CSR layout for the example graph', () => {
    const graph = buildGraph(LAT4, LNG4, [
      { from: 0, to: 1, seconds: 5 },
      { from: 0, to: 2, seconds: 9 },
      { from: 1, to: 2, seconds: 2 },
      { from: 2, to: 3, seconds: 4 },
    ]);
    expect(graph.nodeCount).toBe(4);
    expect(graph.edgeCount).toBe(4);
    expect(Array.from(graph.offsets)).toEqual([0, 2, 3, 4, 4]);
    expect(Array.from(graph.targets)).toEqual([1, 2, 2, 3]);
    expect(Array.from(graph.weights)).toEqual([5, 9, 2, 4]);
    expect(Array.from(graph.lat)).toEqual(LAT4);
    expect(Array.from(graph.lng)).toEqual(LNG4);
  });

  it('groups edges given out of order by source and keeps the input order per source', () => {
    const graph = buildGraph(LAT4, LNG4, [
      { from: 2, to: 3, seconds: 4 },
      { from: 0, to: 2, seconds: 9 },
      { from: 1, to: 2, seconds: 2 },
      { from: 0, to: 1, seconds: 5 },
    ]);
    expect(Array.from(graph.offsets)).toEqual([0, 2, 3, 4, 4]);
    expect(Array.from(graph.targets)).toEqual([2, 1, 2, 3]);
    expect(Array.from(graph.weights)).toEqual([9, 5, 2, 4]);
  });

  it('keeps parallel edges and self-loops', () => {
    const graph = buildGraph([0, 0], [0, 0], [
      { from: 0, to: 1, seconds: 7 },
      { from: 0, to: 1, seconds: 3 },
      { from: 1, to: 1, seconds: 1 },
    ]);
    expect(graph.edgeCount).toBe(3);
    expect(Array.from(graph.offsets)).toEqual([0, 2, 3]);
    expect(Array.from(graph.targets)).toEqual([1, 1, 1]);
    expect(Array.from(graph.weights)).toEqual([7, 3, 1]);
  });

  it('supports a node with no edges', () => {
    const graph = buildGraph([0, 0, 0], [0, 0, 0], [{ from: 0, to: 2, seconds: 1 }]);
    expect(Array.from(graph.offsets)).toEqual([0, 1, 1, 1]);
  });

  it('supports a graph with 0 nodes', () => {
    const graph = buildGraph([], [], []);
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
    expect(Array.from(graph.offsets)).toEqual([0]);
  });

  it('throws RangeError on invalid input', () => {
    expect(() => buildGraph([0, 0], [0, 0], [{ from: 0, to: 2, seconds: 1 }])).toThrow(RangeError);
    expect(() => buildGraph([0, 0], [0, 0], [{ from: -1, to: 1, seconds: 1 }])).toThrow(RangeError);
    expect(() => buildGraph([0, 0], [0, 0], [{ from: 0, to: 1.5, seconds: 1 }])).toThrow(RangeError);
    expect(() => buildGraph([0, 0], [0, 0], [{ from: 0, to: 1, seconds: -1 }])).toThrow(RangeError);
    expect(() => buildGraph([0, 0], [0, 0], [{ from: 0, to: 1, seconds: Number.NaN }])).toThrow(
      RangeError,
    );
    expect(() => buildGraph([0, 0], [0, 0], [{ from: 0, to: 1, seconds: Infinity }])).toThrow(
      RangeError,
    );
    expect(() => buildGraph([0, 0], [0], [])).toThrow(RangeError);
  });
});
