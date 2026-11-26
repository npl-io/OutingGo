import { describe, expect, it } from 'vitest';
import { shortestTimes } from '../../src/engine/dijkstra';
import { EngineError } from '../../src/engine/errors';
import { haversineMeters } from '../../src/engine/geo';
import { createGraphStore } from '../../src/engine/graphStore';
import {
  recommend,
  routeFor,
  type RecommendMember,
  type RecommendOptions,
  type RecommendVenue,
} from '../../src/engine/recommend';
import {
  catchError,
  gridNodeId,
  gridPoint,
  makeGridGraph,
  makeRng,
} from './helpers/gridGraph';

const SIZE = 10;
const METERS_PER_DEGREE_LAT = 111195.08;
const OFF_ROAD_MPS = 15 / 3.6;
const NOON = 720;
const ALWAYS_OPEN = { openingMinute: 0, closingMinute: 1440 };

const store = createGraphStore(makeGridGraph(SIZE, SIZE));

function member(id: number, row: number, col: number): RecommendMember {
  return { id, ...gridPoint(row, col) };
}

function venue(id: number, row: number, col: number, hours = ALWAYS_OPEN): RecommendVenue {
  return { id, ...gridPoint(row, col), ...hours };
}

function engineErrorOf(fn: () => unknown): EngineError {
  const error = catchError(fn);
  expect(error).toBeInstanceOf(EngineError);
  return error as EngineError;
}

describe('recommend objectives', () => {
  it('MIN_TOTAL and MIN_SPREAD pick different winners that match a brute-force check', () => {
    // A and B are close together, C is far away on the same row: the venue at B
    // has the smallest total, the venue between them has the smallest spread.
    const members = [member(1, 5, 0), member(2, 5, 1), member(3, 5, 9)];
    const rng = makeRng(42);
    const venues: RecommendVenue[] = [venue(1, 5, 1), venue(2, 5, 5)];
    for (let id = 10; id < 25; id += 1) {
      const row = Math.floor(rng() * SIZE);
      const col = Math.floor(rng() * SIZE);
      if ((row === 5 && col === 1) || (row === 5 && col === 5)) continue;
      venues.push(venue(id, row, col));
    }

    const nodeOf = (m: RecommendMember): number => {
      const row = Math.round((m.lat - gridPoint(0, 0).lat) / 0.0045);
      const col = Math.round((m.lng - gridPoint(0, 0).lng) / 0.0046);
      return gridNodeId(row, col, SIZE);
    };
    const allNodes = Array.from({ length: store.graph.nodeCount }, (_, i) => i);
    const fullTimes = members.map((m) => shortestTimes(store.graph, nodeOf(m), allNodes).times);
    const rows = venues.map((v, index) => {
      const seconds = fullTimes.map((t) => Math.round(t[nodeOf(v)]!));
      const total = seconds.reduce((a, b) => a + b, 0);
      return { id: v.id, index, total, spread: Math.max(...seconds) - Math.min(...seconds) };
    });
    const byTotal = [...rows].sort((a, b) => a.total - b.total || a.index - b.index);
    const bySpread = [...rows].sort(
      (a, b) => a.spread - b.spread || a.total - b.total || a.index - b.index,
    );

    const total = recommend(store, { members, venues, minuteOfDay: NOON, objective: 'MIN_TOTAL' });
    const spread = recommend(store, { members, venues, minuteOfDay: NOON, objective: 'MIN_SPREAD' });

    expect(total.candidates[0]!.venueId).toBe(byTotal[0]!.id);
    expect(total.candidates[0]!.totalSec).toBe(byTotal[0]!.total);
    expect(spread.candidates[0]!.venueId).toBe(bySpread[0]!.id);
    expect(spread.candidates[0]!.spreadSec).toBe(bySpread[0]!.spread);
    expect(total.candidates[0]!.venueId).not.toBe(spread.candidates[0]!.venueId);
    expect(total.stats.dijkstraRuns).toBe(3);
  });
});

