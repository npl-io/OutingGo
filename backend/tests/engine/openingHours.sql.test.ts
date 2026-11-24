import '../helpers/setupTestEnv';
import { afterAll, describe, expect, it } from 'vitest';
import { query } from '../../src/config/db';
import { closePool } from '../helpers/testDb';
import { isOpenAt, parseTimeToMinute } from '../../src/engine/openingHours';

const OPENING_TIMES = ['00:00', '02:00', '06:30', '08:00', '18:00', '22:00', '23:59'];
const CHECK_TIMES = ['00:00', '01:59', '02:00', '06:30', '12:00', '18:00', '21:59', '22:00', '23:59'];

// Same boolean condition as the openAt filter in venueRepository.ts.
const OPEN_AT_SQL = `SELECT (
  ($1::time <= $2::time AND $3::time >= $1::time AND $3::time < $2::time)
  OR ($1::time > $2::time AND ($3::time >= $1::time OR $3::time < $2::time))
) AS open`;

describe('isOpenAt matches the SQL openAt rule', () => {
  afterAll(async () => {
    await closePool();
  });

  it('agrees for every opening, closing and time combination', async () => {
    let compared = 0;
    for (const opening of OPENING_TIMES) {
      for (const closing of OPENING_TIMES) {
        for (const at of CHECK_TIMES) {
          const result = await query<{ open: boolean }>(OPEN_AT_SQL, [opening, closing, at]);
          const expected = isOpenAt(
            parseTimeToMinute(opening),
            parseTimeToMinute(closing),
            parseTimeToMinute(at),
          );
          expect(result.rows[0]?.open, `${opening}-${closing} at ${at}`).toBe(expected);
          compared += 1;
        }
      }
    }
    expect(compared).toBe(OPENING_TIMES.length * OPENING_TIMES.length * CHECK_TIMES.length);
  });
});
