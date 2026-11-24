import type { Graph } from './graph';

/**
 * Strongly connected components of a directed CSR graph (iterative Tarjan, so
 * graphs with hundreds of thousands of nodes cannot overflow the call stack).
 * componentOf[v] is the component id of node v; sizes[c] its node count.
 */
export function stronglyConnectedComponents(
  graph: Pick<Graph, 'nodeCount' | 'offsets' | 'targets'>,
): { componentOf: Uint32Array; componentCount: number; sizes: Uint32Array } {
  const n = graph.nodeCount;
  const { offsets, targets } = graph;
  const UNVISITED = -1;

  const index = new Int32Array(n).fill(UNVISITED);
  const lowlink = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const componentOf = new Uint32Array(n);
  const sizeList: number[] = [];

  const tarjanStack = new Uint32Array(n);
  let tarjanTop = 0;
  const frameNode = new Uint32Array(n);
  const frameCursor = new Uint32Array(n);
  let nextIndex = 0;

  for (let root = 0; root < n; root += 1) {
    if (index[root] !== UNVISITED) continue;

    index[root] = nextIndex;
    lowlink[root] = nextIndex;
    nextIndex += 1;
    tarjanStack[tarjanTop] = root;
    tarjanTop += 1;
    onStack[root] = 1;
    frameNode[0] = root;
    frameCursor[0] = offsets[root]!;
    let frameTop = 1;

    while (frameTop > 0) {
      const v = frameNode[frameTop - 1]!;
      const cursor = frameCursor[frameTop - 1]!;

      if (cursor < offsets[v + 1]!) {
        frameCursor[frameTop - 1] = cursor + 1;
        const w = targets[cursor]!;
        if (index[w] === UNVISITED) {
          index[w] = nextIndex;
          lowlink[w] = nextIndex;
          nextIndex += 1;
          tarjanStack[tarjanTop] = w;
          tarjanTop += 1;
          onStack[w] = 1;
          frameNode[frameTop] = w;
          frameCursor[frameTop] = offsets[w]!;
          frameTop += 1;
        } else if (onStack[w] === 1 && index[w]! < lowlink[v]!) {
          lowlink[v] = index[w]!;
        }
        continue;
      }

      // All edges of v are processed: close its frame.
      if (lowlink[v] === index[v]) {
        const id = sizeList.length;
        let size = 0;
        let w: number;
        do {
          tarjanTop -= 1;
          w = tarjanStack[tarjanTop]!;
          onStack[w] = 0;
          componentOf[w] = id;
          size += 1;
        } while (w !== v);
        sizeList.push(size);
      }
      frameTop -= 1;
      if (frameTop > 0) {
        const parent = frameNode[frameTop - 1]!;
        if (lowlink[v]! < lowlink[parent]!) lowlink[parent] = lowlink[v]!;
      }
    }
  }

  return {
    componentOf,
    componentCount: sizeList.length,
    sizes: Uint32Array.from(sizeList),
  };
}

/**
 * Restricts the graph to its largest strongly connected component (ties: the
 * component containing the smallest node id). Kept nodes are renumbered in
 * ascending old-id order; edges with an endpoint outside the component are
 * dropped and each source keeps its edge order. keptNodes[newId] is the old id.
 */
export function largestComponentSubgraph(graph: Graph): {
  graph: Graph;
  keptNodes: Uint32Array;
} {
  const n = graph.nodeCount;
  if (n === 0) {
    return {
      graph: {
        nodeCount: 0,
        edgeCount: 0,
        offsets: new Uint32Array(1),
        targets: new Uint32Array(0),
        weights: new Float32Array(0),
        lat: new Float64Array(0),
        lng: new Float64Array(0),
      },
      keptNodes: new Uint32Array(0),
    };
  }

  const { componentOf, sizes } = stronglyConnectedComponents(graph);
  let best = componentOf[0]!;
  for (let v = 1; v < n; v += 1) {
    const c = componentOf[v]!;
    if (sizes[c]! > sizes[best]!) best = c;
  }

  const keptCount = sizes[best]!;
  const keptNodes = new Uint32Array(keptCount);
  const newId = new Int32Array(n).fill(-1);
  let k = 0;
  for (let v = 0; v < n; v += 1) {
    if (componentOf[v] === best) {
      keptNodes[k] = v;
      newId[v] = k;
      k += 1;
    }
  }

  const offsets = new Uint32Array(keptCount + 1);
  let edgeCount = 0;
  for (let i = 0; i < keptCount; i += 1) {
    const old = keptNodes[i]!;
    for (let e = graph.offsets[old]!; e < graph.offsets[old + 1]!; e += 1) {
      if (newId[graph.targets[e]!]! >= 0) edgeCount += 1;
    }
    offsets[i + 1] = edgeCount;
  }

  const targets = new Uint32Array(edgeCount);
  const weights = new Float32Array(edgeCount);
  const lat = new Float64Array(keptCount);
  const lng = new Float64Array(keptCount);
  let slot = 0;
  for (let i = 0; i < keptCount; i += 1) {
    const old = keptNodes[i]!;
    lat[i] = graph.lat[old]!;
    lng[i] = graph.lng[old]!;
    for (let e = graph.offsets[old]!; e < graph.offsets[old + 1]!; e += 1) {
      const t = newId[graph.targets[e]!]!;
      if (t >= 0) {
        targets[slot] = t;
        weights[slot] = graph.weights[e]!;
        slot += 1;
      }
    }
  }

  return {
    graph: { nodeCount: keptCount, edgeCount, offsets, targets, weights, lat, lng },
    keptNodes,
  };
}