describe('recommend filtering', () => {
  const members = [member(1, 5, 5), member(2, 6, 6)];
  const venues = [
    venue(1, 2, 2, { openingMinute: 540, closingMinute: 1320 }),
    venue(2, 3, 3, { openingMinute: 540, closingMinute: 1020 }),
    venue(3, 4, 4, { openingMinute: 1320, closingMinute: 120 }),
  ];
  const idsAt = (minuteOfDay: number): number[] =>
    recommend(store, { members, venues, minuteOfDay, objective: 'MIN_TOTAL', topN: 10 })
      .candidates.map((c) => c.venueId)
      .sort();

  it('excludes venues closed at the meeting time, including across midnight', () => {
    expect(idsAt(600)).toEqual([1, 2]);
    expect(idsAt(1200)).toEqual([1]);
    expect(idsAt(1380)).toEqual([3]);
    expect(idsAt(60)).toEqual([3]);
  });

  it('returns an empty list with stats when nothing is open', () => {
    const result = recommend(store, { members, venues, minuteOfDay: 300, objective: 'MIN_TOTAL' });
    expect(result.candidates).toEqual([]);
    expect(result.stats.venues).toBe(3);
    expect(result.stats.open).toBe(0);
    expect(result.stats.dijkstraRuns).toBe(0);
  });

  it('rejects fewer than 2 members', () => {
    for (const list of [[], [member(1, 1, 1)]]) {
      const error = engineErrorOf(() =>
        recommend(store, { members: list, venues, minuteOfDay: NOON, objective: 'MIN_TOTAL' }),
      );
      expect(error.code).toBe('NOT_ENOUGH_MEMBERS');
    }
  });

  it('rejects duplicate member ids and bad topN / kCandidates', () => {
    const base: RecommendOptions = {
      members: [member(1, 1, 1), member(1, 2, 2)],
      venues,
      minuteOfDay: NOON,
      objective: 'MIN_TOTAL',
    };
    expect(() => recommend(store, base)).toThrow(RangeError);
    const ok = [member(1, 1, 1), member(2, 2, 2)];
    expect(() => recommend(store, { ...base, members: ok, topN: 0 })).toThrow(RangeError);
    expect(() => recommend(store, { ...base, members: ok, kCandidates: 1.5 })).toThrow(RangeError);
  });
});

describe('recommend coverage and reachability', () => {
  it('throws MEMBER_OUT_OF_COVERAGE with the member id for a pin 5 km away', () => {
    const origin = gridPoint(0, 0);
    const far = { id: 8, lat: origin.lat - 5000 / METERS_PER_DEGREE_LAT, lng: origin.lng };
    const error = engineErrorOf(() =>
      recommend(store, {
        members: [member(7, 1, 1), far],
        venues: [venue(1, 3, 3)],
        minuteOfDay: NOON,
        objective: 'MIN_TOTAL',
      }),
    );
    expect(error.code).toBe('MEMBER_OUT_OF_COVERAGE');
    expect(error.details).toEqual({ memberId: 8 });
  });

  it('counts a venue far from the graph in outOfCoverage', () => {
    const origin = gridPoint(0, 0);
    const far: RecommendVenue = {
      id: 99,
      lat: origin.lat - 5000 / METERS_PER_DEGREE_LAT,
      lng: origin.lng,
      ...ALWAYS_OPEN,
    };
    const result = recommend(store, {
      members: [member(1, 4, 4), member(2, 5, 5)],
      venues: [venue(1, 3, 3), far],
      minuteOfDay: NOON,
      objective: 'MIN_TOTAL',
    });
    expect(result.stats.considered).toBe(2);
    expect(result.stats.outOfCoverage).toBe(1);
    expect(result.candidates.map((c) => c.venueId)).toEqual([1]);
  });

  it('drops a venue on an isolated component and counts it as unreachable', () => {
    const isolated = { lat: gridPoint(0, 0).lat, lng: gridPoint(0, 0).lng - 0.01 };
    const withIsland = createGraphStore(makeGridGraph(SIZE, SIZE, { extraNodes: [isolated] }));
    const result = recommend(withIsland, {
      members: [member(1, 4, 4), member(2, 5, 5)],
      venues: [venue(1, 3, 3), { id: 50, ...isolated, ...ALWAYS_OPEN }],
      minuteOfDay: NOON,
      objective: 'MIN_TOTAL',
    });
    expect(result.stats.unreachable).toBe(1);
    expect(result.stats.outOfCoverage).toBe(0);
    expect(result.candidates.map((c) => c.venueId)).toEqual([1]);
  });
});

