import { pool, query } from '../src/config/db';
import { env } from '../src/config/env';
import { MAX_SNAP_M } from '../src/engine/config';
import { loadGraphStore, snapToGraph, type GraphStore } from '../src/engine/graphStore';
import { parseTimeToMinute } from '../src/engine/openingHours';
import {
  recommend,
  routeFor,
  type RecommendMember,
  type RecommendResult,
  type RecommendVenue,
} from '../src/engine/recommend';
import type { Objective } from '../src/engine/scoring';

const DEFAULT_TIME = '19:00';
const TABLE_ROWS = 5;
const SECONDS_PER_MINUTE = 60;
const METERS_PER_KM = 1000;
const P90 = 0.9;

const SAMPLE_MEMBERS: RecommendMember[] = [
  { id: 1, lat: 10.7725, lng: 106.698 },
  { id: 2, lat: 10.8386, lng: 106.6652 },
  { id: 3, lat: 10.8777, lng: 106.8006 },
];
const EXTRA_MEMBERS: RecommendMember[] = [
  { id: 4, lat: 10.734, lng: 106.722 },
  { id: 5, lat: 10.8015, lng: 106.6527 },
];
const MEMBER_LABELS = ['A', 'B', 'C', 'D', 'E'];

interface VenueRow {
  id: number;
  name: string;
  district: string | null;
  lat: number;
  lng: number;
  opening: string;
  closing: string;
}

interface Args {
  time: string;
  objectives: Objective[];
  from: { lat: number; lng: number } | null;
  to: { lat: number; lng: number } | null;
}

function parseLatLng(value: string | undefined, flag: string): { lat: number; lng: number } {
  const parts = (value ?? '').split(',').map(Number);
  if (parts.length !== 2 || parts.some((p) => !Number.isFinite(p))) {
    throw new Error(`${flag} expects "lat,lng"`);
  }
  return { lat: parts[0]!, lng: parts[1]! };
}

function parseArgs(argv: string[]): Args {
  const args: Args = { time: DEFAULT_TIME, objectives: ['MIN_TOTAL', 'MIN_SPREAD'], from: null, to: null };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--time') {
      args.time = value ?? '';
    } else if (flag === '--objective') {
      if (value === 'MIN_TOTAL' || value === 'MIN_SPREAD') {
        args.objectives = [value];
      } else if (value !== 'both') {
        throw new Error('--objective expects MIN_TOTAL, MIN_SPREAD or both');
      }
    } else if (flag === '--from') {
      args.from = parseLatLng(value, flag);
    } else if (flag === '--to') {
      args.to = parseLatLng(value, flag);
    } else {
      throw new Error(`Unknown argument "${flag}"`);
    }
  }
  if ((args.from === null) !== (args.to === null)) {
    throw new Error('--from and --to must be used together');
  }
  return args;
}

function minutes(seconds: number): string {
  return (seconds / SECONDS_PER_MINUTE).toFixed(1);
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) {
    return NaN;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1);
  return sorted[Math.max(0, index)]!;
}

function printCoverage(store: GraphStore, venues: VenueRow[]): void {
  const distances: number[] = [];
  for (const venue of venues) {
    const snap = snapToGraph(store, venue.lat, venue.lng, Infinity);
    if (snap !== null) {
      distances.push(snap.distanceM);
    }
  }
  distances.sort((a, b) => a - b);
  const within = distances.filter((d) => d <= MAX_SNAP_M).length;
  console.log(`Coverage: ${within} of ${venues.length} active venues snap within ${MAX_SNAP_M} m`);
  console.log(
    `Venue snap distance: median ${percentile(distances, 0.5).toFixed(0)} m, ` +
      `p90 ${percentile(distances, P90).toFixed(0)} m`,
  );
  for (const [i, member] of [...SAMPLE_MEMBERS, ...EXTRA_MEMBERS].entries()) {
    const snap = snapToGraph(store, member.lat, member.lng, Infinity);
    const text = snap === null ? 'no node' : `${snap.distanceM.toFixed(0)} m`;
    console.log(`Member ${MEMBER_LABELS[i]} snap distance: ${text}`);
  }
}

function printStats(result: RecommendResult): void {
  console.log(`Stats: ${JSON.stringify({ ...result.stats, elapsedMs: undefined })}`);
  console.log(`Elapsed: ${result.stats.elapsedMs.toFixed(1)} ms`);
}

function printTable(result: RecommendResult, names: Map<number, VenueRow>, memberCount: number): void {
  const header = [
    'rank',
    'venue'.padEnd(36),
    'district'.padEnd(16),
    ...MEMBER_LABELS.slice(0, memberCount).map((l) => l.padStart(6)),
    'total'.padStart(7),
    'spread'.padStart(7),
  ];
  console.log(header.join(' '));
  for (const c of result.candidates.slice(0, TABLE_ROWS)) {
    const venue = names.get(c.venueId);
    console.log(
      [
        String(c.rank).padStart(4),
        (venue?.name ?? String(c.venueId)).slice(0, 36).padEnd(36),
        (venue?.district ?? '-').slice(0, 16).padEnd(16),
        ...c.memberSeconds.map((m) => minutes(m.seconds).padStart(6)),
        minutes(c.totalSec).padStart(7),
        minutes(c.spreadSec).padStart(7),
      ].join(' '),
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const minuteOfDay = parseTimeToMinute(args.time);
  const store = loadGraphStore(env.GRAPH_FILE);

  if (args.from !== null && args.to !== null) {
    const route = routeFor(store, args.from, args.to);
    if (route === null) {
      console.log('No route (an end is out of coverage or unreachable)');
      return;
    }
    console.log(
      `${route.seconds.toFixed(0)} s, ${minutes(route.seconds)} min, ` +
        `${(route.distanceM / METERS_PER_KM).toFixed(1)} km, ${route.path.length} path points`,
    );
    return;
  }

  const { rows } = await query<VenueRow>(
    `SELECT v.id, v.name, v.district, v.lat, v.lng,
            to_char(v.opening_time,'HH24:MI') AS opening,
            to_char(v.closing_time,'HH24:MI') AS closing
     FROM venues v WHERE v.is_active ORDER BY v.id`,
  );
  const venues: RecommendVenue[] = rows.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    openingMinute: parseTimeToMinute(r.opening),
    closingMinute: parseTimeToMinute(r.closing),
  }));
  const names = new Map(rows.map((r) => [r.id, r]));

  printCoverage(store, rows);

  for (const objective of args.objectives) {
    console.log(`\n== ${objective} at ${args.time} ==`);
    const result = recommend(store, { members: SAMPLE_MEMBERS, venues, minuteOfDay, objective });
    printTable(result, names, SAMPLE_MEMBERS.length);
    printStats(result);
  }

  console.log('\n== 5 members ==');
  const five = recommend(store, {
    members: [...SAMPLE_MEMBERS, ...EXTRA_MEMBERS],
    venues,
    minuteOfDay,
    objective: args.objectives[0]!,
  });
  printStats(five);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
