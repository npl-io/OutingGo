/**
 * A binary min-heap over float keys with non-negative integer payloads.
 * Sift-up and sift-down are iterative and allocate nothing; the only
 * allocation happens in push() when the backing arrays double in size.
 */
export class MinHeap {
  /** Key of the payload most recently returned by pop(), or -1 if none yet. */
  lastKey: number = -1;

  private keys: Float64Array;
  private values: Uint32Array;
  private count = 0;

  constructor(initialCapacity = 1024) {
    const capacity = initialCapacity < 1 ? 1 : initialCapacity;
    this.keys = new Float64Array(capacity);
    this.values = new Uint32Array(capacity);
  }

  /** Number of elements currently in the heap. */
  get size(): number {
    return this.count;
  }

  /** Inserts a payload with the given key; throws RangeError on a NaN key. */
  push(key: number, value: number): void {
    if (Number.isNaN(key)) {
      throw new RangeError('MinHeap: key must not be NaN');
    }
    if (this.count === this.keys.length) {
      this.grow();
    }
    this.keys[this.count] = key;
    this.values[this.count] = value;
    this.siftUp(this.count);
    this.count += 1;
  }

  /** Removes and returns the payload with the smallest key, or -1 if empty. */
  pop(): number {
    if (this.count === 0) {
      return -1;
    }
    const result = this.values[0]!;
    this.lastKey = this.keys[0]!;
    this.count -= 1;
    if (this.count > 0) {
      this.keys[0] = this.keys[this.count]!;
      this.values[0] = this.values[this.count]!;
      this.siftDown(0);
    }
    return result;
  }

  /** Returns the payload with the smallest key without removing it, or -1. */
  peek(): number {
    return this.count === 0 ? -1 : this.values[0]!;
  }

  /** Returns the smallest key without removing it, or Infinity when empty. */
  peekKey(): number {
    return this.count === 0 ? Infinity : this.keys[0]!;
  }

  /** Removes all elements without deallocating the backing arrays. */
  clear(): void {
    this.count = 0;
  }

  private grow(): void {
    const next = Math.max(2, this.keys.length * 2);
    const keys = new Float64Array(next);
    const values = new Uint32Array(next);
    keys.set(this.keys);
    values.set(this.values);
    this.keys = keys;
    this.values = values;
  }

  private siftUp(index: number): void {
    let i = index;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[i]! >= this.keys[parent]!) {
        break;
      }
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(index: number): void {
    let i = index;
    for (; ;) {
      const left = i * 2 + 1;
      if (left >= this.count) {
        break;
      }
      const right = left + 1;
      let smallest = left;
      if (right < this.count && this.keys[right]! < this.keys[left]!) {
        smallest = right;
      }
      if (this.keys[smallest]! >= this.keys[i]!) {
        break;
      }
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(a: number, b: number): void {
    const key = this.keys[a]!;
    const value = this.values[a]!;
    this.keys[a] = this.keys[b]!;
    this.values[a] = this.values[b]!;
    this.keys[b] = key;
    this.values[b] = value;
  }
}

