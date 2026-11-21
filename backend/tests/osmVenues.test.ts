import { describe, expect, it } from 'vitest';
import {
  BBOX,
  estimatePriceLevel,
  mapCategory,
  nearestDistrict,
  parseOpeningHours,
  toVenue,
  type Concept,
  type OsmElement,
} from '../src/lib/osmVenues';

describe('parseOpeningHours', () => {
  it('parses all supported formats and falls back to defaults', () => {
    expect(parseOpeningHours('24/7')).toEqual({ openingTime: '00:00', closingTime: '23:59' });
    expect(parseOpeningHours('Mo-Su 08:00-22:00')).toEqual({
      openingTime: '08:00',
      closingTime: '22:00',
    });
    expect(parseOpeningHours('18:00-02:00')).toEqual({
      openingTime: '18:00',
      closingTime: '02:00',
    });
    expect(parseOpeningHours('00:00-24:00')).toEqual({
      openingTime: '00:00',
      closingTime: '23:59',
    });
    expect(parseOpeningHours('07:30-24:00')).toEqual({
      openingTime: '07:30',
      closingTime: '00:00',
    });
  });

  it('falls back to 08:00-22:00 for missing or invalid tags', () => {
    const fallback = { openingTime: '08:00', closingTime: '22:00' };
    expect(parseOpeningHours()).toEqual(fallback);
    expect(parseOpeningHours(undefined)).toEqual(fallback);
    expect(parseOpeningHours('garbage')).toEqual(fallback);
    expect(parseOpeningHours('25:00-26:00')).toEqual(fallback);
  });
});

describe('mapCategory', () => {
  it('maps amenity values', () => {
    expect(mapCategory({ amenity: 'restaurant' })).toBe('restaurant');
    expect(mapCategory({ amenity: 'food_court' })).toBe('restaurant');
    expect(mapCategory({ amenity: 'fast_food' })).toBe('fast_food');
    expect(mapCategory({ amenity: 'cafe' })).toBe('cafe');
    expect(mapCategory({ amenity: 'bar' })).toBe('bar');
    expect(mapCategory({ amenity: 'pub' })).toBe('bar');
    expect(mapCategory({ amenity: 'ice_cream' })).toBe('dessert');
  });

  it('maps shop values', () => {
    expect(mapCategory({ shop: 'mall' })).toBe('shopping');
    expect(mapCategory({ shop: 'department_store' })).toBe('shopping');
    expect(mapCategory({ shop: 'supermarket' })).toBe('shopping');
  });

  it('returns null for unrelated tags', () => {
    expect(mapCategory({ amenity: 'hospital' })).toBeNull();
    expect(mapCategory({})).toBeNull();
  });
});

describe('nearestDistrict', () => {
  it('finds Quận 1 near its center', () => {
    expect(nearestDistrict(10.7769, 106.7009)).toBe('Quận 1');
  });

  it('finds Thủ Đức near the eastern center', () => {
    expect(nearestDistrict(10.8777, 106.8006)).toBe('Thủ Đức');
  });
});

describe('estimatePriceLevel', () => {
  const ALLOWED: Record<Concept, number[]> = {
    fast_food: [1, 2],
    cafe: [1, 2, 3],
    dessert: [1, 2],
    restaurant: [1, 2, 3, 4],
    bar: [2, 3, 4],
    shopping: [2, 3, 4],
  };

  it('is deterministic', () => {
    const concepts = Object.keys(ALLOWED) as Concept[];
    for (const concept of concepts) {
      for (const id of ['node/1', 'node/2', 'way/999', 'relation/42']) {
        expect(estimatePriceLevel(id, concept)).toBe(estimatePriceLevel(id, concept));
      }
    }
  });

  it('stays within the allowed levels for each concept', () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      ids.push(`node/${i}`);
    }

    const concepts = Object.keys(ALLOWED) as Concept[];
    for (const concept of concepts) {
      for (const id of ids) {
        expect(ALLOWED[concept]).toContain(estimatePriceLevel(id, concept));
      }
    }
  });
});

describe('toVenue', () => {
  it('builds a venue from a node', () => {
    const element: OsmElement = {
      type: 'node',
      id: 123,
      lat: 10.7769,
      lon: 106.7009,
      tags: {
        name: '  Pho Hoa  ',
        amenity: 'restaurant',
        'addr:housenumber': '123',
        'addr:street': 'Le Loi',
        'addr:ward': 'Ben Nghe',
        phone: '0912345678;0281234567',
        cuisine: 'vietnamese;noodles',
        opening_hours: 'Mo-Su 08:00-22:00',
      },
    };

    const venue = toVenue(element);
    expect(venue).not.toBeNull();
    expect(venue?.osmId).toBe('node/123');
    expect(venue?.name).toBe('Pho Hoa');
    expect(venue?.address).toBe('123, Le Loi, Ben Nghe');
    expect(venue?.lat).toBe(10.7769);
    expect(venue?.lng).toBe(106.7009);
    expect(venue?.concept).toBe('restaurant');
    expect(venue?.priceLevel).toBeGreaterThanOrEqual(1);
    expect(venue?.priceLevel).toBeLessThanOrEqual(4);
    expect(venue?.openingTime).toBe('08:00');
    expect(venue?.closingTime).toBe('22:00');
    expect(venue?.phone).toBe('0912345678');
    expect(venue?.description).toBe('Cuisine: vietnamese, noodles');
    expect(venue?.district).toBe('Quận 1');
    expect(venue?.hasHours).toBe(true);
    expect(venue?.hasAddress).toBe(true);
  });

  it('builds a venue from a way with center coordinates', () => {
    const element: OsmElement = {
      type: 'way',
      id: 456,
      center: { lat: 10.85, lon: 106.76 },
      tags: { name: 'Way Cafe', amenity: 'cafe' },
    };

    const venue = toVenue(element);
    expect(venue).not.toBeNull();
    expect(venue?.osmId).toBe('way/456');
    expect(venue?.lat).toBe(10.85);
    expect(venue?.lng).toBe(106.76);
    expect(venue?.address).toBeNull();
    expect(venue?.hasAddress).toBe(false);
  });

  it('returns null when the element has no name', () => {
    const element: OsmElement = {
      type: 'node',
      id: 1,
      lat: 10.77,
      lon: 106.7,
      tags: { amenity: 'cafe' },
    };
    expect(toVenue(element)).toBeNull();
  });

  it('returns null when the point is outside the bbox', () => {
    const element: OsmElement = {
      type: 'node',
      id: 2,
      lat: BBOX.north + 1,
      lon: 106.7,
      tags: { name: 'Far Away', amenity: 'cafe' },
    };
    expect(toVenue(element)).toBeNull();
  });
});
