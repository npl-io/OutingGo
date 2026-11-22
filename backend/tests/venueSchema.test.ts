import { describe, expect, it } from 'vitest';
import {
  venueIdParamsSchema,
  venueListQuerySchema,
  type VenueListQuery,
} from '../src/schemas/venue.schema';

function parseOk(input: Record<string, unknown>): VenueListQuery {
  const result = venueListQuerySchema.safeParse(input);
  if (!result.success) {
    throw new Error(`expected valid input, got: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

function parseFails(input: Record<string, unknown>): void {
  const result = venueListQuerySchema.safeParse(input);
  expect(result.success).toBe(false);
}

describe('venueListQuerySchema defaults', () => {
  it('applies defaults for an empty query', () => {
    const query = parseOk({});
    expect(query.sort).toEqual([{ field: 'name', direction: 'asc' }]);
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.q).toBeUndefined();
    expect(query.categoryId).toBeUndefined();
    expect(query.district).toBeUndefined();
    expect(query.priceLevel).toBeUndefined();
    expect(query.openAt).toBeUndefined();
  });

  it('ignores unknown params', () => {
    const query = parseOk({ foo: 'bar', evil: "'; DROP TABLE venues; --" });
    expect(query.page).toBe(1);
    expect(query).not.toHaveProperty('foo');
  });
});

describe('venueListQuerySchema empty strings', () => {
  it('treats empty strings as absent', () => {
    const query = parseOk({
      q: '',
      categoryId: '',
      district: '',
      priceLevel: '',
      openAt: '',
      sort: '',
      page: '',
      pageSize: '',
    });
    expect(query.q).toBeUndefined();
    expect(query.categoryId).toBeUndefined();
    expect(query.district).toBeUndefined();
    expect(query.priceLevel).toBeUndefined();
    expect(query.openAt).toBeUndefined();
    expect(query.sort).toEqual([{ field: 'name', direction: 'asc' }]);
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
  });

  it('treats whitespace-only text params as absent and trims real values', () => {
    const query = parseOk({ q: '   ', district: '  ' });
    expect(query.q).toBeUndefined();
    expect(query.district).toBeUndefined();

    const trimmed = parseOk({ q: '  pho  ', district: ' District 1 ' });
    expect(trimmed.q).toBe('pho');
    expect(trimmed.district).toBe('District 1');
  });
});

describe('venueListQuerySchema sort', () => {
  it('parses fields with and without a direction', () => {
    expect(parseOk({ sort: 'priceLevel:desc,name' }).sort).toEqual([
      { field: 'priceLevel', direction: 'desc' },
      { field: 'name', direction: 'asc' },
    ]);
    expect(parseOk({ sort: 'createdAt:asc' }).sort).toEqual([
      { field: 'createdAt', direction: 'asc' },
    ]);
    expect(parseOk({ sort: 'district:asc,name:asc,priceLevel:desc' }).sort).toHaveLength(3);
  });

  it('rejects unknown fields, bad directions, bad syntax, repeats and 4 items', () => {
    parseFails({ sort: 'name;DROP' });
    parseFails({ sort: 'name:up' });
    parseFails({ sort: 'address:asc' });
    parseFails({ sort: 'name:asc,name:desc' });
    parseFails({ sort: 'name:asc,district:asc,priceLevel:asc,createdAt:desc' });
    parseFails({ sort: 'name,,district' });
  });
});

describe('venueListQuerySchema priceLevel', () => {
  it('parses comma-separated price levels', () => {
    expect(parseOk({ priceLevel: '1,2' }).priceLevel).toEqual([1, 2]);
    expect(parseOk({ priceLevel: '4' }).priceLevel).toEqual([4]);
    expect(parseOk({ priceLevel: '1,2,3,4' }).priceLevel).toEqual([1, 2, 3, 4]);
  });

  it('rejects out-of-range, repeated and malformed lists', () => {
    parseFails({ priceLevel: '5' });
    parseFails({ priceLevel: '0' });
    parseFails({ priceLevel: '1,1' });
    parseFails({ priceLevel: '1, 2' });
    parseFails({ priceLevel: '1,' });
    parseFails({ priceLevel: 'cheap' });
  });
});

describe('venueListQuerySchema openAt', () => {
  it('accepts 24h HH:MM values', () => {
    expect(parseOk({ openAt: '00:00' }).openAt).toBe('00:00');
    expect(parseOk({ openAt: '23:59' }).openAt).toBe('23:59');
    expect(parseOk({ openAt: '09:05' }).openAt).toBe('09:05');
  });

  it('rejects out-of-range or wrongly formatted times', () => {
    parseFails({ openAt: '24:00' });
    parseFails({ openAt: '23:60' });
    parseFails({ openAt: '9:00' });
    parseFails({ openAt: 'noon' });
  });
});

describe('venueListQuerySchema pagination', () => {
  it('accepts the allowed page sizes', () => {
    for (const pageSize of [10, 20, 50, 100]) {
      expect(parseOk({ pageSize: String(pageSize) }).pageSize).toBe(pageSize);
    }
  });

  it('rejects page sizes outside 10, 20, 50, 100', () => {
    parseFails({ pageSize: '15' });
    parseFails({ pageSize: '0' });
    parseFails({ pageSize: '200' });
    parseFails({ pageSize: 'ten' });
  });

  it('accepts pages >= 1 and rejects 0, negatives and nonsense', () => {
    expect(parseOk({ page: '2' }).page).toBe(2);
    parseFails({ page: '0' });
    parseFails({ page: '-1' });
    parseFails({ page: '1.5' });
    parseFails({ page: 'first' });
  });

  it('accepts a positive integer categoryId only', () => {
    expect(parseOk({ categoryId: '3' }).categoryId).toBe(3);
    parseFails({ categoryId: '0' });
    parseFails({ categoryId: '-3' });
    parseFails({ categoryId: 'abc' });
  });

  it('rejects q longer than 100 characters', () => {
    expect(parseOk({ q: 'a'.repeat(100) }).q).toBe('a'.repeat(100));
    parseFails({ q: 'a'.repeat(101) });
  });
});

describe('venueIdParamsSchema', () => {
  it('accepts a positive integer id', () => {
    const result = venueIdParamsSchema.safeParse({ id: '7' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Number(result.data.id)).toBe(7);
    }
  });

  it('rejects zero, negative, decimal and non-numeric ids', () => {
    for (const id of ['0', '-2', '1.5', 'abc', '']) {
      expect(venueIdParamsSchema.safeParse({ id }).success).toBe(false);
    }
  });
});
