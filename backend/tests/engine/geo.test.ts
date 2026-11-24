import { describe, it, expect } from 'vitest';
import { haversineMeters, projectToPlane } from '../../src/engine/geo';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(10.8, 106.7, 10.8, 106.7)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineMeters(10.8, 106.7, 11.0, 106.9)).toBe(
      haversineMeters(11.0, 106.9, 10.8, 106.7),
    );
  });

  it('measures 1 degree of latitude as about 111195 m', () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111195 - 2);
    expect(d).toBeLessThan(111195 + 2);
  });

  it('measures 1 degree of longitude at latitude 10.8 as about 109225 m', () => {
    const d = haversineMeters(10.8, 106.0, 10.8, 107.0);
    expect(d).toBeGreaterThan(109225 - 100);
    expect(d).toBeLessThan(109225 + 100);
  });
});

describe('projectToPlane', () => {
  it('agrees with haversine to under 0.5% for a ~30 km pair near HCMC', () => {
    const p1 = { lat: 10.8, lng: 106.7 };
    const p2 = { lat: 11.0, lng: 106.9 };
    const refLat = (p1.lat + p2.lat) / 2;
    const a = projectToPlane(p1.lat, p1.lng, refLat);
    const b = projectToPlane(p2.lat, p2.lng, refLat);
    const planar = Math.hypot(b.x - a.x, b.y - a.y);
    const haversine = haversineMeters(p1.lat, p1.lng, p2.lat, p2.lng);
    expect(haversine).toBeGreaterThan(25000);
    expect(haversine).toBeLessThan(35000);
    expect(Math.abs(planar - haversine) / haversine).toBeLessThan(0.005);
  });
});
