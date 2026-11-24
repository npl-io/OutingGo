import { projectToPlane } from './geo';

/** Split along the projected x axis (longitude direction). */
const AXIS_X = 0;
/** Split along the projected y axis (latitude direction). */
const AXIS_Y = 1;

/** A nearest-neighbour result with an index into the original point arrays. */
export interface KdNearestResult {
  index: number;
  distanceM: number;
}

/**
 * A static 2D KD-tree over geographic points. Points are projected once onto a
 * local tangent plane (see projectToPlane); reported distances are Euclidean
 * in that plane, which differ from haversine by well under 0.5% at city scale.
 *
 * The tree is implicit: `order` stores point indices so that every range
 * [lo, hi) has its median at mid = (lo + hi) >> 1, and `axis[mid]` records the
 * split axis of that node (the axis with the larger spread in the range).
 */
export class KdTree {
  /** Mean latitude of all points (0 for an empty tree), used for projection. */
  readonly refLat: number;

  private readonly n: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly order: Uint32Array;
  private readonly axis: Uint8Array;

  constructor(lats: ArrayLike<number>, lngs: ArrayLike<number>) {
    const n = lats.length;
    if (lngs.length !== n) {
      throw new Error('KdTree: lats and lngs must have the same length');
    }
    this.n = n;
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      sum += lats[i]!;
    }
    this.refLat = n === 0 ? 0 : sum / n;
    this.xs = new Float64Array(n);
    this.ys = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const p = projectToPlane(lats[i]!, lngs[i]!, this.refLat);
      this.xs[i] = p.x;
      this.ys[i] = p.y;
    }
    this.order = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) {
      this.order[i] = i;
    }
    this.axis = new Uint8Array(n);
    this.build();
  }

  /**
   * Returns up to min(k, n) nearest neighbours sorted ascending by distance,
   * ties broken by point index ascending. Returns [] when k <= 0 or empty.
   */
  kNearest(lat: number, lng: number, k: number): KdNearestResult[] {
    if (k <= 0 || this.n === 0) {
      return [];
    }
    if (k >= this.n) {
      return this.allByDistance(lat, lng);
    }

    const target = k;
    const bestIdx = new Int32Array(target);
    const bestDist = new Float64Array(target);
    let count = 0;

    const query = projectToPlane(lat, lng, this.refLat);
    const qx = query.x;
    const qy = query.y;

    const order = this.order;
    const xs = this.xs;
    const ys = this.ys;
    const axis = this.axis;

    // Insert (idx, dSq) into the k best, kept sorted by (distance, index).
    function add(idx: number, dSq: number): void {
      let pos = count;
      while (
        pos > 0 &&
        (dSq < bestDist[pos - 1]! ||
          (dSq === bestDist[pos - 1]! && idx < bestIdx[pos - 1]!))
      ) {
        pos -= 1;
      }
      if (count === target) {
        if (pos === target) {
          return;
        }
        for (let i = target - 1; i > pos; i -= 1) {
          bestDist[i] = bestDist[i - 1]!;
          bestIdx[i] = bestIdx[i - 1]!;
        }
      } else {
        for (let i = count; i > pos; i -= 1) {
          bestDist[i] = bestDist[i - 1]!;
          bestIdx[i] = bestIdx[i - 1]!;
        }
        count += 1;
      }
      bestDist[pos] = dSq;
      bestIdx[pos] = idx;
    }

    // Descend the near side first, then the far side when it can still improve
    // the k best. Depth is about log2(n), so recursion is safe.
    function search(lo: number, hi: number): void {
      if (lo >= hi) {
        return;
      }
      const mid = (lo + hi) >> 1;
      const idx = order[mid]!;
      const dx = qx - xs[idx]!;
      const dy = qy - ys[idx]!;
      add(idx, dx * dx + dy * dy);

      const dim = axis[mid]!;
      const nodeCoord = dim === AXIS_X ? xs[idx]! : ys[idx]!;
      const qCoord = dim === AXIS_X ? qx : qy;
      const goLeft = qCoord < nodeCoord;
      const nearLo = goLeft ? lo : mid + 1;
      const nearHi = goLeft ? mid : hi;
      const farLo = goLeft ? mid + 1 : lo;
      const farHi = goLeft ? hi : mid;

      search(nearLo, nearHi);

      const delta = qCoord - nodeCoord;
      const worst = count < target ? Infinity : bestDist[target - 1]!;
      if (delta * delta <= worst) {
        search(farLo, farHi);
      }
    }

    search(0, this.n);

    const results: KdNearestResult[] = new Array(count);
    for (let i = 0; i < count; i += 1) {
      results[i] = { index: bestIdx[i]!, distanceM: Math.sqrt(bestDist[i]!) };
    }
    return results;
  }

  /** Returns the nearest neighbour, or null when the tree is empty. */
  nearest(lat: number, lng: number): KdNearestResult | null {
    const found = this.kNearest(lat, lng, 1);
    return found.length === 0 ? null : found[0] ?? null;
  }

  private build(): void {
    if (this.n === 0) {
      return;
    }
    const stack: number[] = [0, this.n];
    while (stack.length > 0) {
      const hi = stack.pop();
      const lo = stack.pop();
      if (lo === undefined || hi === undefined || lo >= hi) {
        continue;
      }
      const mid = (lo + hi) >> 1;
      this.axis[mid] = this.chooseAxis(lo, hi);
      this.quickselect(lo, hi, mid, this.axis[mid]);
      stack.push(lo, mid);
      stack.push(mid + 1, hi);
    }
  }

  private chooseAxis(lo: number, hi: number): number {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = lo; i < hi; i += 1) {
      const idx = this.order[i]!;
      const x = this.xs[idx]!;
      const y = this.ys[idx]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return maxX - minX >= maxY - minY ? AXIS_X : AXIS_Y;
  }

  private quickselect(lo: number, hi: number, k: number, dim: number): void {
    const stack: number[] = [lo, hi];
    while (stack.length > 0) {
      const curHi = stack.pop();
      const curLo = stack.pop();
      if (curLo === undefined || curHi === undefined || curLo >= curHi) {
        continue;
      }
      const pivotIdx = this.medianOfThree(curLo, curHi, dim);
      const pivotPos = this.partition(curLo, curHi, pivotIdx, dim);
      if (pivotPos === k) {
        continue;
      }
      if (k < pivotPos) {
        stack.push(curLo, pivotPos);
      } else {
        stack.push(pivotPos + 1, curHi);
      }
    }
  }

  private medianOfThree(lo: number, hi: number, dim: number): number {
    const a = lo;
    const b = (lo + hi) >> 1;
    const c = hi - 1;
    const ia = this.order[a]!;
    const ib = this.order[b]!;
    const ic = this.order[c]!;
    if (this.lessPoint(ia, ib, dim)) {
      if (this.lessPoint(ib, ic, dim)) {
        return b;
      }
      return this.lessPoint(ia, ic, dim) ? c : a;
    }
    if (this.lessPoint(ia, ic, dim)) {
      return a;
    }
    return this.lessPoint(ib, ic, dim) ? c : b;
  }

  private partition(lo: number, hi: number, pivotIdx: number, dim: number): number {
    const last = hi - 1;
    this.swapOrder(pivotIdx, last);
    const pivot = this.order[last]!;
    const pivotCoord = dim === AXIS_X ? this.xs[pivot]! : this.ys[pivot]!;
    let store = lo;
    for (let i = lo; i < last; i += 1) {
      const cur = this.order[i]!;
      const curCoord = dim === AXIS_X ? this.xs[cur]! : this.ys[cur]!;
      if (curCoord < pivotCoord || (curCoord === pivotCoord && cur < pivot)) {
        this.swapOrder(i, store);
        store += 1;
      }
    }
    this.swapOrder(store, last);
    return store;
  }

  private lessPoint(i: number, j: number, dim: number): boolean {
    const ci = dim === AXIS_X ? this.xs[i]! : this.ys[i]!;
    const cj = dim === AXIS_X ? this.xs[j]! : this.ys[j]!;
    return ci < cj || (ci === cj && i < j);
  }

  private swapOrder(a: number, b: number): void {
    const tmp = this.order[a]!;
    this.order[a] = this.order[b]!;
    this.order[b] = tmp;
  }

  private allByDistance(lat: number, lng: number): KdNearestResult[] {
    const n = this.n;
    const query = projectToPlane(lat, lng, this.refLat);
    const qx = query.x;
    const qy = query.y;
    const dSq = new Float64Array(n);
    const indices = new Array<number>(n);
    for (let i = 0; i < n; i += 1) {
      const dx = qx - this.xs[i]!;
      const dy = qy - this.ys[i]!;
      dSq[i] = dx * dx + dy * dy;
      indices[i] = i;
    }
    indices.sort((a, b) => dSq[a]! - dSq[b]! || a - b);
    const results: KdNearestResult[] = new Array(n);
    for (let i = 0; i < n; i += 1) {
      results[i] = { index: indices[i]!, distanceM: Math.sqrt(dSq[indices[i]!]!) };
    }
    return results;
  }
}
