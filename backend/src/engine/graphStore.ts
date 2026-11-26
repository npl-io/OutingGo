import fs from 'fs';
import path from 'path';
import { MAX_SNAP_M, OFF_ROAD_KPH } from './config';
import { EngineError } from './errors';
import type { Graph } from './graph';
import { deserializeGraph } from './graphFile';
import { KdTree } from './kdTree';

const BYTES_PER_MB = 1024 * 1024;
const KPH_TO_MPS = 1 / 3.6;

/** A loaded graph plus a KD-tree over its nodes, used to snap coordinates. */
export interface GraphStore {
  graph: Graph;
  nodeTree: KdTree;
}

export interface SnapResult {
  node: number;
  distanceM: number;
  /** Time to cover distanceM at OFF_ROAD_KPH. */
  offRoadSeconds: number;
}

/** Builds the node KD-tree for a graph. */
export function createGraphStore(graph: Graph): GraphStore {
  return { graph, nodeTree: new KdTree(graph.lat, graph.lng) };
}

/**
 * Reads a graph file (relative paths resolve against process.cwd()) and logs
 * one line with its size, load time and memory use.
 * @throws EngineError GRAPH_NOT_LOADED when the file is missing,
 * INVALID_GRAPH_FILE when it is corrupt.
 */
export function loadGraphStore(filePath: string): GraphStore {
  const absolute = path.resolve(process.cwd(), filePath);
  const started = performance.now();
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(absolute);
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      throw new EngineError(
        'GRAPH_NOT_LOADED',
        `Graph file not found at ${absolute}; run npm run build:graph`,
      );
    }
    throw err;
  }
  const store = createGraphStore(deserializeGraph(buffer));
  const elapsedMs = Math.round(performance.now() - started);
  const memory = process.memoryUsage();
  console.log(
    `Graph loaded: ${store.graph.nodeCount} nodes, ${store.graph.edgeCount} edges, ` +
      `${elapsedMs} ms, heap ${Math.round(memory.heapUsed / BYTES_PER_MB)} MB, ` +
      `rss ${Math.round(memory.rss / BYTES_PER_MB)} MB`,
  );
  return store;
}

/**
 * Finds the nearest graph node. Returns null when the graph has no nodes or the
 * nearest node is farther than maxSnapM.
 */
export function snapToGraph(
  store: GraphStore,
  lat: number,
  lng: number,
  maxSnapM: number = MAX_SNAP_M,
): SnapResult | null {
  const nearest = store.nodeTree.nearest(lat, lng);
  if (nearest === null || nearest.distanceM > maxSnapM) {
    return null;
  }
  return {
    node: nearest.index,
    distanceM: nearest.distanceM,
    offRoadSeconds: nearest.distanceM / (OFF_ROAD_KPH * KPH_TO_MPS),
  };
}

let current: GraphStore | null = null;

/** Sets (or clears with null) the process-wide graph store. */
export function setGraphStore(store: GraphStore | null): void {
  current = store;
}

/** @throws EngineError GRAPH_NOT_LOADED when no store has been set. */
export function getGraphStore(): GraphStore {
  if (current === null) {
    throw new EngineError('GRAPH_NOT_LOADED', 'The road graph has not been loaded');
  }
  return current;
}
