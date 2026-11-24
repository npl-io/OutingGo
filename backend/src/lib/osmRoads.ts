import { DEFAULT_SPEED_KPH, ROUTING_HIGHWAYS, SPEED_KPH } from '../engine/config';
import { haversineMeters } from '../engine/geo';

/** An OSM element as returned by Overpass (`out geom`); only ways are used. */
export interface OsmWay {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

/** Road network as plain arrays, ready for buildGraph. */
export interface RoadNetwork {
  lat: number[];
  lng: number[];
  edges: { from: number; to: number; seconds: number }[];
  stats: {
    elements: number;
    ways: number;
    duplicateWays: number;
    notRoutable: number;
    malformed: number;
    nodes: number;
    edges: number;
  };
}

const BLOCKED_ACCESS = ['no', 'private'];
const KPH_TO_MPS = 3.6;

/**
 * True when the way is a routable highway for a motorbike: its highway class is
 * in ROUTING_HIGHWAYS and no access tag forbids motor traffic.
 */
export function isRoutable(tags: Readonly<Record<string, string>>): boolean {
  const highway = tags['highway'];
  if (highway === undefined || !ROUTING_HIGHWAYS.includes(highway)) return false;
  for (const key of ['access', 'motor_vehicle', 'motorcycle']) {
    const value = tags[key];
    if (value !== undefined && BLOCKED_ACCESS.includes(value)) return false;
  }
  return true;
}

/**
 * Direction in which a motorbike may travel along the way's node order:
 * 'forward', 'reverse' or 'both'. A motorcycle exception overrides oneway.
 */
export function onewayMode(
  tags: Readonly<Record<string, string>>,
): 'forward' | 'reverse' | 'both' {
  if (tags['oneway:motorcycle'] === 'no') return 'both';
  const oneway = tags['oneway'];
  if (oneway === 'yes' || oneway === 'true' || oneway === '1') return 'forward';
  if (oneway === '-1' || oneway === 'reverse') return 'reverse';
  if (oneway === 'no') return 'both';
  const junction = tags['junction'];
  if (junction === 'roundabout' || junction === 'circular') return 'forward';
  return 'both';
}

/** Assumed speed in km/h for an OSM highway class. */
export function speedKphFor(highway: string): number {
  return Object.prototype.hasOwnProperty.call(SPEED_KPH, highway)
    ? SPEED_KPH[highway]!
    : DEFAULT_SPEED_KPH;
}

interface ValidWay {
  id: number;
  nodes: number[];
  points: { lat: number; lon: number }[];
  tags: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the way in a normalized shape, or null when it is malformed. */
function parseWay(raw: Record<string, unknown>, id: number): ValidWay | null {
  const nodes = raw['nodes'];
  const geometry = raw['geometry'];
  if (!Array.isArray(nodes) || !Array.isArray(geometry)) return null;
  if (nodes.length < 2 || nodes.length !== geometry.length) return null;

  const nodeIds: number[] = [];
  for (const node of nodes) {
    if (typeof node !== 'number' || !Number.isFinite(node)) return null;
    nodeIds.push(node);
  }
  const points: { lat: number; lon: number }[] = [];
  for (const point of geometry) {
    if (!isRecord(point)) return null;
    const lat = point['lat'];
    const lon = point['lon'];
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    points.push({ lat, lon });
  }

  const tags: Record<string, string> = {};
  const rawTags = raw['tags'];
  if (isRecord(rawTags)) {
    for (const [key, value] of Object.entries(rawTags)) {
      if (typeof value === 'string') tags[key] = value;
    }
  }
  return { id, nodes: nodeIds, points, tags };
}

/**
 * Converts OSM way elements into a directed road network. Non-way elements are
 * ignored, ways are deduplicated by id (first one wins), malformed and
 * non-routable ways are counted and skipped. Ways are processed in ascending
 * id order so the result does not depend on the input order. The input is not
 * modified.
 */
export function buildRoadNetwork(elements: ReadonlyArray<unknown>): RoadNetwork {
  const stats = {
    elements: elements.length,
    ways: 0,
    duplicateWays: 0,
    notRoutable: 0,
    malformed: 0,
    nodes: 0,
    edges: 0,
  };

  const seen = new Set<number>();
  const kept: ValidWay[] = [];
  for (const element of elements) {
    if (!isRecord(element) || element['type'] !== 'way') continue;
    stats.ways += 1;

    const id = element['id'];
    if (typeof id !== 'number' || !Number.isFinite(id)) {
      stats.malformed += 1;
      continue;
    }
    if (seen.has(id)) {
      stats.duplicateWays += 1;
      continue;
    }
    seen.add(id);

    const way = parseWay(element, id);
    if (way === null) {
      stats.malformed += 1;
      continue;
    }
    if (!isRoutable(way.tags)) {
      stats.notRoutable += 1;
      continue;
    }
    kept.push(way);
  }
  kept.sort((a, b) => a.id - b.id);

  const lat: number[] = [];
  const lng: number[] = [];
  const edges: { from: number; to: number; seconds: number }[] = [];
  const compactId = new Map<number, number>();

  for (const way of kept) {
    const ids: number[] = [];
    for (let i = 0; i < way.nodes.length; i += 1) {
      const osmId = way.nodes[i]!;
      let id = compactId.get(osmId);
      if (id === undefined) {
        id = lat.length;
        compactId.set(osmId, id);
        lat.push(way.points[i]!.lat);
        lng.push(way.points[i]!.lon);
      }
      ids.push(id);
    }

    const mode = onewayMode(way.tags);
    const metersPerSecond = speedKphFor(way.tags['highway']!) / KPH_TO_MPS;
    for (let i = 0; i + 1 < ids.length; i += 1) {
      const from = ids[i]!;
      const to = ids[i + 1]!;
      if (from === to) continue;
      const meters = haversineMeters(lat[from]!, lng[from]!, lat[to]!, lng[to]!);
      const seconds = meters / metersPerSecond;
      if (mode !== 'reverse') edges.push({ from, to, seconds });
      if (mode !== 'forward') edges.push({ from: to, to: from, seconds });
    }
  }

  stats.nodes = lat.length;
  stats.edges = edges.length;
  return { lat, lng, edges, stats };
}
