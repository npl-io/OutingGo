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
Status: TODO
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
Status: TODO
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
Status: TODO
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

# M1 — Authentication

## T1.1 Zod schemas and validation middleware
Status: TODO
Branch: `feat/validation`
Files: `backend/src/middlewares/validate.ts`, `backend/src/schemas/auth.schema.ts`
Do:
- `validate({ body?, params?, query? })` middleware: parse with Zod, replace the request data with the parsed result, and on failure return `422 VALIDATION_ERROR` with `details` listing each field and a specific message.
- Schemas: `registerSchema` (email format, password at least 8 characters with a letter and a digit, full name 2-100 characters, optional phone) and `loginSchema`.
Acceptance:
- [ ] Unit tests: valid input passes; invalid email, short password, and a missing field each produce clear messages.

## T1.2 User repository and auth service
Status: TODO
Branch: `feat/auth-service`
Files: `backend/src/repositories/userRepository.ts`, `backend/src/services/authService.ts`, `backend/src/config` (JWT settings only if needed)
Do:
- `userRepository`: `findByEmail`, `findById`, `create` (parameterized SQL, returns typed objects in camelCase, never returns `password_hash` except from `findByEmail` for login).
- `authService.register`: reject duplicate email with `409 EMAIL_TAKEN`, hash with bcrypt, create the user with the `USER` role.
- `authService.login`: verify password; reject unknown email and wrong password with the same `401 INVALID_CREDENTIALS`; reject inactive users with `403 ACCOUNT_DISABLED`; return a JWT (payload: user id and role, expiry from env) and the user without `password_hash`.
Acceptance:
- [ ] Unit tests (repository mocked): duplicate email, wrong password, inactive user, successful login.
- [ ] Passwords are never logged or returned.

## T1.3 Auth routes and controller
Status: TODO
Branch: `feat/auth-endpoints`
Files: `backend/src/routes/authRoutes.ts`, `backend/src/controllers/authController.ts`, `backend/src/app.ts`
Do:
- `POST /api/v1/auth/register` (201), `POST /api/v1/auth/login` (200). Apply `express-rate-limit` to both (for example 10 requests per 15 minutes per IP).
- Controllers only call the service and shape the response.
- Configure `cors` to allow only the frontend origin from env (`CORS_ORIGIN`, add to `.env.example`).
Acceptance:
- [ ] Register then login returns a token (tested by hand with a REST client).
- [ ] The 11th rapid login attempt returns 429.

## T1.4 Authenticate and authorize middlewares, `/auth/me`
Status: TODO
Branch: `feat/auth-middleware`
Files: `backend/src/middlewares/authenticate.ts`, `backend/src/middlewares/authorize.ts`, `backend/src/types/express.d.ts`, update `authRoutes.ts`
Do:
- `authenticate`: read `Authorization: Bearer <token>`, verify, load the user, reject missing/invalid/expired tokens with `401`, attach `req.user` (id, role).
- `authorize(...roles)`: `403 FORBIDDEN` if `req.user.role` is not allowed.
- `GET /api/v1/auth/me` (authenticated) returns the current user without `password_hash`.
- Do not add any admin endpoint yet; test `authorize` through a dummy route created only inside the test.
Acceptance:
- [ ] Unit tests: no token → 401, bad token → 401, wrong role → 403, correct role → passes.
- [ ] `/auth/me` works with a valid token.

## T1.5 Auth integration tests
Status: TODO
Branch: `test/auth-integration`
Files: `backend/tests/auth.integration.test.ts`, test setup/teardown helpers
Do:
- Add `supertest` as a dev dependency (approved). Use a separate test database (for example `outinggo_test`) created from `schema.sql`; clean tables between tests.
- Cover: register → login → `/auth/me`; duplicate email → 409; wrong password → 401; missing token → 401; invalid input → 422.
Acceptance:
- [ ] `npm test` passes locally with the Docker database running.
- [ ] Tests never touch the development database.

## T1.6 Frontend foundation
Status: TODO
Branch: `feat/frontend-foundation`
Files: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/src/api/client.ts`, `frontend/src/auth/AuthContext.tsx`, `frontend/src/auth/ProtectedRoute.tsx`, `frontend/src/App.tsx`
Do:
- First check that the existing Vite scaffold builds and runs.
- Add `react-router-dom`, `@tanstack/react-query`, Tailwind CSS (Vite plugin). Remove the Vite demo content.
- `client.ts`: a small fetch wrapper that adds the Bearer token, unwraps the `{ data }` / `{ error }` envelope, and throws a typed error.
- `AuthContext`: holds the user and token (localStorage), `login`, `register`, `logout`, and loads `/auth/me` on startup.
- `ProtectedRoute` redirects unauthenticated users to `/login`.
- Vite dev proxy: `/api` → the backend.
Acceptance:
- [ ] `npm run dev`, `npm run lint`, and `npm run build` pass in `frontend/`.
- [ ] Visiting a protected route while logged out redirects to `/login`.

## T1.7 Login and Register pages
Status: TODO
Branch: `feat/auth-pages`
Files: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/RegisterPage.tsx`, `frontend/src/components/Layout.tsx`
Do:
- Forms with client-side validation (specific messages), a loading state on the submit button, disabled while submitting, server errors shown clearly, form data preserved on error.
- A simple responsive layout with navigation (links change based on login state, logout button). A hamburger menu on mobile can wait until M6.
- After login, go to a placeholder home page showing the user's name and role.
Acceptance:
- [ ] I can register, log out, log in, and see my name; wrong password shows a clear message.
- [ ] The layout is usable at 375 px width.

## T1.8 Deploy the frontend with the backend
Status: TODO
Branch: `chore/deploy-fullstack`
Files: `backend/Dockerfile`, `backend/src/app.ts` (production static serving), `docs/DEPLOYMENT.md`
Do:
- Build the frontend and serve `frontend/dist` from Express in production (one service, no CORS issues, one free-tier slot). Unknown non-API routes return `index.html`.
- Update the Dockerfile to build both packages.
- Redeploy and update `docs/DEPLOYMENT.md`.
Acceptance:
- [ ] The public URL shows the login page; I can register and log in on the live site.

**M1 checkpoint:** login works as `ADMIN` and `USER` on the public URL; a protected route gives 401/403 correctly; all tests pass.