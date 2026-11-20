# AI Log

## T0.3 Database, DB pool, seed, health check
- Asked: DB pool + type parsers, idempotent seed script, and a DB-backed `/health`.
- Generated: `backend/src/config/db.ts`, `backend/scripts/seed.ts`, `seed` npm script, updated `GET /api/v1/health`.
- Double-check: 503 path after stopping the DB, and the psql constraint checks in the acceptance criteria.

## T1.2 Auth endpoints, middlewares, integration tests
- Asked: write the three integration-test files exactly as planned, then fix any failures without re-planning.
- Generated: `backend/tests/helpers/setupTestEnv.ts`, `backend/tests/helpers/testDb.ts`, `backend/tests/auth.integration.test.ts`; also added missing `authService.getMe` (pre-existing bug blocking `tsc` and `/auth/me`).
- Double-check: `TEST_DATABASE_URL`/`DATABASE_URL` separation, `body.*` field names from `validate`, and Postgres being temporarily unreachable on the first `npm test` run.
