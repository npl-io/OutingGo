/** Road graph in compressed sparse row (CSR) layout. Weights are travel seconds. */
export interface Graph {
  nodeCount: number;
  edgeCount: number;
  /** Length nodeCount + 1; edges of node u are at indices offsets[u] .. offsets[u + 1] - 1. */
  offsets: Uint32Array;
  targets: Uint32Array;
  weights: Float32Array;
  lat: Float64Array;
  lng: Float64Array;
}

/**
 * Builds a CSR graph from node coordinates and a plain edge list.
 * Edges are grouped by source with a stable counting sort, so edges of one
 * source keep their input order. Parallel edges and self-loops are kept.
 * @throws RangeError on mismatched lat/lng lengths, a node id outside [0, n),
 * or a seconds value that is not finite or is negative.
 */
export function buildGraph(
  lat: ArrayLike<number>,
  lng: ArrayLike<number>,
  edges: ReadonlyArray<{ from: number; to: number; seconds: number }>,
): Graph {
  if (lat.length !== lng.length) {
    throw new RangeError('buildGraph: lat and lng must have the same length');
  }
  const n = lat.length;
  const m = edges.length;

  const offsets = new Uint32Array(n + 1);
  for (const edge of edges) {
    if (!Number.isInteger(edge.from) || edge.from < 0 || edge.from >= n) {
      throw new RangeError(`buildGraph: edge source ${edge.from} is outside [0, ${n})`);
    }
    if (!Number.isInteger(edge.to) || edge.to < 0 || edge.to >= n) {
      throw new RangeError(`buildGraph: edge target ${edge.to} is outside [0, ${n})`);
    }
    if (!Number.isFinite(edge.seconds) || edge.seconds < 0) {
      throw new RangeError(`buildGraph: edge seconds ${edge.seconds} must be finite and >= 0`);
    }
    offsets[edge.from + 1]! += 1;
  }
  for (let i = 0; i < n; i += 1) {
    offsets[i + 1] = offsets[i + 1]! + offsets[i]!;
  }

  const targets = new Uint32Array(m);
  const weights = new Float32Array(m);
  const next = offsets.slice(0, n);
  for (const edge of edges) {
    const slot = next[edge.from]!;
    targets[slot] = edge.to;
    weights[slot] = edge.seconds;
    next[edge.from] = slot + 1;
  }

  return {
    nodeCount: n,
    edgeCount: m,
    offsets,
    targets,
    weights,
    lat: Float64Array.from(lat),
    lng: Float64Array.from(lng),
  };
}
