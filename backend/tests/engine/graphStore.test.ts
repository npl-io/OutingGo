import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGraph } from '../../src/engine/graph';
import { serializeGraph } from '../../src/engine/graphFile';
import {
  createGraphStore,
  getGraphStore,
  loadGraphStore,
  setGraphStore,
  snapToGraph,
} from '../../src/engine/graphStore';
import { EngineError } from '../../src/engine/errors';
import { catchError, gridNodeId, gridPoint, makeGridGraph } from './helpers/gridGraph';

const METERS_PER_DEGREE_LAT = 111195.08;
const OFF_ROAD_MPS = 15 / 3.6;

const tempFile = path.join(os.tmpdir(), `graphstore-${process.pid}-${Date.now()}.bin`);

afterEach(() => {
  setGraphStore(null);
  vi.restoreAllMocks();
  fs.rmSync(tempFile, { force: true });
});

describe('createGraphStore and snapToGraph', () => {
  const store = createGraphStore(makeGridGraph(10, 10));

  it('builds a node tree over the graph', () => {
    expect(store.graph.nodeCount).toBe(100);
    const p = gridPoint(3, 4);
    expect(store.nodeTree.nearest(p.lat, p.lng)?.index).toBe(gridNodeId(3, 4, 10));
  });

  it('snaps a point on a node to that node at distance 0', () => {
    const p = gridPoint(2, 7);
    const snap = snapToGraph(store, p.lat, p.lng);
    expect(snap?.node).toBe(gridNodeId(2, 7, 10));
    expect(snap?.distanceM).toBeCloseTo(0, 3);
    expect(snap?.offRoadSeconds).toBeCloseTo(0, 3);
  });

  it('snaps a point 200 m off and converts the distance to off-road seconds', () => {
    const p = gridPoint(0, 0);
    const snap = snapToGraph(store, p.lat - 200 / METERS_PER_DEGREE_LAT, p.lng);
    expect(snap?.node).toBe(0);
    expect(snap?.distanceM).toBeCloseTo(200, 0);
    expect(Math.abs(snap!.offRoadSeconds - snap!.distanceM / OFF_ROAD_MPS)).toBeLessThan(1e-6);
  });

  it('returns null beyond the maximum snap distance', () => {
    const p = gridPoint(0, 0);
    expect(snapToGraph(store, p.lat - 600 / METERS_PER_DEGREE_LAT, p.lng)).toBeNull();
    expect(snapToGraph(store, p.lat - 200 / METERS_PER_DEGREE_LAT, p.lng, 100)).toBeNull();
  });

  it('returns null for an empty graph', () => {
    const empty = createGraphStore(buildGraph([], [], []));
    expect(snapToGraph(empty, 10.8, 106.7)).toBeNull();
  });
});

describe('graph store singleton', () => {
  it('throws GRAPH_NOT_LOADED before it is set and works after', () => {
    const error = catchError(() => getGraphStore());
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe('GRAPH_NOT_LOADED');

    const store = createGraphStore(makeGridGraph(2, 2));
    setGraphStore(store);
    expect(getGraphStore()).toBe(store);
  });
});

describe('loadGraphStore', () => {
  it('round-trips a graph through a file and logs one line', () => {
    const graph = makeGridGraph(4, 5);
    fs.writeFileSync(tempFile, serializeGraph(graph));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const store = loadGraphStore(tempFile);

    expect(log).toHaveBeenCalledTimes(1);
    expect(store.graph.nodeCount).toBe(graph.nodeCount);
    expect(store.graph.edgeCount).toBe(graph.edgeCount);
    expect(Array.from(store.graph.weights)).toEqual(Array.from(graph.weights));
    expect(Array.from(store.graph.lat)).toEqual(Array.from(graph.lat));
    const p = gridPoint(2, 3);
    expect(store.nodeTree.nearest(p.lat, p.lng)?.index).toBe(gridNodeId(2, 3, 5));
  });

  it('throws GRAPH_NOT_LOADED naming the path when the file is missing', () => {
    const error = catchError(() => loadGraphStore(tempFile));
    expect(error).toBeInstanceOf(EngineError);
    const engineError = error as EngineError;
    expect(engineError.code).toBe('GRAPH_NOT_LOADED');
    expect(engineError.message).toContain(path.resolve(tempFile));
    expect(engineError.message).toContain('run npm run build:graph');
  });

  it('throws INVALID_GRAPH_FILE for a corrupted file', () => {
    const bytes = serializeGraph(makeGridGraph(3, 3));
    fs.writeFileSync(tempFile, bytes.subarray(0, bytes.length - 5));
    const error = catchError(() => loadGraphStore(tempFile));
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe('INVALID_GRAPH_FILE');
  });
});
