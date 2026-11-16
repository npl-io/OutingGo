# TASKS

Status: TODO / DOING / DONE. One task = one fresh AI session = one Git branch.
Rules: see `.continue/rules/project.md` and `docs/PLAN.md`.
Currently written: M0 and M1. Later milestones are added after these are DONE.

---

# M0 — Foundation

## T0.1 Repo hygiene and shared tooling
Status: TODO
Branch: `chore/repo-tooling`
Files: `.gitignore`, `.env.example`, `.prettierrc`, `.editorconfig`, `README.md`
Do:
- Check which of these files already exist. Only add what is missing or wrong.
- `.gitignore` must ignore: `node_modules`, `dist`, `.env`, `*.log`, `backend/data/*.json` (generated graph), IDE folders.
- `.env.example` lists every variable with a placeholder value (no real secrets). For now: `PORT`, `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`.
- Shared `.prettierrc` (single quotes, semicolons, 100 columns) and `.editorconfig` (LF, 2 spaces).
- `README.md`: project name, one-paragraph description, "setup coming soon" placeholder.
Acceptance:
- [ ] `git status` shows no `node_modules` or `.env` as tracked/untracked-to-add.
- [ ] `.env.example` exists and contains no real secrets.

## T0.2 Backend skeleton
Status: TODO
Branch: `feat/backend-skeleton`
Files: `backend/package.json`, `backend/tsconfig.json`, `backend/eslint.config.js`, `backend/vitest.config.ts`, `backend/src/app.ts`, `backend/src/server.ts`
Do:
- Initialize `backend/` (if not done). TypeScript `strict`, ESM or CommonJS (pick one, keep it consistent).
- Dependencies: `express`, `pg`, `zod`, `dotenv`, `helmet`, `cors`, `express-rate-limit`, `bcrypt`, `jsonwebtoken`. Dev: `typescript`, `tsx`, `vitest`, `eslint` + TypeScript ESLint, `prettier`, and the `@types/*` packages.
- Scripts: `dev` (tsx watch), `build`, `start`, `lint`, `test`, `typecheck` (`tsc --noEmit`).
- `app.ts` creates the Express app (JSON body parser, helmet, cors) and exports it; `server.ts` starts listening. Keep them separate so tests can import `app`.
- `GET /api/v1/health` returns `{ "data": { "status": "ok" } }` (no database yet).
- One Vitest test for the health route is optional here (supertest is added in T1.5).
Acceptance:
- [ ] `npm run dev` starts the server; `GET http://localhost:<PORT>/api/v1/health` returns 200.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` all pass.

## T0.3 Env validation, error handling, request logging
Status: TODO
Branch: `feat/backend-core-infra`
Files: `backend/src/config/env.ts`, `backend/src/errors/AppError.ts`, `backend/src/middlewares/errorHandler.ts`, `backend/src/middlewares/requestLogger.ts`, `backend/src/middlewares/notFound.ts`
Do:
- `env.ts` reads and validates all variables with Zod; exits with a clear message if something is missing. Export a typed `env` object.
- `AppError(code, httpStatus, message, details?)`.
- `notFound` returns a 404 in the error envelope; `errorHandler` converts `AppError` and unexpected errors into `{ error: { code, message, details? } }` (hide stack traces when `NODE_ENV=production`).
- `requestLogger` logs timestamp, method, path, status, duration. Never log bodies, tokens, or passwords.
Acceptance:
- [ ] Starting without `DATABASE_URL` fails with a readable message.
- [ ] `GET /api/v1/does-not-exist` returns 404 in the error envelope.
- [ ] Unit tests for `AppError` handling in `errorHandler` pass.

## T0.4 PostgreSQL with Docker Compose and DB pool
Status: TODO
Branch: `feat/database-connection`
Files: `docker-compose.yml`, `backend/src/config/db.ts`, update `/health`
Do:
- `docker-compose.yml` with service `db` (`postgres:16`), a named volume, credentials from environment variables, port mapping, and a healthcheck. Mount `./database/schema.sql` into `/docker-entrypoint-initdb.d/` (the file can be a placeholder until T0.5).
- `db.ts` exports a `pg` Pool built from `env.DATABASE_URL` and a small `query` helper.
- `/api/v1/health` also runs `SELECT 1` and returns `{ data: { status: "ok", db: "up" } }`, or 503 with `db: "down"` if it fails.
Acceptance:
- [ ] `docker compose up -d` starts PostgreSQL; I can connect with a DB client.
- [ ] `/health` shows `db: "up"`; after `docker compose stop db` it returns 503.

## T0.5 Database schema
Status: TODO
Branch: `feat/database-schema`
Files: `database/schema.sql`
Do:
- Write the full schema exactly as in `docs/PLAN.md` section 5: 8 main tables + 3 junction tables, with primary keys, foreign keys (choose `ON DELETE` deliberately and add a short SQL comment explaining each), NOT NULL, UNIQUE, CHECK constraints, audit columns, and an index on every foreign key.
- Include: partial unique index for one `LEADER` per meetup; unique `invite_code`; `rating` check 1-5; `price_level` check 1-4.
- Do not add tables or columns that are not in the plan. If something seems missing, ask.
Acceptance:
- [ ] `docker compose down -v && docker compose up -d` creates all 11 tables with no errors.
- [ ] Manual checks fail as expected: duplicate email, rating 6, second `LEADER` in a meetup, `status` outside the allowed values.

## T0.6 Seed script (roles, categories, test users)
Status: TODO
Branch: `feat/seed-basic`
Files: `database/seed/seed.ts` (or `backend/scripts/seed.ts`), `backend/package.json` script `seed`
Do:
- Insert roles (`ADMIN`, `MODERATOR`, `USER`), about 10 categories, and test users: `admin@test.com / Admin123!`, `moderator@test.com / Moderator123!`, `user1@test.com / User123!` through `user10@test.com` (same pattern). Hash passwords with bcrypt inside the script.
- The script is idempotent (safe to run twice; use `ON CONFLICT DO NOTHING`).
- Venues are NOT seeded here (that is M2).
Acceptance:
- [ ] `npm run seed` twice in a row causes no errors and no duplicate rows.
- [ ] The `users` table has 12 rows and `password_hash` values start with `$2`.

## T0.7 ER diagram
Status: TODO
Branch: `docs/er-diagram`
Files: `database/ER-diagram.png`
Do:
- Draw the ER diagram of the schema (dbdiagram.io or draw.io, crow's foot notation) and export it as PNG. This is a manual task; the AI can only help write the dbdiagram.io code from `schema.sql`.
Acceptance:
- [ ] All 11 tables, their relationships, and cardinalities are visible and readable.

## T0.8 Deploy the skeleton
Status: TODO
Branch: `chore/deploy-skeleton`
Files: `backend/Dockerfile`, `.dockerignore`, `docs/DEPLOYMENT.md`
Do:
- Write a production `Dockerfile` for the backend (multi-stage build, runs `node dist/server.js`).
- On Render (or Railway): create a managed PostgreSQL and a web service from the repo. Set environment variables in the dashboard (never in code). Run `schema.sql` and the seed once against the hosted database.
- Record each step, plus the final public URL, in `docs/DEPLOYMENT.md` (this feeds the report).
Acceptance:
- [ ] `https://<public-url>/api/v1/health` returns `db: "up"`.
- [ ] No secrets appear in the repository.

**M0 checkpoint:** local `docker compose up` works, all tables exist, test users are seeded, and `/health` is OK on the public URL.

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