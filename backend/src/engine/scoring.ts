import { EngineError } from './errors';

export type Objective = 'MIN_TOTAL' | 'MIN_SPREAD';

export interface ScoredCandidate {
  /** Index of the candidate in the input rows. */
  candidate: number;
  memberSeconds: number[];
  totalSec: number;
  maxSec: number;
  spreadSec: number;
}

/**
 * Scores and ranks candidates. times[member][candidate] is travel seconds.
 * A candidate is dropped when any member's time is not finite. Times are
 * rounded to whole seconds first. MIN_TOTAL sorts by total, then max, then
 * index; MIN_SPREAD by (max - min), then total, then index. Input is not mutated.
 * @throws EngineError NOT_ENOUGH_MEMBERS with zero members.
 * @throws RangeError when member rows have different lengths.
 */
export function scoreCandidates(
  times: ReadonlyArray<ArrayLike<number>>,
  objective: Objective,
): ScoredCandidate[] {
  if (times.length === 0) {
    throw new EngineError('NOT_ENOUGH_MEMBERS', 'At least one member is required to score venues');
  }
  const candidateCount = times[0]!.length;
  for (const row of times) {
    if (row.length !== candidateCount) {
      throw new RangeError('scoreCandidates: all member rows must have the same length');
    }
  }

  const scored: ScoredCandidate[] = [];
  for (let c = 0; c < candidateCount; c += 1) {
    const memberSeconds: number[] = [];
    let reachable = true;
    for (const row of times) {
      const value = row[c]!;
      if (!Number.isFinite(value)) {
        reachable = false;
        break;
      }
      memberSeconds.push(Math.round(value));
    }
    if (!reachable) {
      continue;
    }
    let totalSec = 0;
    let maxSec = -Infinity;
    let minSec = Infinity;
    for (const seconds of memberSeconds) {
      totalSec += seconds;
      if (seconds > maxSec) maxSec = seconds;
      if (seconds < minSec) minSec = seconds;
    }
    scored.push({ candidate: c, memberSeconds, totalSec, maxSec, spreadSec: maxSec - minSec });
  }

  if (objective === 'MIN_TOTAL') {
    scored.sort((a, b) => a.totalSec - b.totalSec || a.maxSec - b.maxSec || a.candidate - b.candidate);
  } else {
    scored.sort(
      (a, b) => a.spreadSec - b.spreadSec || a.totalSec - b.totalSec || a.candidate - b.candidate,
    );
  }
  return scored;
}
