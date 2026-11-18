# Deployment

## Overview

The backend is packaged as a single Docker image (`backend/Dockerfile`, build context
`backend/`) that runs the compiled server (`node dist/server.js`). The web service runs on
Render; the PostgreSQL 16 database runs on Neon. The frontend is deployed separately until
T1.8, after which Express will serve `frontend/dist` in production.

Public URL: https://outinggo-backend.onrender.com

## Hosting decisions

- **Backend on Render (Docker runtime):** deploys directly from the GitHub repository and
  runs the same image I build locally.
- **Database on Neon:** a separate database host keeps the data independent of the web
  host and available through the grading period. I first deployed with a Render database,
  then migrated to Neon on 2026-11-18 by loading the schema and seed again and changing
  only `DATABASE_URL` (no code change).
- Free tiers: the Render web service sleeps when idle, and Neon may pause the database
  when idle. The first request after a pause can take several seconds.

## Prerequisites

- A GitHub repository with the code on `main`.
- A Render account (web service) and a Neon account (PostgreSQL 16).
- Docker installed locally (used to run `psql` without a local PostgreSQL install).

## Environment variables

Names and meaning only. Values are set in the Render dashboard and never committed.

| Name | Meaning |
|---|---|
| NODE_ENV | `production` |
| DATABASE_URL | Neon connection string (with `sslmode=require`) |
| JWT_SECRET | Random secret for signing tokens, different from local |
| JWT_EXPIRES_IN | Token lifetime, e.g. `7d` |
| CORS_ORIGIN | Allowed frontend origin |

## Deployment steps

1. Push the repository to GitHub (`main`).
2. Create a Neon project (PostgreSQL 16, region [fill in]) and copy its connection string.
3. Create a Render web service from the repository: runtime Docker, root directory
   `backend`, health check path `/api/v1/health`.
4. Set the environment variables above in the Render dashboard.
5. Load the schema into Neon from my machine, without a local `psql`:
   ```
   docker run --rm -v "${PWD}/database:/sql" postgres:16 psql "$url" -f /sql/schema.sql
   ```
   where `$url` is the Neon connection string kept only in the terminal session.
6. Run the seed against Neon from my machine with the same environment variables set
   temporarily in the terminal session: `cd backend; npm run seed` ([adjust if you did it differently]).
7. Verify `GET /api/v1/health` returns `{ "data": { "status": "ok", "db": "up" } }`.

## Verification

- `GET https://outinggo-backend.onrender.com/api/v1/health` returns 200 with
  `status: "ok"` and `db: "up"`.
- The `users` table on Neon contains 12 seeded users.

## Problems and fixes

- **bcrypt on Alpine:** checked that the prebuilt musl binary loads inside the image with
  `docker run --rm outinggo-backend node -e "require('bcrypt')"`.
- **External database connection:** the hosted database requires SSL, so the connection
  string includes `sslmode=require`.
- **Cold start:** the first request after idle time is slow on the free tiers; later
  requests respond normally.

## Troubleshooting

- Health returns 503 with `db: "down"`: the app cannot reach PostgreSQL. Check
  `DATABASE_URL`, that the Neon project is active, and that the schema was loaded.
- Container exits immediately: read the Render logs for the environment validation message
  (a missing or invalid variable).
- Login or register returns 500: confirm `JWT_SECRET` and `JWT_EXPIRES_IN` are set.