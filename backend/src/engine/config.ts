/**
 * Engine-wide tunable constants. These encode motorbike routing assumptions for
 * free-flowing traffic in Ho Chi Minh City; adjust them here, not in the code.
 */

/** Assumed travel speed (km/h) per OSM highway class. */
export const SPEED_KPH: Record<string, number> = {
  trunk: 40,
  primary: 35,
  secondary: 30,
  tertiary: 25,
  unclassified: 25,
  residential: 20,
  living_street: 15,
  service: 15,
  trunk_link: 20,
  primary_link: 20,
  secondary_link: 20,
  tertiary_link: 20,
};

/** Fallback speed (km/h) for any highway class not listed in SPEED_KPH. */
export const DEFAULT_SPEED_KPH = 20;

/**
 * Highway classes considered routable. Residential, service and living_street
 * are excluded on purpose (cross-town motorbike trips favour larger roads),
 * but remain in SPEED_KPH for later use.
 */
export const ROUTING_HIGHWAYS: readonly string[] = [
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
];

/** Maximum distance in meters a point may be snapped to the road graph. */
export const MAX_SNAP_M = 500;

/**
 * Speed (km/h) for riding from the pin to the nearest road node and from the
 * road node to the venue, in alleys that are not in the graph.
 */
export const OFF_ROAD_KPH = 15;

/** Number of candidate graph nodes considered when snapping a point. */
export const K_CANDIDATES = 40;

/** Number of venues returned by the recommendation engine. */
export const TOP_N = 5;