describe('recommend options and output', () => {
  it('considers only the kCandidates venues nearest to the centroid', () => {
    const rng = makeRng(7);
    const cells = Array.from({ length: SIZE * SIZE }, (_, i) => i);
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j]!, cells[i]!];
    }
    // Jitter breaks distance ties between symmetric grid cells.
    const venues: RecommendVenue[] = cells.slice(0, 30).map((cell, i) => {
      const p = gridPoint(Math.floor(cell / SIZE), cell % SIZE);
      return {
        id: i + 1,
        lat: p.lat + (rng() - 0.5) * 0.0006,
        lng: p.lng + (rng() - 0.5) * 0.0006,
        ...ALWAYS_OPEN,
      };
    });
    const members = [member(1, 4, 4), member(2, 5, 5)];
    const centroid = {
      lat: (members[0]!.lat + members[1]!.lat) / 2,
      lng: (members[0]!.lng + members[1]!.lng) / 2,
    };
    const expected = new Set(
      [...venues]
        .sort(
          (a, b) =>
            haversineMeters(centroid.lat, centroid.lng, a.lat, a.lng) -
            haversineMeters(centroid.lat, centroid.lng, b.lat, b.lng),
        )
        .slice(0, 5)
        .map((v) => v.id),
    );

    const result = recommend(store, {
      members,
      venues,
      minuteOfDay: NOON,
      objective: 'MIN_TOTAL',
      kCandidates: 5,
      topN: 10,
    });
    expect(result.stats.considered).toBe(5);
    expect(result.candidates).toHaveLength(5);
    for (const c of result.candidates) {
      expect(expected.has(c.venueId)).toBe(true);
    }
  });

  it('adds the off-road time of a pin 300 m from its node to every venue', () => {
    const origin = gridPoint(0, 0);
    const onNode = member(1, 0, 0);
    const offNode = { id: 1, lat: origin.lat - 300 / METERS_PER_DEGREE_LAT, lng: origin.lng };
    const venues = [venue(1, 3, 3), venue(2, 6, 6), venue(3, 9, 0), venue(4, 0, 8), venue(5, 8, 8)];
    const run = (first: RecommendMember): Map<number, number> => {
      const result = recommend(store, {
        members: [first, member(2, 9, 9)],
        venues,
        minuteOfDay: NOON,
        objective: 'MIN_TOTAL',
        topN: 10,
      });
      return new Map(result.candidates.map((c) => [c.venueId, c.memberSeconds[0]!.seconds]));
    };
    const base = run(onNode);
    const shifted = run(offNode);
    expect(shifted.size).toBe(5);
    for (const [id, seconds] of shifted) {
      expect(Math.abs(seconds - base.get(id)! - 300 / OFF_ROAD_MPS)).toBeLessThanOrEqual(1);
    }
  });

  it('respects topN and numbers ranks from 1 with member order preserved', () => {
    const venues = Array.from({ length: 20 }, (_, i) =>
      venue(i + 1, Math.floor(i / 5) + 2, (i % 5) + 2),
    );
    const members = [member(11, 4, 4), member(12, 5, 5), member(13, 6, 3)];
    const result = recommend(store, { members, venues, minuteOfDay: NOON, objective: 'MIN_TOTAL', topN: 3 });
    expect(result.candidates.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(result.candidates[0]!.memberSeconds.map((m) => m.memberId)).toEqual([11, 12, 13]);
  });

  it('is deterministic and does not mutate its input', () => {
    const options: RecommendOptions = {
      members: [member(1, 2, 2), member(2, 7, 3), member(3, 5, 8)],
      venues: Array.from({ length: 12 }, (_, i) => venue(i + 1, (i * 3) % SIZE, (i * 7) % SIZE)),
      minuteOfDay: NOON,
      objective: 'MIN_SPREAD',
    };
    const snapshot = structuredClone(options);
    options.members.forEach(Object.freeze);
    options.venues.forEach(Object.freeze);
    Object.freeze(options.members);
    Object.freeze(options.venues);

    const first = recommend(store, options);
    const second = recommend(store, options);

    expect(second.candidates).toEqual(first.candidates);
    expect({ ...second.stats, elapsedMs: 0 }).toEqual({ ...first.stats, elapsedMs: 0 });
    expect(options).toEqual(snapshot);
  });
});

