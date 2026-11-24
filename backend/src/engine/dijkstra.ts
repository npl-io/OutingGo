import type { Graph } from './graph';
import { MinHeap } from './minHeap';

export interface ShortestTimesResult {
  /** times[i] belongs to targets[i]; Infinity when unreachable. */
  times: Float64Array;
  /** -1 for the source and for nodes never reached; null unless requested. */
  parents: Int32Array | null;
  /** Number of nodes settled. */
  settled: number;
}

/**
 * Single-source Dijkstra with a binary heap and lazy deletion. Stops as soon
 * as every distinct target node is settled; unreachable targets stay Infinity.
 * @throws RangeError when the source or a target is outside [0, nodeCount).
 */
export function shortestTimes(
  graph: Graph,
  source: number,
  targets: ArrayLike<number>,
  options?: { withParents?: boolean },
): ShortestTimesResult {
  const n = graph.nodeCount;
  if (!Number.isInteger(source) || source < 0 || source >= n) {
    throw new RangeError(`shortestTimes: source ${source} is outside [0, ${n})`);
  }
  const isTarget = new Uint8Array(n);
  let remaining = 0;
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]!;
    if (!Number.isInteger(t) || t < 0 || t >= n) {
      throw new RangeError(`shortestTimes: target ${t} is outside [0, ${n})`);
    }
    if (isTarget[t] === 0) {
      isTarget[t] = 1;
      remaining += 1;
    }
  }

  const times = new Float64Array(targets.length).fill(Infinity);
  const parents = options?.withParents === true ? new Int32Array(n).fill(-1) : null;
  if (targets.length === 0) {
    return { times, parents, settled: 0 };
  }

  const { offsets, targets: edgeTargets, weights } = graph;
  const dist = new Float64Array(n).fill(Infinity);
  const heap = new MinHeap();
  dist[source] = 0;
  heap.push(0, source);
  let settled = 0;

  while (heap.size > 0) {
    const u = heap.pop();
    const d = heap.lastKey;
    if (d > dist[u]!) {
      continue;
    }
    settled += 1;
    if (isTarget[u] === 1) {
      isTarget[u] = 0;
      remaining -= 1;
      if (remaining === 0) {
        break;
      }
    }
    const end = offsets[u + 1]!;
    for (let e = offsets[u]!; e < end; e += 1) {
      const v = edgeTargets[e]!;
      const nd = d + weights[e]!;
      if (nd < dist[v]!) {
        dist[v] = nd;
        if (parents !== null) {
          parents[v] = u;
        }
        heap.push(nd, v);
      }
    }
  }

  for (let i = 0; i < targets.length; i += 1) {
    times[i] = dist[targets[i]!]!;
  }
  return { times, parents, settled };
}

/**
 * Rebuilds the node path from source to target using a parents array.
 * Returns [source] when they are equal and [] when the target was not reached.
 */
export function reconstructPath(parents: Int32Array, source: number, target: number): number[] {
  if (source === target) {
    return [source];
  }
  if (target < 0 || target >= parents.length || parents[target] === -1) {
    return [];
  }
  const reversed: number[] = [target];
  let current = target;
  for (let step = 0; step <= parents.length; step += 1) {
    const parent = parents[current]!;
    if (parent === -1) {
      return [];
    }
    reversed.push(parent);
    if (parent === source) {
      return reversed.reverse();
    }
    current = parent;
  }
  return [];
}
