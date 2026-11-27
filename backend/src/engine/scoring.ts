import { SPREAD_TOTAL_TOLERANCE } from './config';
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

export interface ScoreOptions {
  /** @see SPREAD_TOTAL_TOLERANCE. */
  spreadTotalTolerance?: number;
}

/**
 * Scores and ranks candidates. times[member][candidate] is travel seconds.
 * A candidate is dropped when any member's time is not finite. Times are
 * rounded to whole seconds first. MIN_TOTAL sorts by total, then max, then
 * index. MIN_SPREAD ranks candidates whose total is within
 * spreadTotalTolerance of the best total first, by (max - min), then total,
 * then index; the remaining candidates follow, by total, then spread, then
 * index. Input is not mutated.
 * @throws EngineError NOT_ENOUGH_MEMBERS with zero members.
 * @throws EngineError INVALID_INPUT when member rows have different lengths or
 * spreadTotalTolerance is not finite or below 1.
 */
export function scoreCandidates(
  times: ReadonlyArray<ArrayLike<number>>,
  objective: Objective,
  options?: ScoreOptions,
): ScoredCandidate[] {
  if (times.length === 0) {
    throw new EngineError('NOT_ENOUGH_MEMBERS', 'At least one member is required to score venues');
  }
  const candidateCount = times[0]!.length;
  for (const row of times) {
    if (row.length !== candidateCount) {
      throw new EngineError(
        'INVALID_INPUT',
        'scoreCandidates: all member rows must have the same length',
      );
    }
  }
  const tolerance = options?.spreadTotalTolerance ?? SPREAD_TOTAL_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance < 1) {
    throw new EngineError(
      'INVALID_INPUT',
      `spreadTotalTolerance must be finite and >= 1, got ${tolerance}`,
    );
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
    return scored;
  }

  if (scored.length === 0) {
    return scored;
  }
  const minTotal = scored.reduce((min, s) => Math.min(min, s.totalSec), Infinity);
  const eligible: ScoredCandidate[] = [];
  const rest: ScoredCandidate[] = [];
  for (const s of scored) {
    (s.totalSec <= minTotal * tolerance ? eligible : rest).push(s);
  }
  eligible.sort(
    (a, b) => a.spreadSec - b.spreadSec || a.totalSec - b.totalSec || a.candidate - b.candidate,
  );
  rest.sort(
    (a, b) => a.totalSec - b.totalSec || a.spreadSec - b.spreadSec || a.candidate - b.candidate,
  );
  return eligible.concat(rest);
}
