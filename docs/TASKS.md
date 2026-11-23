# TASKS

Status: TODO / DOING / DONE. One task = one fresh AI session = one Git branch.
Rules: see `.continue/rules/project.md` and `docs/PLAN.md`.
---

# M0 — Foundation (condensed: 4 tasks, one commit each)

Existing scaffold in `backend/`, `frontend/`, `database/schema.sql` is kept. Every task starts by AUDITING what exists, then adds only what is missing. Do not rewrite working files.

## T0.1 Repo hygiene and shared tooling
Status: DONE
Branch: `chore/repo-tooling`
Files: `.gitignore`, `.env.example`, `.prettierrc`, `.editorconfig`, `README.md`
Decisions already made:
- Create the canonical root `.env.example`; leave `backend/.env.example` untouched for now.
- Replace the `.continue/` entry in `.gitignore` with `.continue/*` and `!.continue/rules/` (track project rules only).
- Remove the stray `Test` line from `.gitignore`. Keep `build/`.
Do:
- `.gitignore` must ignore: `node_modules`, `dist`, `.env`, `backend/.env`, `*.log`, `backend/data/*.json`, `.vscode/`, `.idea/`.
- Root `.env.example`: `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN` with placeholder values only.
- `.prettierrc` (single quotes, semicolons, 100 columns) and `.editorconfig` (LF, 2 spaces, UTF-8, final newline).
- `README.md`: name, one-paragraph description from the PLAN overview, "Setup coming soon".
Acceptance:
- [ ] `git check-ignore -v backend/.env` shows it is ignored.
- [ ] `git check-ignore -v .continue/rules/project.md` prints nothing (not ignored).
- [ ] `git status` shows no `node_modules` or `.env`.

