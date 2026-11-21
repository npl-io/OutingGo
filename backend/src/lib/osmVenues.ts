import { createHash } from 'node:crypto';

export const BBOX = { south: 10.72, west: 106.62, north: 10.89, east: 106.83 };
export const MAX_VENUES = 200;

export type Concept = 'restaurant' | 'fast_food' | 'cafe' | 'bar' | 'dessert' | 'shopping';

export type OsmElementType = 'node' | 'way' | 'relation';

export interface OsmElement {
  type: OsmElementType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface Venue {
  osmId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  concept: Concept;
  priceLevel: number;
  openingTime: string;
  closingTime: string;
  phone: string | null;
  description: string | null;
  district: string;
  hasHours: boolean;
  hasAddress: boolean;
}

interface OpeningHours {
  openingTime: string;
  closingTime: string;
}

const DEFAULT_OPENING_HOURS: OpeningHours = { openingTime: '08:00', closingTime: '22:00' };

const HOURS_PATTERN = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;

// These centers are approximate, chosen to represent the middle of each district.
const DISTRICT_CENTERS: ReadonlyArray<{ label: string; lat: number; lng: number }> = [
  { label: 'Quận 1', lat: 10.7769, lng: 106.7009 },
  { label: 'Quận 3', lat: 10.7843, lng: 106.6844 },
  { label: 'Quận 4', lat: 10.7578, lng: 106.7013 },
  { label: 'Quận 5', lat: 10.754, lng: 106.6673 },
  { label: 'Quận 6', lat: 10.748, lng: 106.635 },
  { label: 'Quận 7', lat: 10.734, lng: 106.722 },
  { label: 'Quận 8', lat: 10.724, lng: 106.6286 },
  { label: 'Quận 10', lat: 10.7727, lng: 106.6679 },
  { label: 'Quận 11', lat: 10.7629, lng: 106.65 },
  { label: 'Quận 12', lat: 10.8672, lng: 106.6413 },
  { label: 'Bình Thạnh', lat: 10.8106, lng: 106.7091 },
  { label: 'Phú Nhuận', lat: 10.7991, lng: 106.6803 },
  { label: 'Tân Bình', lat: 10.8015, lng: 106.6527 },
  { label: 'Tân Phú', lat: 10.79, lng: 106.628 },
  { label: 'Gò Vấp', lat: 10.8386, lng: 106.6652 },
  { label: 'Bình Tân', lat: 10.765, lng: 106.603 },
  { label: 'Thủ Đức', lat: 10.787, lng: 106.75 },
  { label: 'Thủ Đức', lat: 10.85, lng: 106.754 },
  { label: 'Thủ Đức', lat: 10.876, lng: 106.8 },
];

// Price level is synthetic (not from OSM) and derived deterministically from the
// element id. Each tuple is the percent chance of levels 1, 2, 3 and 4.
const PRICE_WEIGHTS: Record<Concept, readonly [number, number, number, number]> = {
  fast_food: [70, 30, 0, 0],
  cafe: [20, 60, 20, 0],
  dessert: [60, 40, 0, 0],
  restaurant: [20, 50, 25, 5],
  bar: [0, 40, 50, 10],
  shopping: [0, 40, 40, 20],
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseRange(tag: string): OpeningHours | null {
  const trimmed = tag.trim();
  if (trimmed === '24/7') {
    return { openingTime: '00:00', closingTime: '23:59' };
  }

  const match = HOURS_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const openingHour = Number(match[1]);
  const openingMinute = Number(match[2]);
  const closingHourRaw = Number(match[3]);
  const closingMinute = Number(match[4]);

  if (openingHour > 23 || openingMinute > 59 || closingHourRaw > 24 || closingMinute > 59) {
    return null;
  }

  const closingHour = closingHourRaw === 24 ? 0 : closingHourRaw;
  const openingTime = `${pad2(openingHour)}:${pad2(openingMinute)}`;
  const closingTime = `${pad2(closingHour)}:${pad2(closingMinute)}`;

  // A venue that never closes (e.g. 00:00-24:00) is treated as 24/7.
  if (openingTime === closingTime) {
    return { openingTime: '00:00', closingTime: '23:59' };
  }

  return { openingTime, closingTime };
}

/**
 * Normalizes an OSM opening_hours tag to opening/closing times as 'HH:MM'.
 * Unparseable or missing values fall back to 08:00-22:00.
 */
export function parseOpeningHours(tag?: string): OpeningHours {
  if (!tag) {
    return { ...DEFAULT_OPENING_HOURS };
  }
  return parseRange(tag) ?? { ...DEFAULT_OPENING_HOURS };
}

function hasOpeningHours(tag?: string): boolean {
  return tag !== undefined && parseRange(tag) !== null;
}

/**
 * Maps OSM amenity/shop tags to one of the app's venue concepts, or null.
 */
export function mapCategory(tags: Record<string, string>): Concept | null {
  switch (tags.amenity) {
    case 'restaurant':
    case 'food_court':
      return 'restaurant';
    case 'fast_food':
      return 'fast_food';
    case 'cafe':
      return 'cafe';
    case 'bar':
    case 'pub':
      return 'bar';
    case 'ice_cream':
      return 'dessert';
    default:
      break;
  }

  switch (tags.shop) {
    case 'mall':
    case 'department_store':
    case 'supermarket':
      return 'shopping';
    default:
      return null;
  }
}

function squaredDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return (lat1 - lat2) ** 2 + (lng1 - lng2) ** 2;
}

/**
 * Returns the label of the district center nearest to the given point,
 * using squared Euclidean distance on (lat, lng).
 */
export function nearestDistrict(lat: number, lng: number): string {
  let bestLabel = '';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const center of DISTRICT_CENTERS) {
    const distance = squaredDistance(lat, lng, center.lat, center.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestLabel = center.label;
    }
  }

