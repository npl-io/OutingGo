# AI Log

## T0.3 Database, DB pool, seed, health check
- Asked: DB pool + type parsers, idempotent seed script, and a DB-backed `/health`.
- Generated: `backend/src/config/db.ts`, `backend/scripts/seed.ts`, `seed` npm script, updated `GET /api/v1/health`.
- Double-check: 503 path after stopping the DB, and the psql constraint checks in the acceptance criteria.
