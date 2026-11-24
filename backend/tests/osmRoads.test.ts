import { describe, it, expect } from 'vitest';
import { haversineMeters } from '../src/engine/geo';
import { buildRoadNetwork, isRoutable, onewayMode, speedKphFor } from '../src/lib/osmRoads';

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

type Point = [number, number, number];

/** points are [osmNodeId, lat, lon] */
function way(id: number, points: Point[], tags: Record<string, string>): Record<string, unknown> {
  return {
    type: 'way',
    id,
    nodes: points.map((p) => p[0]),
    geometry: points.map((p) => ({ lat: p[1], lon: p[2] })),
    tags,
  };
}

const THREE: Point[] = [
  [1, 10.0, 106.0],
  [2, 10.001, 106.0],
  [3, 10.002, 106.0],
];

describe('isRoutable', () => {
  it.each([
    [{ highway: 'primary' }, true],
    [{ highway: 'residential' }, false],
    [{ highway: 'primary', access: 'private' }, false],
    [{ highway: 'primary', access: 'no' }, false],
    [{ highway: 'primary', motorcycle: 'no' }, false],
    [{ highway: 'primary', motor_vehicle: 'no' }, false],
    [{ highway: 'primary', motorcycle: 'yes', access: 'yes' }, true],
    [{ name: 'x' }, false],
  ] as [Record<string, string>, boolean][])('%j -> %s', (tags, expected) => {
    expect(isRoutable(tags)).toBe(expected);
  });
});

describe('onewayMode', () => {
  it.each([
    [{ oneway: 'yes' }, 'forward'],
    [{ oneway: 'true' }, 'forward'],
    [{ oneway: '1' }, 'forward'],
    [{ oneway: '-1' }, 'reverse'],
    [{ oneway: 'reverse' }, 'reverse'],
    [{ oneway: 'no' }, 'both'],
    [{ junction: 'roundabout' }, 'forward'],
    [{ junction: 'circular' }, 'forward'],
    [{ junction: 'roundabout', oneway: 'no' }, 'both'],
    [{ oneway: 'yes', 'oneway:motorcycle': 'no' }, 'both'],
    [{}, 'both'],
  ] as [Record<string, string>, string][])('%j -> %s', (tags, expected) => {
    expect(onewayMode(tags)).toBe(expected);
  });
});

describe('speedKphFor', () => {
  it('returns the class speed or the default', () => {
    expect(speedKphFor('primary')).toBe(35);
    expect(speedKphFor('secondary')).toBe(30);
    expect(speedKphFor('path')).toBe(20);
    expect(speedKphFor('constructor')).toBe(20);
  });
});

