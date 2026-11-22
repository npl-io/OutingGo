import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import './helpers/setupTestEnv';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/config/db';
import { closePool, resetDb } from './helpers/testDb';

const PASSWORD = 'Password123';
const EMAIL = 'venue-tester@example.com';
const VENUES_PATH = '/api/v1/venues';

type TestResponse = { status: number; body: unknown };

interface VenueJson {
  id: number;
  name: string;
  address: string;
  district: string | null;
  lat: number;
  lng: number;
  category: { id: number; name: string; slug: string };
  priceLevel: number;
  openingTime: string;
  closingTime: string;
  phone: string | null;
  description: string | null;
}

interface ListJson {
  data: VenueJson[];
  meta: { page: number; pageSize: number; total: number };
}

interface ErrorJson {
  error: { code: string; message: string; details?: { field: string; message: string }[] };
}

let token = '';
let userId = 0;
let passwordHash = '';

async function get(path: string, withToken = true): Promise<TestResponse> {
  let req = request(app).get(path);
  if (withToken) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  const res = await req;
  return { status: res.status, body: res.body };
}

function asList(res: TestResponse): ListJson {
  return res.body as ListJson;
}

function asError(res: TestResponse): ErrorJson {
  return res.body as ErrorJson;
}

function names(res: TestResponse): string[] {
  return asList(res).data.map((venue) => venue.name);
}

function query(params: Record<string, string>): string {
  const search = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `${VENUES_PATH}?${search}`;
}

