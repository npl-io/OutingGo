/** Mean Earth radius in meters used across the engine. */
export const EARTH_RADIUS_M = 6371008.8;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Great-circle distance in meters between two coordinates, using the haversine
 * formula.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const phi1 = lat1 * DEG_TO_RAD;
  const phi2 = lat2 * DEG_TO_RAD;
  const dPhi = (lat2 - lat1) * DEG_TO_RAD;
  const dLambda = (lng2 - lng1) * DEG_TO_RAD;
  const sinPhi = Math.sin(dPhi / 2);
  const sinLambda = Math.sin(dLambda / 2);
  const a =
    sinPhi * sinPhi + Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda;
  const clamped = a > 1 ? 1 : a;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(clamped));
}

/**
 * Projects a geographic coordinate onto a local tangent plane in meters.
 * x points east and y points north; only longitude is scaled by cos(refLat).
 * Distances in this plane approximate haversine distances to well under 0.5%
 * at city scale.
 */
export function projectToPlane(
  lat: number,
  lng: number,
  refLat: number,
): { x: number; y: number } {
  const lngRad = lng * DEG_TO_RAD;
  const latRad = lat * DEG_TO_RAD;
  const refLatRad = refLat * DEG_TO_RAD;
  const x = EARTH_RADIUS_M * lngRad * Math.cos(refLatRad);
  const y = EARTH_RADIUS_M * latRad;
  return { x, y };
}