## T0.2 Backend skeleton and core infrastructure
Status: DONE
Branch: `feat/backend-skeleton`
Files: `backend/package.json`, `backend/tsconfig.json`, `backend/eslint.config.js`, `backend/vitest.config.ts`, `backend/src/app.ts`, `backend/src/server.ts`, `backend/src/config/env.ts`, `backend/src/errors/AppError.ts`, `backend/src/middlewares/{errorHandler,notFound,requestLogger}.ts`
Do:
1. Audit the existing `backend/` against this checklist and list gaps before changing anything: TypeScript `strict`; scripts `dev` (tsx watch), `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `test`; dependencies `express pg zod dotenv helmet cors express-rate-limit bcrypt jsonwebtoken`; dev dependencies `typescript tsx vitest eslint prettier` plus `@types/*`.
2. Fill only the gaps. Keep `app.ts` (exports the Express app) separate from `server.ts` (starts listening).
3. `env.ts`: validate all variables with Zod, exit with a readable message if invalid, export a typed `env`.
4. `AppError(code, httpStatus, message, details?)`, `notFound` (404 in the error envelope), `errorHandler` (error envelope `{ error: { code, message, details? } }`, no stack traces in production), `requestLogger` (timestamp, method, path, status, duration; never log bodies or tokens).
5. `GET /api/v1/health` returns `{ "data": { "status": "ok" } }` (database check is added in T0.3).
6. One unit test for `errorHandler`.
Acceptance:
- [ ] `npm run dev` starts; `GET /api/v1/health` returns 200; an unknown URL returns 404 in the error envelope.
- [ ] Starting without a required env variable fails with a readable message.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass.

## T0.3 Database, DB pool, seed, health check
Status: DONE
Branch: `feat/database`
Files: `docker-compose.yml`, `backend/src/config/db.ts`, `backend/scripts/seed.ts`, `backend/package.json` (script `seed`), update `/health`
Do:
- `docker-compose.yml`: service `db` (`postgres:16`), named volume, credentials from environment variables, healthcheck, and `./database/schema.sql` mounted into `/docker-entrypoint-initdb.d/`.
- Do NOT rewrite `database/schema.sql`; it was already reviewed against `docs/PLAN.md` section 5. If it fails to load, report the exact error and make the smallest fix.
- `db.ts`: export a `pg` Pool from `env.DATABASE_URL` and a small `query` helper. Register type parsers so `BIGINT` (type id 20) returns a `number` and `NUMERIC` (type id 1700) returns a `number` (`parseFloat`). Add a short comment explaining why (`pg` returns them as strings by default).
- Seed script, idempotent (`ON CONFLICT DO NOTHING`): 3 roles (`ADMIN`, `MODERATOR`, `USER`), about 10 categories, users `admin@test.com / Admin123!`, `moderator@test.com / Moderator123!`, `user1@test.com / User123!` through `user10@test.com` (same pattern), passwords hashed with bcrypt. No venues here (M2).
- `/api/v1/health` runs `SELECT 1`: `{ data: { status: "ok", db: "up" } }`, or 503 with `db: "down"`.
Acceptance:
- [ ] `docker compose down -v && docker compose up -d` creates all 11 tables with no errors.
- [ ] `npm run seed` run twice: no errors, no duplicates, 12 users, hashes start with `$2`.
- [ ] `/health` shows `db: "up"`; after `docker compose stop db` it returns 503.
- [ ] By hand in `psql`: duplicate email, rating 6, and a second `LEADER` in one meetup are all rejected.

## T0.4 Deploy the skeleton
Status: DONE
Branch: `chore/deploy-skeleton`
Files: `backend/Dockerfile`, `.dockerignore`, `docs/DEPLOYMENT.md`
Do:
- AI part: multi-stage production `Dockerfile` for the backend (build with `tsc`, run `node dist/server.js`), `.dockerignore`, and a `docs/DEPLOYMENT.md` skeleton with the steps below.
- Manual part (done by me, the AI only documents it): create a managed PostgreSQL and a web service on Render (or Railway) from the repo; set environment variables in the dashboard; run `schema.sql` and the seed once against the hosted database; record the public URL.
Acceptance:
- [ ] `https://<public-url>/api/v1/health` returns `db: "up"`.
- [ ] No secrets appear in the repository.

**M0 checkpoint:** local `docker compose up` works, 11 tables exist, test users are seeded, `/health` is OK on the public URL. (ER diagram moved to M8.)
---

# M1 — Authentication (4 tasks, one commit each)

## T1.1 Backend auth core (validation, repository, service)
Status: DONE
Branch: `feat/auth-core`
Files: `backend/src/middlewares/validate.ts`, `backend/src/schemas/auth.schema.ts`, `backend/src/repositories/userRepository.ts`, `backend/src/services/authService.ts`, `backend/src/config/db.ts`, tests in `backend/tests/`
Do:
- `validate({ body?, params?, query? })`: parse with Zod, replace request data with the parsed result, on failure return `422 VALIDATION_ERROR` with `details` listing each field and a specific message.
- `registerSchema`: email (format; trim and lowercase it), password (at least 8 characters, with a letter and a digit), full name (2-100 characters), optional phone. `loginSchema`: email (trim and lowercase), password.
- `userRepository`: `findByEmail`, `findById`, `create`. Parameterized SQL, camelCase typed results. `password_hash` is returned only by `findByEmail`.
- `authService.register`: duplicate email -> `409 EMAIL_TAKEN`; bcrypt hash; role `USER`.
- `authService.login`: unknown email and wrong password both -> `401 INVALID_CREDENTIALS`; inactive user -> `403 ACCOUNT_DISABLED`; success returns a JWT (payload: user id and role; expiry from env) and the user without `password_hash`.
- `db.ts`: add `pool.on('error', ...)` that logs the message so a dropped connection (Neon can pause) does not crash the server.
Acceptance:
- [ ] Unit tests (repository mocked): valid and invalid register/login input; duplicate email; wrong password; inactive user; successful login.
- [ ] Passwords and hashes are never logged or returned. lint, typecheck, test pass.

## T1.2 Auth endpoints, middlewares, integration tests
Status: DONE
Branch: `feat/auth-endpoints`
Manual first (me): `npm i -D supertest @types/supertest` in `backend/`; create database `outinggo_test` in the Docker Postgres and load `schema.sql` into it; add `TEST_DATABASE_URL` to `backend/.env` and to the root `.env.example`.
Files: `backend/src/routes/authRoutes.ts`, `backend/src/controllers/authController.ts`, `backend/src/middlewares/authenticate.ts`, `backend/src/middlewares/authorize.ts`, `backend/src/types/express.d.ts`, `backend/src/app.ts`, `backend/tests/auth.integration.test.ts`
Do:
- `POST /api/v1/auth/register` (201), `POST /api/v1/auth/login` (200), `GET /api/v1/auth/me` (authenticated). Rate limit register and login (10 requests per 15 minutes per IP). Controllers only call the service.
- `cors` allows only `CORS_ORIGIN`; keep `helmet`.
- `authenticate`: read `Authorization: Bearer <token>`, verify, load the user, `401` for missing/invalid/expired tokens, attach `req.user` (id, role). `authorize(...roles)`: `403 FORBIDDEN` for other roles. No admin endpoint yet: test `authorize` with a dummy route created inside the test.
- Integration tests use `TEST_DATABASE_URL` only, clean tables between tests, never the development database.
Acceptance:
- [ ] Tests cover: register -> login -> `/auth/me`; duplicate email 409; wrong password 401; missing token 401; invalid input 422; wrong role 403.
- [ ] By hand: the 11th rapid login attempt returns 429. lint, typecheck, test pass.

## T1.3 Frontend: foundation and auth pages
Status: DONE
Branch: `feat/frontend-auth`
Manual first (me): `npm i react-router-dom @tanstack/react-query tailwindcss @tailwindcss/vite` in `frontend/`.
Files: `frontend/vite.config.ts`, `frontend/src/api/client.ts`, `frontend/src/auth/AuthContext.tsx`, `frontend/src/auth/ProtectedRoute.tsx`, `frontend/src/pages/{LoginPage,RegisterPage,HomePage}.tsx`, `frontend/src/components/Layout.tsx`, `frontend/src/App.tsx`
Do:
- Check that the Vite scaffold runs first. Remove the demo content. Configure Tailwind and a Vite dev proxy `/api` -> backend.
- `client.ts`: fetch wrapper that adds the Bearer token, unwraps `{ data }` and `{ error }`, throws a typed error.
- `AuthContext`: user and token (localStorage), `login`, `register`, `logout`, loads `/auth/me` on startup. `ProtectedRoute` redirects to `/login`.
- Login and Register forms: specific client-side validation messages, disabled submit and loading state while sending, server errors shown clearly, form data kept on error.
- Responsive layout with navigation that changes by login state and a logout button. `HomePage` placeholder shows name and role.
Acceptance:
- [ ] `npm run lint` and `npm run build` pass in `frontend/`.
- [ ] I can register, log out, log in, and see my name and role; a wrong password shows a clear message; a protected page redirects to `/login` when logged out; usable at 375 px width.

## T1.4 Deploy frontend with backend
Status: DONE
Branch: `chore/deploy-fullstack`
Files: `backend/Dockerfile`, `backend/src/app.ts`, `docs/DEPLOYMENT.md`
Do:
- Production: Express serves `frontend/dist` and returns `index.html` for unknown non-API routes (one service, no CORS issues).
- Update the Dockerfile to build the frontend and the backend (the build context must include `frontend/`; adjust the Render root directory and Dockerfile path accordingly).
- Set `CORS_ORIGIN` on Render to the public URL. Redeploy and update `docs/DEPLOYMENT.md`.
Acceptance:
- [ ] The public URL shows the login page; I can register and log in on the live site as `USER` and as `admin@test.com`.

**M1 checkpoint:** login works as `ADMIN` and `USER` on the public URL; a protected route gives 401/403 correctly; all tests pass.
# M2 — Venues (3 tasks, one commit each)

## T2.1 Real venue data (OSM → database)
Status: DONE
Branch: `feat/venue-seed`
Manual first (me): run the Overpass query given by Claude chat and save the result as `backend/data/venues-osm.json` (gitignored). Create the branch.
Files: `backend/src/lib/osmVenues.ts` (pure functions), `backend/scripts/seed-venues.ts`, `backend/tests/osmVenues.test.ts`, `backend/package.json` (only the script `seed:venues`)
Do:
- Read `backend/scripts/seed.ts` only to get the category slugs. Pure, unit-tested functions in `osmVenues.ts`: `parseOpeningHours(tag?)` (first `HH:MM-HH:MM` match; `24/7` -> 00:00 to 23:59; anything else -> 08:00 to 22:00), `mapCategory(tags)` -> existing category slug or null, `nearestDistrict(lat, lng)` from a constant table of district centers (used only when the OSM tag `addr:district` is missing), `estimatePriceLevel(osmId, categorySlug)` (deterministic 1-3 from a hash of the id, weighted by category; synthetic data), `toVenue(element)` -> record or null (no name or no coordinates -> null; ways use `center`).
- `seed-venues.ts`: read the JSON, map, dedupe by `osm_id` (stored as `node/123`), keep at most 200 venues in total with a per-category cap and a deterministic selection (stable order by hash of osm_id), insert with parameterized SQL using `WHERE NOT EXISTS (SELECT 1 FROM venues WHERE osm_id = $n)` (idempotent, no schema change), print counts per category and per district.
Acceptance:
- [ ] Unit tests pass for the five functions (including `24/7`, missing tag, midnight-crossing hours).
- [ ] `npm run seed:venues` inserts 100-200 venues across at least 5 categories and several districts; a second run inserts 0.
- [ ] By hand: lat is about 10.7-10.9 and lng about 106.6-106.8 (not swapped); some venues have non-default hours.
- [ ] Same seed run once against Neon (me, by hand).

## T2.2 Venues API
Status: DONE
Branch: `feat/venues-api`
Files: `backend/src/schemas/venue.schema.ts`, `backend/src/repositories/venueRepository.ts`, `backend/src/services/venueService.ts`, `backend/src/controllers/venueController.ts`, `backend/src/routes/venueRoutes.ts`, `backend/src/app.ts`, `backend/tests/venues.integration.test.ts`
Do (all routes require `authenticate`):
- `GET /api/v1/categories` -> active categories `{ id, name, slug }`.
- `GET /api/v1/venues/districts` -> sorted distinct districts of active venues (declare before `/venues/:id`).
- `GET /api/v1/venues` query: `q` (case-insensitive on name or address; escape `%` and `_`), `categoryId`, `district`, `priceLevel` (1-4, comma-separated list allowed), `openAt` (`HH:MM`; open when opening <= t < closing, or for midnight-crossing hours t >= opening OR t < closing), `sort` (default `name:asc`; comma-separated `field:dir`, fields `name | district | priceLevel | createdAt`, at most 3, no duplicates), `page` (default 1), `pageSize` (10, 20, 50 or 100; default 20). Only active venues. Response `{ data: Venue[], meta: { page, pageSize, total } }`; a page beyond the end returns empty data with the right total.
- ORDER BY comes from a whitelist map only (never from raw input) with `id` as the final tie-breaker so paging is stable. Venue shape: `{ id, name, address, district, lat, lng, category: { id, name, slug }, priceLevel, openingTime, closingTime, phone, description }`, times as `HH:MM`.
- `GET /api/v1/venues/:id` -> `{ data: { venue } }`; unknown or inactive -> 404 `VENUE_NOT_FOUND`.
- Integration tests (test DB only; `resetDb` empties categories too, so create what you need): each filter alone and combined; pagination meta and a page beyond the end; multi-column sort; `pageSize=15` -> 422; bad sort field -> 422; `q` containing `%`; `openAt` with a 18:00-02:00 venue (open at 23:30 and 01:00, closed at 12:00); no token -> 401; detail 404.
Acceptance:
- [ ] lint, typecheck and tests pass; no string concatenation of user input into SQL.

## T2.3 Venues page
Status: TODO
Branch: `feat/venues-page`
Files: `frontend/src/api/venues.ts`, `frontend/src/hooks/useDebouncedValue.ts`, `frontend/src/pages/VenuesPage.tsx`, `frontend/src/components/{VenueCard,Pagination,Highlight}.tsx`, `frontend/src/components/Layout.tsx` (nav link), `frontend/src/App.tsx` (protected `/venues`)
Do:
- Filters: search box (debounced 300 ms), category select, district select, price-level select, "open at" time input, sort select (name A-Z / Z-A, district then name, price low-high / high-low), page-size select (10, 20, 50, 100). All state lives in the URL query string (`useSearchParams`) so a reload or shared link keeps the filters; any filter change resets to page 1.
- `useQuery` (TanStack Query) with the previous page kept visible while loading. Show: "Showing 21-40 of 156 results", loading state, empty state with a "Clear filters" button, error state with a retry button, venue cards (name with search matches highlighted, category, district, price as 1-4 symbols, hours, address), pagination with previous/next and page numbers.
- Responsive: filters collapse into a vertical stack on mobile; no horizontal scroll at 375 px; labels and `aria-live` for the results count.
Acceptance:
- [ ] `npm run lint` and `npm run build` pass.
- [ ] By hand on the deployed site: every filter, sort, page size and pagination works; reload keeps the state; empty and error states look right.

**M2 checkpoint:** filter + sort + page-size work on the deployed site with 100+ venues.