describe('routeFor', () => {
  it('builds a path from the pin to the destination whose time matches the legs', () => {
    const a = gridPoint(1, 1);
    const b = gridPoint(8, 8);
    const from = { lat: a.lat + 0.0003, lng: a.lng + 0.0002 };
    const to = { lat: b.lat - 0.0002, lng: b.lng + 0.0003 };

    const route = routeFor(store, from, to);

    expect(route).not.toBeNull();
    expect(route!.path[0]).toEqual([from.lat, from.lng]);
    expect(route!.path[route!.path.length - 1]).toEqual([to.lat, to.lng]);
    expect(route!.distanceM).toBeGreaterThanOrEqual(
      haversineMeters(from.lat, from.lng, to.lat, to.lng),
    );
    const source = gridNodeId(1, 1, SIZE);
    const target = gridNodeId(8, 8, SIZE);
    const graphSeconds = shortestTimes(store.graph, source, [target]).times[0]!;
    const expected =
      haversineMeters(from.lat, from.lng, a.lat, a.lng) / OFF_ROAD_MPS +
      graphSeconds +
      haversineMeters(to.lat, to.lng, b.lat, b.lng) / OFF_ROAD_MPS;
    expect(Math.abs(route!.seconds - expected)).toBeLessThan(0.001);
  });

  it('reports a time consistent with the distance on a straight road', () => {
    const route = routeFor(store, gridPoint(0, 0), gridPoint(0, 9));
    expect(route!.path).toHaveLength(12);
    expect(Math.abs(route!.seconds - route!.distanceM / (30 / 3.6))).toBeLessThan(1);
  });

  it('follows a fast corridor', () => {
    const corridor = createGraphStore(
      makeGridGraph(SIZE, SIZE, {
        edgeMultiplier: (a, b) => (a.row === 0 && b.row === 0 ? 0.1 : 1),
      }),
    );
    const route = routeFor(corridor, gridPoint(1, 0), gridPoint(1, 9));
    expect(route!.path.some(([lat]) => lat === gridPoint(0, 0).lat)).toBe(true);
  });

  it('returns null for an unreachable target and for an out-of-coverage end', () => {
    const isolated = { lat: gridPoint(0, 0).lat, lng: gridPoint(0, 0).lng - 0.01 };
    const withIsland = createGraphStore(makeGridGraph(SIZE, SIZE, { extraNodes: [isolated] }));
    expect(routeFor(withIsland, gridPoint(2, 2), isolated)).toBeNull();

    const far = { lat: gridPoint(0, 0).lat - 5000 / METERS_PER_DEGREE_LAT, lng: gridPoint(0, 0).lng };
    expect(routeFor(store, gridPoint(2, 2), far)).toBeNull();
    expect(routeFor(store, far, gridPoint(2, 2))).toBeNull();
  });
});