async function insertTestUser(): Promise<void> {
  // users.id is GENERATED ALWAYS, so it cannot be set explicitly. resetDb
  // restarts identities, which makes the identity hand out the same id again
  // and keeps the token created in beforeAll valid.
  await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role_id, created_by, updated_by, is_active)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'USER'), NULL, NULL, TRUE)`,
    [EMAIL, passwordHash, 'Venue Tester'],
  );
}

async function insertCategory(name: string, slug: string): Promise<number> {
  const res = await pool.query<{ id: number }>(
    'INSERT INTO categories (name, slug, description, is_active) VALUES ($1, $2, $3, TRUE) RETURNING id',
    [name, slug, `${name} venues`],
  );
  return res.rows[0].id;
}

interface VenueInput {
  name: string;
  address: string;
  district: string | null;
  lat: number;
  lng: number;
  categoryId: number;
  priceLevel: number;
  opening: string;
  closing: string;
  isActive?: boolean;
}

async function insertVenue(input: VenueInput): Promise<number> {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO venues (name, address, district, lat, lng, category_id, price_level,
       opening_time, closing_time, phone, description, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.name,
      input.address,
      input.district,
      input.lat,
      input.lng,
      input.categoryId,
      input.priceLevel,
      input.opening,
      input.closing,
      '0900000000',
      `${input.name} description`,
      input.isActive ?? true,
    ],
  );
  return res.rows[0].id;
}

interface Fixtures {
  cafeId: number;
  restaurantId: number;
  ids: Record<string, number>;
}

async function seedFixtures(): Promise<Fixtures> {
  const cafeId = await insertCategory('Cafe', 'cafe');
  const restaurantId = await insertCategory('Restaurant', 'restaurant');

  const ids: Record<string, number> = {};
  const add = async (input: VenueInput): Promise<void> => {
    ids[input.name] = await insertVenue(input);
  };

  await add({
    name: 'Banh Mi Spot',
    address: '12 Le Loi',
    district: 'District 1',
    lat: 10.7731,
    lng: 106.7,
    categoryId: restaurantId,
    priceLevel: 1,
    opening: '07:00',
    closing: '22:00',
  });
  await add({
    name: 'Com Tam Corner',
    address: '45 Nguyen Trai',
    district: 'District 5',
    lat: 10.7549,
    lng: 106.6663,
    categoryId: restaurantId,
    priceLevel: 2,
    opening: '06:00',
    closing: '21:00',
  });
  await add({
    name: 'Pho Noodle House',
    address: '88 Hai Ba Trung',
    district: 'District 1',
    lat: 10.7821,
    lng: 106.7045,
    categoryId: restaurantId,
    priceLevel: 2,
    opening: '18:00',
    closing: '02:00',
  });
  await add({
    name: 'Saigon Pizza',
    address: '22 Pasteur',
    district: 'District 3',
    lat: 10.7802,
    lng: 106.6912,
    categoryId: restaurantId,
    priceLevel: 3,
    opening: '10:00',
    closing: '22:00',
  });
  await add({
    name: 'Fancy Steakhouse',
    address: '1 Dong Khoi',
    district: 'District 1',
    lat: 10.7761,
    lng: 106.7042,
    categoryId: restaurantId,
    priceLevel: 4,
    opening: '11:00',
    closing: '23:00',
  });
  await add({
    name: 'Budget Banh Xeo',
    address: '5 Co Giang',
    district: 'District 5',
    lat: 10.7621,
    lng: 106.6889,
    categoryId: restaurantId,
    priceLevel: 1,
    opening: '08:00',
    closing: '20:00',
  });
  await add({
    name: 'Hidden Alley Cafe',
    address: '77 Ton That Dam',
    district: null,
    lat: 10.7722,
    lng: 106.7005,
    categoryId: cafeId,
    priceLevel: 2,
    opening: '09:00',
    closing: '18:00',
  });
  await add({
    name: 'Quiet Coffee',
    address: '3 Phan Xich Long',
    district: 'District 1',
    lat: 10.7991,
    lng: 106.6852,
    categoryId: cafeId,
    priceLevel: 1,
    opening: '07:00',
    closing: '17:00',
  });
  await add({
    name: 'Old Closed Cafe',
    address: '9 Tran Hung Dao',
    district: 'District 5',
    lat: 10.7681,
    lng: 106.6931,
    categoryId: cafeId,
    priceLevel: 2,
    opening: '09:00',
    closing: '17:00',
    isActive: false,
  });

  return { cafeId, restaurantId, ids };
}

let fixtures: Fixtures;

describe('venues integration', () => {
  beforeAll(async () => {
    await resetDb();
    passwordHash = await bcrypt.hash(PASSWORD, 10);

    const registered = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: EMAIL, password: PASSWORD, fullName: 'Venue Tester' });
    expect(registered.status).toBe(201);
    userId = (registered.body as { data: { user: { id: number } } }).data.user.id;
    // insertTestUser cannot set the id, so the token relies on this being 1.
    expect(userId).toBe(1);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(login.status).toBe(200);
    token = (login.body as { data: { token: string } }).data.token;
  });

  beforeEach(async () => {
    await resetDb();
    // resetDb clears users but restarts identities, so re-create the same user id
    // to keep the token obtained in beforeAll valid for every test.
    await insertTestUser();
    fixtures = await seedFixtures();
  });

  afterAll(async () => {
    await closePool();
  });

  it('rejects every venue endpoint without a token', async () => {
    for (const path of ['/api/v1/categories', `${VENUES_PATH}/districts`, VENUES_PATH, `${VENUES_PATH}/1`]) {
      const res = await get(path, false);
      expect(res.status).toBe(401);
      expect(asError(res).error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('lists active categories with id, name and slug', async () => {
    const res = await get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        { id: fixtures.cafeId, name: 'Cafe', slug: 'cafe' },
        { id: fixtures.restaurantId, name: 'Restaurant', slug: 'restaurant' },
      ],
    });
  });

  it('lists the distinct districts of active venues', async () => {
    const res = await get(`${VENUES_PATH}/districts`);
    expect(res.status).toBe(200);
    expect((res.body as { data: string[] }).data).toEqual(['District 1', 'District 3', 'District 5']);
  });

  it('lists active venues with the default name ordering and meta', async () => {
    const res = await get(VENUES_PATH);
    expect(res.status).toBe(200);

    expect(names(res)).toEqual([
      'Banh Mi Spot',
      'Budget Banh Xeo',
      'Com Tam Corner',
      'Fancy Steakhouse',
      'Hidden Alley Cafe',
      'Pho Noodle House',
      'Quiet Coffee',
      'Saigon Pizza',
    ]);
    expect(asList(res).meta).toEqual({ page: 1, pageSize: 20, total: 8 });
  });

  it('filters by category', async () => {
    const res = await get(query({ categoryId: String(fixtures.cafeId) }));
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Hidden Alley Cafe', 'Quiet Coffee']);
    expect(asList(res).meta.total).toBe(2);
  });

  it('filters by district', async () => {
    const res = await get(query({ district: 'District 5' }));
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Budget Banh Xeo', 'Com Tam Corner']);
  });

  it('filters by a list of price levels', async () => {
    const res = await get(query({ priceLevel: '1,2' }));
    expect(res.status).toBe(200);
    expect(names(res)).toEqual([
      'Banh Mi Spot',
      'Budget Banh Xeo',
      'Com Tam Corner',
      'Hidden Alley Cafe',
      'Pho Noodle House',
      'Quiet Coffee',
    ]);
  });

  it('filters by openAt, including venues whose hours cross midnight', async () => {
    const lateNight = await get(query({ openAt: '23:30' }));
    expect(lateNight.status).toBe(200);
    expect(names(lateNight)).toContain('Pho Noodle House');
    expect(names(lateNight)).not.toContain('Com Tam Corner');

    const afterMidnight = await get(query({ openAt: '01:00' }));
    expect(afterMidnight.status).toBe(200);
    expect(names(afterMidnight)).toEqual(['Pho Noodle House']);

    const midday = await get(query({ openAt: '12:00' }));
    expect(midday.status).toBe(200);
    expect(names(midday)).not.toContain('Pho Noodle House');
    expect(asList(midday).meta.total).toBe(7);

    // Closing time is exclusive.
    const atClosing = await get(query({ openAt: '02:00' }));
    expect(names(atClosing)).not.toContain('Pho Noodle House');
  });

  it('combines filters with sorting', async () => {
    const res = await get(
      query({ district: 'District 1', priceLevel: '1,4', sort: 'priceLevel:desc' }),
    );
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(['Fancy Steakhouse', 'Banh Mi Spot', 'Quiet Coffee']);
  });

  it('matches q case-insensitively on name or address', async () => {
    const byName = await get(query({ q: 'BANH' }));
    expect(byName.status).toBe(200);
    expect(names(byName)).toEqual(['Banh Mi Spot', 'Budget Banh Xeo']);

    const byAddress = await get(query({ q: 'le loi' }));
    expect(byAddress.status).toBe(200);
    expect(names(byAddress)).toEqual(['Banh Mi Spot']);
  });

  it('escapes LIKE wildcards so q="%" matches nothing', async () => {
    const res = await get(query({ q: '%' }));
    expect(res.status).toBe(200);
    expect(asList(res).data).toEqual([]);
    expect(asList(res).meta.total).toBe(0);

    const underscore = await get(query({ q: '_' }));
    expect(underscore.status).toBe(200);
    expect(asList(underscore).meta.total).toBe(0);
  });

  it('treats SQL-looking q input as plain text', async () => {
    const res = await get(query({ q: "' OR 1=1 --" }));
    expect(res.status).toBe(200);
    expect(asList(res).data).toEqual([]);
    expect(asList(res).meta.total).toBe(0);

    const placeholder = await get(query({ q: '$1' }));
    expect(placeholder.status).toBe(200);
    expect(asList(placeholder).meta.total).toBe(0);
  });

  it('sorts by district then name with NULL districts last', async () => {
    const res = await get(query({ sort: 'district:asc,name:asc' }));
    expect(res.status).toBe(200);
    expect(names(res)).toEqual([
      'Banh Mi Spot',
      'Fancy Steakhouse',
      'Pho Noodle House',
      'Quiet Coffee',
      'Saigon Pizza',
      'Budget Banh Xeo',
      'Com Tam Corner',
      'Hidden Alley Cafe',
    ]);
  });

  it('sorts by price level descending', async () => {
    const res = await get(query({ sort: 'priceLevel:desc' }));
    expect(res.status).toBe(200);
    expect(names(res)).toEqual([
      'Fancy Steakhouse',
      'Saigon Pizza',
      'Com Tam Corner',
      'Pho Noodle House',
      'Hidden Alley Cafe',
      'Banh Mi Spot',
      'Budget Banh Xeo',
      'Quiet Coffee',
    ]);
  });

  it('rejects invalid pageSize and sort values with 422', async () => {
    const badPageSize = await get(query({ pageSize: '15' }));
    expect(badPageSize.status).toBe(422);
    expect(asError(badPageSize).error.code).toBe('VALIDATION_ERROR');

    const badSort = await get(query({ sort: 'name;DROP' }));
    expect(badSort.status).toBe(422);
    expect(asError(badSort).error.code).toBe('VALIDATION_ERROR');
    expect(asError(badSort).error.details?.map((detail) => detail.field)).toContain(
      'query.sort',
    );

    const badPriceLevel = await get(query({ priceLevel: '9' }));
    expect(badPriceLevel.status).toBe(422);

    const badOpenAt = await get(query({ openAt: '25:00' }));
    expect(badOpenAt.status).toBe(422);
  });

  it('paginates and returns an empty page past the end with the full total', async () => {
    const firstPage = await get(query({ page: '1', pageSize: '10' }));
    expect(firstPage.status).toBe(200);
    expect(asList(firstPage).data).toHaveLength(8);
    expect(asList(firstPage).meta).toEqual({ page: 1, pageSize: 10, total: 8 });

    const secondPage = await get(query({ page: '2', pageSize: '10' }));
    expect(secondPage.status).toBe(200);
    expect(asList(secondPage).data).toEqual([]);
    expect(asList(secondPage).meta).toEqual({ page: 2, pageSize: 10, total: 8 });

    const farPage = await get(query({ page: '99', pageSize: '10' }));
    expect(farPage.status).toBe(200);
    expect(asList(farPage).data).toEqual([]);
    expect(asList(farPage).meta.total).toBe(8);
  });

  it('excludes inactive venues from the list and returns 404 on detail', async () => {
    const list = await get(VENUES_PATH);
    expect(names(list)).not.toContain('Old Closed Cafe');

    const detail = await get(`${VENUES_PATH}/${fixtures.ids['Old Closed Cafe']}`);
    expect(detail.status).toBe(404);
    expect(asError(detail).error.code).toBe('VENUE_NOT_FOUND');
  });

  it('returns 404 for an unknown venue id and 422 for a malformed id', async () => {
    const unknown = await get(`${VENUES_PATH}/999999`);
    expect(unknown.status).toBe(404);
    expect(asError(unknown).error.code).toBe('VENUE_NOT_FOUND');

    const malformed = await get(`${VENUES_PATH}/abc`);
    expect(malformed.status).toBe(422);
    expect(asError(malformed).error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the full venue shape on detail', async () => {
    const res = await get(`${VENUES_PATH}/${fixtures.ids['Pho Noodle House']}`);
    expect(res.status).toBe(200);

    const venue = (res.body as { data: { venue: VenueJson } }).data.venue;
    expect(Object.keys(venue).sort()).toEqual([
      'address',
      'category',
      'closingTime',
      'description',
      'district',
      'id',
      'lat',
      'lng',
      'name',
      'openingTime',
      'phone',
      'priceLevel',
    ]);
    expect(venue.name).toBe('Pho Noodle House');
    expect(venue.address).toBe('88 Hai Ba Trung');
    expect(venue.district).toBe('District 1');
    expect(venue.category).toEqual({
      id: fixtures.restaurantId,
      name: 'Restaurant',
      slug: 'restaurant',
    });
    expect(venue.priceLevel).toBe(2);
    expect(venue.openingTime).toBe('18:00');
    expect(venue.closingTime).toBe('02:00');
    expect(venue.lat).toBeCloseTo(10.7821, 4);
    expect(venue.lng).toBeCloseTo(106.7045, 4);
    expect(typeof venue.id).toBe('number');
  });
});
