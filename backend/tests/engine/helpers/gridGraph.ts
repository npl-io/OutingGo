import { haversineMeters } from '../../../src/engine/geo';
import { buildGraph, type Graph } from '../../../src/engine/graph';

const LAT0 = 10.8;
const LNG0 = 106.7;
const LAT_STEP = 0.0045;
const LNG_STEP = 0.0046;
const GRID_SPEED_KPH = 30;

export interface GridCell {
  row: number;
  col: number;
}

export interface GridOptions {
  /** Multiplies the seconds of the directed edge a -> b (for example 0.1 for a fast corridor). */
  edgeMultiplier?: (a: GridCell, b: GridCell) => number;
  /** Nodes appended after the grid with no edges; their ids start at rows * cols. */
  extraNodes?: { lat: number; lng: number }[];
}

/** Coordinates of a grid node (about 500 m between neighbours). */
export function gridPoint(row: number, col: number): { lat: number; lng: number } {
  return { lat: LAT0 + row * LAT_STEP, lng: LNG0 + col * LNG_STEP };
}

/** Node id of a grid cell (row-major). */
export function gridNodeId(row: number, col: number, cols: number): number {
  return row * cols + col;
}

/** Builds a rows x cols grid with two directed edges between 4-neighbours. */
export function makeGridGraph(rows: number, cols: number, options: GridOptions = {}): Graph {
  const lat: number[] = [];
  const lng: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const p = gridPoint(r, c);
      lat.push(p.lat);
      lng.push(p.lng);
    }
  }
  for (const extra of options.extraNodes ?? []) {
    lat.push(extra.lat);
    lng.push(extra.lng);
  }

  const edges: { from: number; to: number; seconds: number }[] = [];
  const connect = (a: GridCell, b: GridCell): void => {
    const pa = gridPoint(a.row, a.col);
    const pb = gridPoint(b.row, b.col);
    const base = haversineMeters(pa.lat, pa.lng, pb.lat, pb.lng) / (GRID_SPEED_KPH / 3.6);
    const idA = gridNodeId(a.row, a.col, cols);
    const idB = gridNodeId(b.row, b.col, cols);
    edges.push({ from: idA, to: idB, seconds: base * (options.edgeMultiplier?.(a, b) ?? 1) });
    edges.push({ from: idB, to: idA, seconds: base * (options.edgeMultiplier?.(b, a) ?? 1) });
  };
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (c + 1 < cols) connect({ row: r, col: c }, { row: r, col: c + 1 });
      if (r + 1 < rows) connect({ row: r, col: c }, { row: r + 1, col: c });
    }
  }
  return buildGraph(lat, lng, edges);
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns the error thrown by fn, or undefined when it does not throw. */
export function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return undefined;
}
