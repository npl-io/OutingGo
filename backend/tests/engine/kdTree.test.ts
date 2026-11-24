import { describe, it, expect } from 'vitest';
import { KdTree } from '../../src/engine/kdTree';
import { projectToPlane } from '../../src/engine/geo';

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

function linearScan(
  lats: number[],
  lngs: number[],
  refLat: number,
  qLat: number,
  qLng: number,
  k: number,
): Array<{ index: number; distanceM: number }> {
  const q = projectToPlane(qLat, qLng, refLat);
  const dSq: number[] = [];
  for (let i = 0; i < lats.length; i += 1) {
    const p = projectToPlane(lats[i], lngs[i], refLat);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    dSq.push(dx * dx + dy * dy);
  }
  const indices = lats.map((_, i) => i);
  indices.sort((a, b) => dSq[a] - dSq[b] || a - b);
  const out: Array<{ index: number; distanceM: number }> = [];
  for (let i = 0; i < Math.min(k, indices.length); i += 1) {
    out.push({ index: indices[i], distanceM: Math.sqrt(dSq[indices[i]]) });
  }
  return out;
}

function expectMatches(
  tree: KdTree,
  lats: number[],
  lngs: number[],
  qLat: number,
  qLng: number,
  k: number,
): void {
  const got = tree.kNearest(qLat, qLng, k);
  const expected = linearScan(lats, lngs, tree.refLat, qLat, qLng, k);
  expect(got.length).toBe(expected.length);
  for (let i = 0; i < got.length; i += 1) {
    expect(got[i].index).toBe(expected[i].index);
    expect(got[i].distanceM).toBeCloseTo(expected[i].distanceM, 9);
  }
}

describe('KdTree', () => {
  it('matches a linear scan for 2000 random points and 200 queries across many k', () => {
    const rng = mulberry32(7);
    const lats: number[] = [];
    const lngs: number[] = [];
    for (let i = 0; i < 2000; i += 1) {
      lats.push(10.72 + rng() * 0.17);
      lngs.push(106.62 + rng() * 0.21);
    }
    const tree = new KdTree(lats, lngs);
    const ks = [1, 2, 5, 40, 2000, 5000];
    for (let q = 0; q < 200; q += 1) {
      const qLat = 10.6 + rng() * 0.5;
      const qLng = 106.5 + rng() * 0.5;
      for (const k of ks) {
        expectMatches(tree, lats, lngs, qLat, qLng, k);
      }
      const nearest = tree.nearest(qLat, qLng);
      const expected = linearScan(lats, lngs, tree.refLat, qLat, qLng, 1);
      if (nearest === null) {
        expect(expected.length).toBe(0);
      } else {
        expect(nearest.index).toBe(expected[0].index);
        expect(nearest.distanceM).toBeCloseTo(expected[0].distanceM, 9);
      }
    }
  });

  it('handles duplicate points, tie-breaking by index', () => {
    const rng = mulberry32(99);
    const lats: number[] = [];
    const lngs: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      lats.push(10.8);
      lngs.push(106.7);
    }
    for (let i = 0; i < 100; i += 1) {
      lats.push(10.72 + rng() * 0.17);
      lngs.push(106.62 + rng() * 0.21);
    }
    const tree = new KdTree(lats, lngs);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 1);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 50);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 60);
  });

  it('handles a tree of identical points', () => {
    const lats = new Array<number>(25).fill(10.8);
    const lngs = new Array<number>(25).fill(106.7);
    const tree = new KdTree(lats, lngs);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 1);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 7);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 25);
    expectMatches(tree, lats, lngs, 10.8, 106.7, 40);
  });

  it('handles collinear points', () => {
    const rng = mulberry32(5);
    const lats: number[] = [];
    const lngs: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      lats.push(10.8);
      lngs.push(106.62 + rng() * 0.21);
    }
    const tree = new KdTree(lats, lngs);
    for (let q = 0; q < 20; q += 1) {
      const qLng = 106.62 + rng() * 0.21;
      expectMatches(tree, lats, lngs, 10.8, qLng, 1);
      expectMatches(tree, lats, lngs, 10.8, qLng, 10);
    }
  });

  it('returns at most n results for a single point', () => {
    const tree = new KdTree([10.8], [106.7]);
    expect(tree.kNearest(10.8, 106.7, 3)).toEqual([{ index: 0, distanceM: 0 }]);
    expect(tree.nearest(10.8, 106.7)).toEqual({ index: 0, distanceM: 0 });
  });

  it('returns empty/null for an empty tree', () => {
    const tree = new KdTree([], []);
    expect(tree.refLat).toBe(0);
    expect(tree.kNearest(10.8, 106.7, 5)).toEqual([]);
    expect(tree.nearest(10.8, 106.7)).toBeNull();
  });

  it('throws when coordinate arrays have different lengths', () => {
    expect(() => new KdTree([1, 2], [1])).toThrow(Error);
    expect(() => new KdTree([1], [1, 2])).toThrow(Error);
  });

  it('builds a 50,000-point tree and matches a linear scan', () => {
    const rng = mulberry32(2024);
    const lats: number[] = [];
    const lngs: number[] = [];
    for (let i = 0; i < 50000; i += 1) {
      lats.push(10.72 + rng() * 0.17);
      lngs.push(106.62 + rng() * 0.21);
    }
    const tree = new KdTree(lats, lngs);
    for (let q = 0; q < 20; q += 1) {
      const qLat = 10.6 + rng() * 0.5;
      const qLng = 106.5 + rng() * 0.5;
      expectMatches(tree, lats, lngs, qLat, qLng, 1);
      expectMatches(tree, lats, lngs, qLat, qLng, 5);
    }
  });
});
