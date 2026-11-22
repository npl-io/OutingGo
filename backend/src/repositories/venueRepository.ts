import { query } from '../config/db';
import type { SortField, VenueListQuery } from '../schemas/venue.schema';

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Venue {
  id: number;
  name: string;
  address: string;
  district: string | null;
  lat: number;
  lng: number;
  category: Category;
  priceLevel: number;
  openingTime: string;
  closingTime: string;
  phone: string | null;
  description: string | null;
}

interface VenueRow {
  id: number;
  name: string;
  address: string;
  district: string | null;
  lat: number;
  lng: number;
  category_id: number;
  category_name: string;
  category_slug: string;
  price_level: number;
  opening_time: string;
  closing_time: string;
  phone: string | null;
  description: string | null;
}

const VENUE_SELECT = `
  SELECT v.id, v.name, v.address, v.district, v.lat, v.lng,
         c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
         v.price_level,
         to_char(v.opening_time, 'HH24:MI') AS opening_time,
         to_char(v.closing_time, 'HH24:MI') AS closing_time,
         v.phone, v.description
  FROM venues v
  JOIN categories c ON c.id = v.category_id`;

// ORDER BY is built only from this whitelist, never from user input.
const SORT_COLUMNS: Record<SortField, string> = {
  name: 'v.name',
  district: 'v.district',
  priceLevel: 'v.price_level',
  createdAt: 'v.created_at',
};

function toVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    district: row.district,
    lat: row.lat,
    lng: row.lng,
    category: { id: row.category_id, name: row.category_name, slug: row.category_slug },
    priceLevel: row.price_level,
    openingTime: row.opening_time,
    closingTime: row.closing_time,
    phone: row.phone,
    description: row.description,
  };
}

// PostgreSQL LIKE uses backslash as the default escape character.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function buildWhere(filters: VenueListQuery): { where: string; params: unknown[] } {
  const conditions = ['v.is_active = TRUE', 'c.is_active = TRUE'];
  const params: unknown[] = [];
  // Placeholders are built from the array length only; values always go in params.
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.q !== undefined) {
    const pattern = bind(`%${escapeLike(filters.q)}%`);
    conditions.push(`(v.name ILIKE ${pattern}::text OR v.address ILIKE ${pattern}::text)`);
  }
  if (filters.categoryId !== undefined) {
    conditions.push(`v.category_id = ${bind(filters.categoryId)}::bigint`);
  }
  if (filters.district !== undefined) {
    conditions.push(`v.district = ${bind(filters.district)}::text`);
  }
  if (filters.priceLevel !== undefined) {
    conditions.push(`v.price_level = ANY(${bind(filters.priceLevel)}::smallint[])`);
  }
  if (filters.openAt !== undefined) {
    const t = `${bind(filters.openAt)}::time`;
    conditions.push(
      `((v.opening_time <= v.closing_time AND ${t} >= v.opening_time AND ${t} < v.closing_time)` +
        ` OR (v.opening_time > v.closing_time AND (${t} >= v.opening_time OR ${t} < v.closing_time)))`,
    );
  }

  return { where: conditions.join(' AND '), params };
}

function buildOrderBy(sort: VenueListQuery['sort']): string {
  const items = sort.map((item) => {
    const direction = item.direction === 'desc' ? 'DESC' : 'ASC';
    const nulls = item.field === 'district' ? ' NULLS LAST' : '';
    return `${SORT_COLUMNS[item.field]} ${direction}${nulls}`;
  });
  items.push('v.id ASC');
  return items.join(', ');
}

export async function listVenues(
  filters: VenueListQuery,
): Promise<{ venues: Venue[]; total: number }> {
  const { where, params } = buildWhere(filters);

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM venues v JOIN categories c ON c.id = v.category_id WHERE ${where}`,
    params,
  );

  const limit = `$${params.length + 1}::int`;
  const offset = `$${params.length + 2}::bigint`;
  const rows = await query<VenueRow>(
    `${VENUE_SELECT} WHERE ${where} ORDER BY ${buildOrderBy(filters.sort)} LIMIT ${limit} OFFSET ${offset}`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  );

  return { venues: rows.rows.map(toVenue), total: countResult.rows[0]?.total ?? 0 };
}

export async function findActiveVenueById(id: number): Promise<Venue | null> {
  const result = await query<VenueRow>(
    `${VENUE_SELECT} WHERE v.id = $1::bigint AND v.is_active = TRUE AND c.is_active = TRUE`,
    [id],
  );
  const row = result.rows[0];
  return row === undefined ? null : toVenue(row);
}

export async function listActiveCategories(): Promise<Category[]> {
  const result = await query<Category>(
    'SELECT id, name, slug FROM categories WHERE is_active = TRUE ORDER BY name ASC, id ASC',
  );
  return result.rows;
}

export async function listActiveDistricts(): Promise<string[]> {
  const result = await query<{ district: string }>(
    'SELECT DISTINCT district FROM venues WHERE is_active = TRUE AND district IS NOT NULL ORDER BY district ASC',
  );
  return result.rows.map((row) => row.district);
}
