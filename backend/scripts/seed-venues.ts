import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { QueryResultRow } from 'pg';
import { pool } from '../src/config/db';
import {
  MAX_VENUES,
  toVenue,
  type Concept,
  type OsmElement,
  type Venue,
} from '../src/lib/osmVenues';

interface OverpassFile {
  elements: OsmElement[];
}

interface CategoryRow extends QueryResultRow {
  id: number;
  slug: string;
}

const CONCEPT_ORDER: Concept[] = ['restaurant', 'fast_food', 'cafe', 'bar', 'dessert', 'shopping'];

const SLUG_BY_CONCEPT: Record<Concept, string> = {
  restaurant: 'restaurants',
  fast_food: 'fast-food',
  cafe: 'cafes',
  bar: 'bars',
  dessert: 'dessert',
  shopping: 'shopping',
};

function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function rankCandidates(candidates: Venue[]): Record<Concept, Venue[]> {
  const grouped: Record<Concept, Venue[]> = {
    restaurant: [],
    fast_food: [],
    cafe: [],
    bar: [],
    dessert: [],
    shopping: [],
  };

  for (const venue of candidates) {
    grouped[venue.concept].push(venue);
  }

  for (const concept of CONCEPT_ORDER) {
    grouped[concept].sort((a, b) => {
      if (a.hasHours !== b.hasHours) {
        return a.hasHours ? -1 : 1;
      }
      if (a.hasAddress !== b.hasAddress) {
        return a.hasAddress ? -1 : 1;
      }
      return sha1Hex(a.osmId).localeCompare(sha1Hex(b.osmId));
    });
  }

  return grouped;
}

function selectRoundRobin(ranked: Record<Concept, Venue[]>, limit: number): Venue[] {
  const queues = CONCEPT_ORDER.map((concept) => [...ranked[concept]]);
  const selected: Venue[] = [];

  while (selected.length < limit) {
    let progressed = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        selected.push(next);
        progressed = true;
        if (selected.length >= limit) {
          break;
        }
      }
    }
    if (!progressed) {
      break;
    }
  }

  return selected;
}

async function seedVenues(): Promise<void> {
  const filePath = path.resolve(process.cwd(), 'data', 'venues-osm.json');
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as OverpassFile;

  const seen = new Set<string>();
  const candidates: Venue[] = [];
  for (const element of parsed.elements) {
    const venue = toVenue(element);
    if (!venue || seen.has(venue.osmId)) {
      continue;
    }
    seen.add(venue.osmId);
    candidates.push(venue);
  }

  const categoriesResult = await pool.query<CategoryRow>('SELECT id, slug FROM categories');
  const categoryIdByConcept = new Map<Concept, number>();
  for (const concept of CONCEPT_ORDER) {
    const slug = SLUG_BY_CONCEPT[concept];
    const category = categoriesResult.rows.find((row) => row.slug === slug);
    if (!category) {
      console.warn(`Skipping concept "${concept}": no category with slug "${slug}"`);
      continue;
    }
    categoryIdByConcept.set(concept, category.id);
  }

  const insertable = candidates.filter((venue) => categoryIdByConcept.has(venue.concept));
  const ranked = rankCandidates(insertable);
  const selected = selectRoundRobin(ranked, MAX_VENUES);

  const client = await pool.connect();
  let inserted = 0;
  const perCategory = new Map<Concept, number>();
  const perDistrict = new Map<string, number>();

  try {
    await client.query('BEGIN');
    for (const venue of selected) {
      const categoryId = categoryIdByConcept.get(venue.concept);
      if (categoryId === undefined) {
        continue;
      }

      const result = await client.query<QueryResultRow>(
        `INSERT INTO venues (name, address, district, lat, lng, category_id, price_level, opening_time, closing_time, phone, description, osm_id)
SELECT $1::varchar, $2::text, $3::varchar, $4::numeric, $5::numeric, $6::bigint, $7::smallint, $8::time, $9::time, $10::varchar, $11::text, $12::varchar
WHERE NOT EXISTS (SELECT 1 FROM venues WHERE osm_id = $12::varchar)`,
        [
          venue.name,
          venue.address,
          venue.district,
          venue.lat,
          venue.lng,
          categoryId,
          venue.priceLevel,
          venue.openingTime,
          venue.closingTime,
          venue.phone,
          venue.description,
          venue.osmId,
        ],
      );

      const count = result.rowCount ?? 0;
      if (count > 0) {
        inserted += count;
        perCategory.set(venue.concept, (perCategory.get(venue.concept) ?? 0) + 1);
        perDistrict.set(venue.district, (perDistrict.get(venue.district) ?? 0) + 1);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(`Candidates found: ${candidates.length}`);
  console.log(`Selected: ${selected.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already present): ${selected.length - inserted}`);

  console.log('Per category:');
  for (const concept of CONCEPT_ORDER) {
    console.log(`  ${concept}: ${perCategory.get(concept) ?? 0}`);
  }

  console.log('Per district:');
  const districts = [...perDistrict.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [district, count] of districts) {
    console.log(`  ${district}: ${count}`);
  }
}

async function main(): Promise<void> {
  try {
    await seedVenues();
  } catch (error) {
    console.error('Venue seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
