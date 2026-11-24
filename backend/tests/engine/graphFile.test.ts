import { describe, it, expect } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { buildGraph, type Graph } from '../../src/engine/graph';
import { deserializeGraph, serializeGraph } from '../../src/engine/graphFile';

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

function randomGraph(seed: number, n: number, m: number): Graph {
  const rng = mulberry32(seed);
  const lat: number[] = [];
  const lng: number[] = [];
  for (let i = 0; i < n; i += 1) {
    lat.push(10 + rng());
    lng.push(106 + rng());
  }
  const edges: { from: number; to: number; seconds: number }[] = [];
  for (let i = 0; i < m; i += 1) {
    edges.push({
      from: Math.floor(rng() * n),
      to: Math.floor(rng() * n),
      seconds: rng() * 500,
    });
  }
  return buildGraph(lat, lng, edges);
}

function expectSameGraph(actual: Graph, expected: Graph): void {
  expect(actual.nodeCount).toBe(expected.nodeCount);
  expect(actual.edgeCount).toBe(expected.edgeCount);
  expect(Array.from(actual.offsets)).toEqual(Array.from(expected.offsets));
  expect(Array.from(actual.targets)).toEqual(Array.from(expected.targets));
  expect(Array.from(actual.weights)).toEqual(Array.from(expected.weights));
  expect(Array.from(actual.lat)).toEqual(Array.from(expected.lat));
  expect(Array.from(actual.lng)).toEqual(Array.from(expected.lng));
}

function expectInvalid(buffer: Buffer): void {
  try {
    deserializeGraph(buffer);
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe('INVALID_GRAPH_FILE');
    return;
  }
  throw new Error('expected deserializeGraph to throw');
}

/** Byte positions for a graph, mirroring the documented layout. */
function positions(graph: Graph): {
  offsets: number;
  targets: number;
  weights: number;
  lat: number;
} {
  const n = graph.nodeCount;
  const m = graph.edgeCount;
  const offsets = 16;
  const targets = offsets + (n + 1) * 4;
  const weights = targets + m * 4;
  const lat = Math.ceil((weights + m * 4) / 8) * 8;
  return { offsets, targets, weights, lat };
}

const SAMPLE = randomGraph(5, 6, 14);

describe('serializeGraph / deserializeGraph', () => {
  it('round-trips a random graph', () => {
    const graph = randomGraph(1, 50, 200);
    expectSameGraph(deserializeGraph(serializeGraph(graph)), graph);
  });

  it('round-trips an empty graph', () => {
    const graph = buildGraph([], [], []);
    const buffer = serializeGraph(graph);
    expect(buffer.length).toBe(20 + 4);
    expectSameGraph(deserializeGraph(buffer), graph);
  });

  it('round-trips graphs with an odd and an even node count', () => {
    for (const [n, m] of [
      [3, 0],
      [3, 5],
      [4, 0],
      [5, 7],
      [1, 1],
    ] as [number, number][]) {
      const graph = randomGraph(n * 10 + m, n, m);
      const buffer = serializeGraph(graph);
      expect(positions(graph).lat % 8).toBe(0);
      expectSameGraph(deserializeGraph(buffer), graph);
    }
  });

  it('writes the OGRF magic, version 1 and the counts', () => {
    const buffer = serializeGraph(SAMPLE);
    expect(buffer.toString('ascii', 0, 4)).toBe('OGRF');
    expect(buffer.readUInt32LE(4)).toBe(1);
    expect(buffer.readUInt32LE(8)).toBe(SAMPLE.nodeCount);
    expect(buffer.readUInt32LE(12)).toBe(SAMPLE.edgeCount);
  });

  it('rejects a truncated header', () => {
    expectInvalid(serializeGraph(SAMPLE).subarray(0, 15));
    expectInvalid(Buffer.alloc(0));
  });

  it('rejects a wrong magic', () => {
    const buffer = serializeGraph(SAMPLE);
    buffer.write('XGRF', 0, 'ascii');
    expectInvalid(buffer);
  });

  it('rejects a wrong version', () => {
    const buffer = serializeGraph(SAMPLE);
    buffer.writeUInt32LE(2, 4);
    expectInvalid(buffer);
  });

  it('rejects an extra trailing byte and a missing byte', () => {
    const buffer = serializeGraph(SAMPLE);
    expectInvalid(Buffer.concat([buffer, Buffer.from([0])]));
    expectInvalid(buffer.subarray(0, buffer.length - 1));
  });

  it('rejects non-monotonic offsets', () => {
    const buffer = serializeGraph(SAMPLE);
    const at = positions(SAMPLE).offsets;
    buffer.writeUInt32LE(buffer.readUInt32LE(at + 3 * 4) + 1, at + 2 * 4);
    expectInvalid(buffer);
  });

  it('rejects offsets[0] != 0', () => {
    const buffer = serializeGraph(SAMPLE);
    buffer.writeUInt32LE(1, positions(SAMPLE).offsets);
    expectInvalid(buffer);
  });

  it('rejects offsets[n] != m', () => {
    const buffer = serializeGraph(SAMPLE);
    buffer.writeUInt32LE(SAMPLE.edgeCount + 1, positions(SAMPLE).offsets + SAMPLE.nodeCount * 4);
    expectInvalid(buffer);
  });

  it('rejects a target out of range', () => {
    const buffer = serializeGraph(SAMPLE);
    buffer.writeUInt32LE(SAMPLE.nodeCount, positions(SAMPLE).targets);
    expectInvalid(buffer);
  });

  it('rejects a NaN or negative weight', () => {
    const nan = serializeGraph(SAMPLE);
    nan.writeFloatLE(Number.NaN, positions(SAMPLE).weights);
    expectInvalid(nan);

    const negative = serializeGraph(SAMPLE);
    negative.writeFloatLE(-1, positions(SAMPLE).weights);
    expectInvalid(negative);
  });

  it('rejects a NaN lat', () => {
    const buffer = serializeGraph(SAMPLE);
    buffer.writeDoubleLE(Number.NaN, positions(SAMPLE).lat);
    expectInvalid(buffer);
  });

  it('returns arrays independent of the input buffer', () => {
    const buffer = serializeGraph(SAMPLE);
    const graph = deserializeGraph(buffer);
    const snapshot = deserializeGraph(Buffer.from(buffer));
    buffer.fill(0xff);
    expectSameGraph(graph, snapshot);
    expect(graph.lat.byteOffset % 8).toBe(0);
    expect(graph.lng.byteOffset % 8).toBe(0);
    expect(graph.offsets.buffer).not.toBe(buffer.buffer);
  });
});
