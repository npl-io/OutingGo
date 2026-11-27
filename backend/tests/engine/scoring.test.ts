import { describe, it, expect } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { scoreCandidates } from '../../src/engine/scoring';

function order(result: Array<{ candidate: number }>): number[] {
  return result.map((r) => r.candidate);
}

describe('scoreCandidates', () => {
  it('ranks differently for MIN_TOTAL and MIN_SPREAD', () => {
    // member 0: [10, 30], member 1: [50, 31]
    const times = [
      [10, 30],
      [50, 31],
    ];
    const byTotal = scoreCandidates(times, 'MIN_TOTAL');
    const bySpread = scoreCandidates(times, 'MIN_SPREAD');
    expect(order(byTotal)).toEqual([0, 1]);
    expect(order(bySpread)).toEqual([1, 0]);
    expect(byTotal[0]).toEqual({
      candidate: 0,
      memberSeconds: [10, 50],
      totalSec: 60,
      maxSec: 50,
      spreadSec: 40,
    });
    expect(byTotal[1]).toEqual({
      candidate: 1,
      memberSeconds: [30, 31],
      totalSec: 61,
      maxSec: 31,
      spreadSec: 1,
    });
  });

  it('breaks MIN_TOTAL ties by max, then by index', () => {
    // totals all 60; max: c0 = 40, c1 = 30, c2 = 30, c3 = 30
    const times = [
      [40, 30, 30, 30],
      [20, 30, 30, 30],
    ];
    expect(order(scoreCandidates(times, 'MIN_TOTAL'))).toEqual([1, 2, 3, 0]);
  });

  it('breaks MIN_SPREAD ties by total, then by index', () => {
    // spread all 10; totals: c0 = 50, c1 = 30, c2 = 30
    const times = [
      [20, 10, 10],
      [30, 20, 20],
    ];
    expect(order(scoreCandidates(times, 'MIN_SPREAD'))).toEqual([1, 2, 0]);
  });

  it('keeps a far venue with spread 0 from beating a nearby one under MIN_SPREAD', () => {
    // c0: total 1260, spread 60; c1: total 4800, spread 0. c1 is more than
    // 1.5x the best total, so it must not win despite its perfect spread.
    const times = [
      [600, 2400],
      [660, 2400],
    ];
    expect(order(scoreCandidates(times, 'MIN_SPREAD'))).toEqual([0, 1]);
  });

  it('still chooses the second candidate for the (10,50) vs (30,31) case', () => {
    const times = [
      [10, 30],
      [50, 31],
    ];
    expect(order(scoreCandidates(times, 'MIN_SPREAD'))).toEqual([1, 0]);
  });

  it('with tolerance 1 only the best-total candidate is eligible', () => {
    const times = [
      [10, 30],
      [50, 31],
    ];
    expect(order(scoreCandidates(times, 'MIN_SPREAD', { spreadTotalTolerance: 1 }))).toEqual([
      0, 1,
    ]);
  });

  it('rejects an invalid spreadTotalTolerance', () => {
    for (const tolerance of [Number.NaN, Infinity, 0, 0.5, -1]) {
      try {
        scoreCandidates([[1], [1]], 'MIN_SPREAD', { spreadTotalTolerance: tolerance });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(EngineError);
        expect((error as EngineError).code).toBe('INVALID_INPUT');
      }
    }
  });

  it('ranks eligible candidates before non-eligible ones', () => {
    // c0: total 200, spread 0 (non-eligible); c1: total 20, spread 0;
    // c2: total 23, spread 1. Eligible group must come first even though c0
    // has a smaller spread than c2.
    const times = [
      [100, 10, 11],
      [100, 10, 12],
    ];
    expect(order(scoreCandidates(times, 'MIN_SPREAD'))).toEqual([1, 2, 0]);
  });

  it('breaks ties inside the eligible group by spread, then total, then index', () => {
    // min total 40; threshold 60 keeps all eligible. c2 wins on spread, then
    // c1 beats c0 on the spread tie via its smaller total.
    const times = [
      [27, 17, 20],
      [33, 23, 20],
    ];
    expect(order(scoreCandidates(times, 'MIN_SPREAD'))).toEqual([2, 1, 0]);
  });

  it('drops a candidate that is Infinity or NaN for any member', () => {
    const times = [
      [10, Infinity, 10, 10],
      [10, 10, Number.NaN, 10],
    ];
    expect(order(scoreCandidates(times, 'MIN_TOTAL'))).toEqual([0, 3]);
    expect(scoreCandidates([[Infinity], [5]], 'MIN_SPREAD')).toEqual([]);
  });

  it('rounds each time before summing', () => {
    const [result] = scoreCandidates([[10.4], [10.6]], 'MIN_TOTAL');
    expect(result?.memberSeconds).toEqual([10, 11]);
    expect(result?.totalSec).toBe(21);
    expect(result?.spreadSec).toBe(1);
  });

  it('supports a single member with spread 0', () => {
    const result = scoreCandidates([[30, 10, 20]], 'MIN_SPREAD');
    expect(order(result)).toEqual([1, 2, 0]);
    expect(result.every((r) => r.spreadSec === 0)).toBe(true);
    expect(order(scoreCandidates([[30, 10, 20]], 'MIN_TOTAL'))).toEqual([1, 2, 0]);
  });

  it('throws EngineError NOT_ENOUGH_MEMBERS with zero members', () => {
    try {
      scoreCandidates([], 'MIN_TOTAL');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect((error as EngineError).code).toBe('NOT_ENOUGH_MEMBERS');
    }
  });

  it('throws EngineError INVALID_INPUT when rows have different lengths', () => {
    try {
      scoreCandidates([[1, 2], [1]], 'MIN_TOTAL');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect((error as EngineError).code).toBe('INVALID_INPUT');
    }
  });

  it('does not mutate the input', () => {
    const times = [
      [30, 10, 20],
      [5, 15, 25],
    ];
    const copy = times.map((row) => [...row]);
    scoreCandidates(times, 'MIN_TOTAL');
    scoreCandidates(times, 'MIN_SPREAD');
    expect(times).toEqual(copy);
  });
});
