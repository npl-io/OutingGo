import { describe, it, expect } from 'vitest';
import { MinHeap } from '../../src/engine/minHeap';

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

describe('MinHeap', () => {
  it('pops keys in non-decreasing order and preserves the payload multiset', () => {
    const heap = new MinHeap(4);
    const expected = new Map<number, number>();
    for (let i = 0; i < 2000; i += 1) {
      const key = i % 7;
      heap.push(key, i);
      expected.set(i, (expected.get(i) ?? 0) + 1);
    }
    const keys: number[] = [];
    const payloads: number[] = [];
    while (heap.size > 0) {
      payloads.push(heap.pop());
      keys.push(heap.lastKey);
    }
    for (let i = 1; i < keys.length; i += 1) {
      expect(keys[i]).toBeGreaterThanOrEqual(keys[i - 1]);
    }
    const seen = new Map<number, number>();
    for (const p of payloads) {
      seen.set(p, (seen.get(p) ?? 0) + 1);
    }
    expect(seen.size).toBe(expected.size);
    for (const [payload, count] of expected) {
      expect(seen.get(payload)).toBe(count);
    }
  });

  it('grows from initialCapacity 2 through 5000 pushes', () => {
    const heap = new MinHeap(2);
    for (let i = 0; i < 5000; i += 1) {
      heap.push(i, i);
    }
    expect(heap.size).toBe(5000);
    for (let i = 0; i < 5000; i += 1) {
      expect(heap.pop()).toBe(i);
      expect(heap.lastKey).toBe(i);
    }
  });

  it('returns sentinels on an empty heap', () => {
    const heap = new MinHeap(2);
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBe(-1);
    expect(heap.peek()).toBe(-1);
    expect(heap.peekKey()).toBe(Infinity);
  });

  it('clears all elements', () => {
    const heap = new MinHeap(2);
    heap.push(3, 30);
    heap.push(1, 10);
    heap.push(2, 20);
    expect(heap.size).toBe(3);
    heap.clear();
    expect(heap.size).toBe(0);
    expect(heap.pop()).toBe(-1);
    expect(heap.peek()).toBe(-1);
    expect(heap.peekKey()).toBe(Infinity);
  });

  it('matches a sorted-array model under random push/pop interleavings', () => {
    const rng = mulberry32(1234);
    const heap = new MinHeap(8);
    const model: number[] = [];
    const pending = new Set<number>();
    for (let step = 0; step < 20000; step += 1) {
      if (model.length === 0 || rng() < 0.6) {
        const key = Math.floor(rng() * 100);
        heap.push(key, step);
        model.push(key);
        pending.add(step);
      } else {
        let minKey = Infinity;
        for (const k of model) {
          if (k < minKey) minKey = k;
        }
        const popped = heap.pop();
        expect(heap.lastKey).toBe(minKey);
        expect(pending.has(popped)).toBe(true);
        pending.delete(popped);
        model.splice(model.indexOf(minKey), 1);
      }
    }
    while (heap.size > 0) {
      let minKey = Infinity;
      for (const k of model) {
        if (k < minKey) minKey = k;
      }
      const popped = heap.pop();
      expect(heap.lastKey).toBe(minKey);
      expect(pending.has(popped)).toBe(true);
      pending.delete(popped);
      model.splice(model.indexOf(minKey), 1);
    }
    expect(model.length).toBe(0);
    expect(pending.size).toBe(0);
  });

  it('throws RangeError when pushing a NaN key', () => {
    const heap = new MinHeap(4);
    heap.push(1, 10);
    expect(() => heap.push(Number.NaN, 20)).toThrow(RangeError);
    expect(heap.size).toBe(1);
    expect(heap.peekKey()).toBe(1);
  });
});
