
import { Pool, types } from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';
import { env } from './env';

// By default `pg` returns BIGINT (int8, OID 20) and NUMERIC (OID 1700) values
// as strings. Our ids, counts, and coordinates are numeric and small enough to
// fit safely in a JS number, so parse them here once for the whole pool.
types.setTypeParser(20, (value: string) => Number(value));
types.setTypeParser(1700, (value: string) => parseFloat(value));

export const pool = new Pool({ connectionString: env.DATABASE_URL });

pool.on('error', (err: Error) => {
  console.error('Postgres pool error:', err.message);
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values);
}
