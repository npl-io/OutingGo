import { K_CANDIDATES, MAX_SNAP_M, TOP_N } from './config';
import { reconstructPath, shortestTimes } from './dijkstra';
import { EngineError } from './errors';
import { haversineMeters } from './geo';
import { snapToGraph, type GraphStore, type SnapResult } from './graphStore';
import { KdTree } from './kdTree';
import { isOpenAt } from './openingHours';
import { scoreCandidates, type Objective } from './scoring';

export interface RecommendMember {
  id: number;
  lat: number;
  lng: number;
}

export interface RecommendVenue {
  id: number;
  lat: number;
  lng: number;
  openingMinute: number;
  closingMinute: number;
}

export interface RecommendOptions {
  members: RecommendMember[];
  venues: RecommendVenue[];
  minuteOfDay: number;
  objective: Objective;
  topN?: number;
  kCandidates?: number;
}

export interface RecommendedVenue {
  venueId: number;
  /** 1-based. */
  rank: number;
  totalSec: number;
  maxSec: number;
  spreadSec: number;
  /** Same order as the input members. */
  memberSeconds: { memberId: number; seconds: number }[];
}

export interface RecommendResult {
  candidates: RecommendedVenue[];
  stats: {
    venues: number;
    open: number;
    considered: number;
    outOfCoverage: number;
    unreachable: number;
    dijkstraRuns: number;
    settledNodes: number;
    elapsedMs: number;
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/**
 * Ranks the venues that are open at minuteOfDay for a group of members, using
 * one single-source Dijkstra per member over the road graph. Only the
 * kCandidates open venues nearest to the members' centroid are evaluated.
 * Travel time = pin-to-road + road graph + road-to-venue.
 * @throws EngineError NOT_ENOUGH_MEMBERS with fewer than 2 members,
 * MEMBER_OUT_OF_COVERAGE when a pin is too far from every road node.
 * @throws RangeError on duplicate member ids or a non-positive-integer topN / kCandidates.
 */
export function recommend(store: GraphStore, options: RecommendOptions): RecommendResult {
  const started = performance.now();
  const { members, venues, minuteOfDay, objective } = options;
  const topN = options.topN ?? TOP_N;
  const kCandidates = options.kCandidates ?? K_CANDIDATES;

  if (members.length < 2) {
    throw new EngineError('NOT_ENOUGH_MEMBERS', 'At least 2 members are required to recommend venues');
  }
  if (new Set(members.map((m) => m.id)).size !== members.length) {
    throw new RangeError('recommend: member ids must be unique');
  }
  if (!isPositiveInteger(topN)) {
    throw new RangeError(`recommend: topN must be a positive integer, got ${topN}`);
  }
  if (!isPositiveInteger(kCandidates)) {
    throw new RangeError(`recommend: kCandidates must be a positive integer, got ${kCandidates}`);
  }

  const stats: RecommendResult['stats'] = {
    venues: venues.length,
    open: 0,
    considered: 0,
    outOfCoverage: 0,
    unreachable: 0,
    dijkstraRuns: 0,
    settledNodes: 0,
    elapsedMs: 0,
  };
  const finish = (candidates: RecommendedVenue[]): RecommendResult => {
    stats.elapsedMs = performance.now() - started;
    return { candidates, stats };
  };

  const memberSnaps: SnapResult[] = members.map((member) => {
    const snap = snapToGraph(store, member.lat, member.lng);
    if (snap === null) {
      throw new EngineError(
        'MEMBER_OUT_OF_COVERAGE',
        `Member ${member.id} is more than ${MAX_SNAP_M} m from the road network`,
        { memberId: member.id },
      );
    }
    return snap;
  });

  const open = venues.filter((v) => isOpenAt(v.openingMinute, v.closingMinute, minuteOfDay));
  stats.open = open.length;
  if (open.length === 0) {
    return finish([]);
  }

  let latSum = 0;
  let lngSum = 0;
  for (const member of members) {
    latSum += member.lat;
    lngSum += member.lng;
  }
  const venueTree = new KdTree(
    open.map((v) => v.lat),
    open.map((v) => v.lng),
  );
  const nearby = venueTree.kNearest(latSum / members.length, lngSum / members.length, kCandidates);
  stats.considered = nearby.length;

  const candidates: { venue: RecommendVenue; snap: SnapResult }[] = [];
  for (const { index } of nearby) {
    const venue = open[index]!;
    const snap = snapToGraph(store, venue.lat, venue.lng);
    if (snap === null) {
      stats.outOfCoverage += 1;
    } else {
      candidates.push({ venue, snap });
    }
  }

  const targetNodes = candidates.map((c) => c.snap.node);
  const times: Float64Array[] = [];
  for (let m = 0; m < members.length; m += 1) {
    const memberSnap = memberSnaps[m]!;
    const run = shortestTimes(store.graph, memberSnap.node, targetNodes);
    stats.dijkstraRuns += 1;
    stats.settledNodes += run.settled;
    const seconds = new Float64Array(candidates.length);
    for (let c = 0; c < candidates.length; c += 1) {
      seconds[c] = memberSnap.offRoadSeconds + run.times[c]! + candidates[c]!.snap.offRoadSeconds;
    }
    times.push(seconds);
  }

  const scored = scoreCandidates(times, objective);
  stats.unreachable = candidates.length - scored.length;

  return finish(
    scored.slice(0, topN).map((s, i) => ({
      venueId: candidates[s.candidate]!.venue.id,
      rank: i + 1,
      totalSec: s.totalSec,
      maxSec: s.maxSec,
      spreadSec: s.spreadSec,
      memberSeconds: s.memberSeconds.map((seconds, m) => ({ memberId: members[m]!.id, seconds })),
    })),
  );
}

/**
 * Fastest route between two coordinates. The path starts at `from`, follows the
 * road nodes and ends at `to`, as [lat, lng]. Returns null when either end is
 * out of coverage or the target is unreachable.
 */
export function routeFor(
  store: GraphStore,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): { seconds: number; distanceM: number; path: [number, number][] } | null {
  const fromSnap = snapToGraph(store, from.lat, from.lng);
  const toSnap = snapToGraph(store, to.lat, to.lng);
  if (fromSnap === null || toSnap === null) {
    return null;
  }
  const run = shortestTimes(store.graph, fromSnap.node, [toSnap.node], { withParents: true });
  const graphSeconds = run.times[0]!;
  if (!Number.isFinite(graphSeconds) || run.parents === null) {
    return null;
  }
  const nodes = reconstructPath(run.parents, fromSnap.node, toSnap.node);
  if (nodes.length === 0) {
    return null;
  }

  const path: [number, number][] = [[from.lat, from.lng]];
  for (const node of nodes) {
    path.push([store.graph.lat[node]!, store.graph.lng[node]!]);
  }
  path.push([to.lat, to.lng]);

  let distanceM = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    distanceM += haversineMeters(a[0], a[1], b[0], b[1]);
  }
  return {
    seconds: fromSnap.offRoadSeconds + graphSeconds + toSnap.offRoadSeconds,
    distanceM,
    path,
  };
}
