# Deployment

## Overview

The backend is packaged as a single Docker image (`backend/Dockerfile`, build context
`backend/`). It runs the compiled server (`node dist/server.js`) behind the Express app.
A managed PostgreSQL 16 database stores all data. The frontend is deployed separately
until T1.8, after which Express will serve `frontend/dist` in production.

## Prerequisites

- Access to a container hosting platform (e.g. Render or Railway).
- A managed PostgreSQL 16 database (or a reachable PostgreSQL instance).
- The repository pushed to a Git remote the platform can build from.
- All environment variables below set in the platform dashboard.

TODO: fill in after I deploy (host name, region, plan).

## Environment variables

Names and meanings only; values are set in the platform dashboard, never in the repo.

| Name | Meaning |
| --- | --- |
| `PORT` | TCP port the Express server listens on. |
| `NODE_ENV` | Runtime environment: `development`, `test`, or `production`. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | Secret used to sign access tokens. |
| `JWT_EXPIRES_IN` | Access token lifetime. |
| `CORS_ORIGIN` | Allowed frontend origin for CORS. |

## Steps to create the database and web service

1. Create a managed PostgreSQL 16 database and copy its connection string.
2. Create a web service that builds from this repository:
   - Root directory / build context: `backend`.
   - Dockerfile: `backend/Dockerfile`.
   - Start command: `node dist/server.js` (already the image `CMD`).
   - Set all environment variables above, with `DATABASE_URL` pointing at the managed
     database and `NODE_ENV=production`.
3. Expose the service port (`PORT`) to the public internet.

TODO: fill in after I deploy (exact dashboard steps, platform, region).

## Running schema.sql and the seed against the hosted database

1. Run `database/schema.sql` against the hosted database once (platform SQL console or
   `psql`).
2. Run the seed once with `DATABASE_URL` pointed at the hosted database and the other
   backend env vars set:
   ```
   cd backend
   npm run seed
   ```
3. Verify the roles and test users were created.

TODO: fill in after I deploy (exact console/psql command for the chosen host).

## Verification

- `GET https://<public-url>/api/v1/health` returns `200` with
  `{ "data": { "status": "ok", "db": "up" } }`.

TODO: fill in after I deploy (actual public URL).

## Troubleshooting

- Health returns `503` / `db: "down"`: the app cannot reach PostgreSQL. Check
  `DATABASE_URL`, whether the database allows the service IP, and that `schema.sql` ran.
- Container exits immediately: check the platform logs for the env validation message
  (missing or invalid variables).
- Login or register returns `500`: confirm `JWT_SECRET` and `JWT_EXPIRES_IN` are set.

TODO: fill in after I deploy (platform-specific log locations).