describe('buildRoadNetwork', () => {
  it('makes 4 edges and 3 nodes from a two-way 3-node way', () => {
    const net = buildRoadNetwork([way(10, THREE, { highway: 'primary' })]);
    expect(net.stats.nodes).toBe(3);
    expect(net.stats.edges).toBe(4);
    expect(net.lat).toEqual([10.0, 10.001, 10.002]);
    expect(net.lng).toEqual([106, 106, 106]);
    expect(net.edges.map((e) => [e.from, e.to])).toEqual([
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
    ]);
  });

  it('makes 2 edges from a one-way way', () => {
    const net = buildRoadNetwork([way(10, THREE, { highway: 'primary', oneway: 'yes' })]);
    expect(net.edges.map((e) => [e.from, e.to])).toEqual([
      [0, 1],
      [1, 2],
    ]);
  });

  it('reverses the edges of a reverse one-way way', () => {
    const net = buildRoadNetwork([way(10, THREE, { highway: 'primary', oneway: '-1' })]);
    expect(net.edges.map((e) => [e.from, e.to])).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  it('shares the compact id of an OSM node used by two ways', () => {
    const other: Point[] = [
      [3, 10.002, 106.0],
      [4, 10.003, 106.0],
    ];
    const net = buildRoadNetwork([
      way(10, THREE, { highway: 'primary' }),
      way(11, other, { highway: 'primary' }),
    ]);
    expect(net.stats.nodes).toBe(4);
    expect(net.edges.some((e) => e.from === 2 && e.to === 3)).toBe(true);
    expect(net.edges.some((e) => e.from === 3 && e.to === 2)).toBe(true);
  });

  it('counts a way id seen twice once', () => {
    const w = way(10, THREE, { highway: 'primary' });
    const net = buildRoadNetwork([w, { ...w }]);
    expect(net.stats.ways).toBe(2);
    expect(net.stats.duplicateWays).toBe(1);
    expect(net.stats.edges).toBe(4);
  });

  it('ignores non-way elements and counts non-routable ways', () => {
    const net = buildRoadNetwork([
      { type: 'node', id: 1, lat: 10, lon: 106 },
      way(10, THREE, { highway: 'residential' }),
      way(11, THREE, { highway: 'primary', access: 'private' }),
    ]);
    expect(net.stats.elements).toBe(3);
    expect(net.stats.ways).toBe(2);
    expect(net.stats.notRoutable).toBe(2);
    expect(net.stats.edges).toBe(0);
    expect(net.stats.nodes).toBe(0);
  });

  it('counts malformed ways without throwing', () => {
    const tags = { highway: 'primary' };
    const noGeometry = { type: 'way', id: 1, nodes: [1, 2], tags };
    const mismatched = {
      type: 'way',
      id: 2,
      nodes: [1, 2, 3],
      geometry: [
        { lat: 10, lon: 106 },
        { lat: 10.1, lon: 106 },
      ],
      tags,
    };
    const nan = way(3, [[1, 10, 106], [2, Number.NaN, 106]], tags);
    const single = way(4, [[1, 10, 106]], tags);
    const net = buildRoadNetwork([noGeometry, mismatched, nan, single, 42, null]);
    expect(net.stats.malformed).toBe(4);
    expect(net.stats.edges).toBe(0);
  });

  it('computes seconds from haversine length and the way speed', () => {
    const a: Point = [1, 10.0, 106.0];
    const b: Point = [2, 10.0009, 106.0];
    const net = buildRoadNetwork([way(10, [a, b], { highway: 'secondary' })]);
    const meters = haversineMeters(a[1], a[2], b[1], b[2]);
    expect(meters).toBeGreaterThan(95);
    expect(meters).toBeLessThan(105);
    expect(net.edges).toHaveLength(2);
    for (const edge of net.edges) {
      expect(Math.abs(edge.seconds - meters / (30 / 3.6))).toBeLessThan(1e-9);
    }
  });

  it('produces the same output for any input order', () => {
    const rng = mulberry32(7);
    const modes = ['yes', '-1', 'no', 'yes'];
    const ways: Record<string, unknown>[] = [];
    for (let i = 0; i < 12; i += 1) {
      const points: Point[] = [];
      const length = 2 + Math.floor(rng() * 3);
      for (let j = 0; j < length; j += 1) {
        const osmId = 1 + Math.floor(rng() * 15);
        points.push([osmId, 10 + osmId * 0.001, 106 + osmId * 0.001]);
      }
      ways.push(way(100 + i * 3, points, { highway: 'tertiary', oneway: modes[i % 4]! }));
    }
    const expected = buildRoadNetwork(ways);

    for (let round = 0; round < 5; round += 1) {
      const shuffled = [...ways];
      for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      expect(buildRoadNetwork(shuffled)).toEqual(expected);
    }
  });

  it('creates no edge for consecutive duplicate points', () => {
    const points: Point[] = [
      [1, 10.0, 106.0],
      [1, 10.0, 106.0],
      [2, 10.001, 106.0],
    ];
    const net = buildRoadNetwork([way(10, points, { highway: 'primary' })]);
    expect(net.stats.nodes).toBe(2);
    expect(net.stats.edges).toBe(2);
  });

  it('does not mutate the input', () => {
    const input = [way(10, THREE, { highway: 'primary' }), way(9, THREE, { highway: 'primary' })];
    const copy = structuredClone(input);
    buildRoadNetwork(input);
    expect(input).toEqual(copy);
  });
});