  return bestLabel;
}

/**
 * Estimates a deterministic price level (1-4) from a SHA-1 hash of the OSM id.
 */
export function estimatePriceLevel(osmId: string, concept: Concept): number {
  const hash = createHash('sha1').update(osmId).digest('hex');
  const value = parseInt(hash.slice(0, 2), 16) % 100;
  const weights = PRICE_WEIGHTS[concept];

  let cumulative = 0;
  let level = 1;
  for (const weight of weights) {
    cumulative += weight;
    if (value < cumulative) {
      return level;
    }
    level += 1;
  }

  return 4;
}

function resolveCoordinates(element: OsmElement): { lat: number; lng: number } | null {
  if (element.type === 'node') {
    if (typeof element.lat !== 'number' || typeof element.lon !== 'number') {
      return null;
    }
    return { lat: element.lat, lng: element.lon };
  }

  if (
    element.center &&
    typeof element.center.lat === 'number' &&
    typeof element.center.lon === 'number'
  ) {
    return { lat: element.center.lat, lng: element.center.lon };
  }

  return null;
}

function extractPhone(tags: Record<string, string>): string | null {
  const raw = tags.phone ?? tags['contact:phone'];
  if (typeof raw !== 'string') {
    return null;
  }
  const [firstRaw] = raw.split(';');
  const first = firstRaw?.trim() ?? '';
  return first === '' ? null : first.slice(0, 30);
}

function extractDescription(tags: Record<string, string>): string | null {
  const cuisine = tags.cuisine;
  if (typeof cuisine !== 'string' || cuisine.trim() === '') {
    return null;
  }
  return `Cuisine: ${cuisine
    .split(';')
    .map((part) => part.trim())
    .join(', ')}`;
}

function extractAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'] ?? tags['addr:ward'],
  ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Converts an Overpass JSON element into a seedable venue, or null when the
 * element has no usable name, coordinates, category, or lies outside the bbox.
 */
export function toVenue(element: OsmElement): Venue | null {
  const tags = element.tags ?? {};
  const rawName = tags.name;
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return null;
  }

  const coordinates = resolveCoordinates(element);
  if (!coordinates) {
    return null;
  }
  const { lat, lng } = coordinates;
  if (lat < BBOX.south || lat > BBOX.north || lng < BBOX.west || lng > BBOX.east) {
    return null;
  }

  const concept = mapCategory(tags);
  if (!concept) {
    return null;
  }

  const osmId = `${element.type}/${element.id}`;
  const address = extractAddress(tags);
  const hours = parseOpeningHours(tags.opening_hours);

  return {
    osmId,
    name: rawName.trim().slice(0, 200),
    address,
    lat,
    lng,
    concept,
    priceLevel: estimatePriceLevel(osmId, concept),
    openingTime: hours.openingTime,
    closingTime: hours.closingTime,
    phone: extractPhone(tags),
    description: extractDescription(tags),
    district: nearestDistrict(lat, lng),
    hasHours: hasOpeningHours(tags.opening_hours),
    hasAddress: address !== null,
  };
}
