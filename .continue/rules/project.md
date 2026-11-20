# Group Meetup Planner — Project Rules

## Project

Web app for a group of 3-5 friends in Ho Chi Minh City. Each member pins a start location on a map. The backend computes realistic motorbike travel times over the OpenStreetMap road network, drops venues that are closed at the meeting time, and ranks venues (smallest total travel time, or smallest gap between members). The group votes and the Leader confirms the final venue. University course final project (Web Application Development): graded on full-stack completeness AND on the routing engine.

## Read before every task

1. Only the section of docs/PLAN.md that the task names (not the whole file), and the task text I give you.
2. Only the files the task lists plus the files they directly import. Never read node_modules, schema.sql, seed scripts, or config files unless the task names them.
3. database/schema.sql and docs/API.md are the contracts when the task touches them.

If the code, the plan, or my instruction conflict, STOP and ask. Do not silently pick one.

## Rule #1: core first

- Build in the order of the milestones in docs/PLAN.md. The core flow (login → create meetup → join → pin → recommend → vote → confirm) must work end to end before anything else.
- Do NOT implement anything from a later milestone, even if it looks easy or "would be nice".
- No speculative abstraction: no generic frameworks, plugin systems, caching layers, queues, microservices, DI containers, or extra config layers. Simple, direct code. Three similar lines are better than a premature abstraction.
- Do not add a dependency without asking first. Justify it in one sentence.
- Make the smallest change that satisfies the task's acceptance criteria. Do not refactor unrelated code.

## Stack

- Backend: Node.js 20+, Express, TypeScript (strict), pg with raw parameterized SQL (no ORM), Zod, jsonwebtoken, bcrypt, helmet, cors, express-rate-limit, dotenv, Vitest.
- Frontend: React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Leaflet (react-leaflet).
- Database: PostgreSQL 16 (Docker Compose locally).
- Tooling: ESLint + Prettier.

## Repo facts (do not re-discover these)

- backend is CommonJS (`"type": "commonjs"`) with `esModuleInterop` on: `import express from 'express'` works. Do not use `import.meta` or `__dirname`; use `process.cwd()` (scripts run with `backend/` as the working directory).
- Express 5: async handlers and middleware that throw are forwarded to the error handler automatically. `req.query` is read-only (store the parsed query in `res.locals.query`).
- Zod 4 API (`error.issues`), bcrypt 6, express-rate-limit 8 (option `limit`, not `max`). Vitest: import `describe`, `it`, `expect` from 'vitest'; tests live in `backend/tests/*.test.ts`.
- `config/db.ts` exports `pool` and `query`; BIGINT and NUMERIC are parsed to numbers. Read env only through `config/env.ts`.
- Integration tests use ONLY the database in TEST_DATABASE_URL (its name must end with `_test`), never the dev database.
- Backend scripts: `npm run dev`, `lint`, `typecheck`, `test`, `seed`.
- Auth already exists: `authService` (register, login, getMe, verifyToken), `authenticate` / `authorize` / `rateLimiters` middlewares, routes under `/api/v1/auth`. Reuse them; do not re-implement.
- Validation error details look like `{ field: "body.email", message }` (source prefix included). Login returns `{ data: { token, user } }`; register returns `{ data: { user } }`.
- - frontend/ is ESM (Vite + React + TypeScript strict); here `import.meta.env` is fine. Scripts: `npm run dev` (port 5173), `lint`, `build`. Tailwind CSS v4 via `@tailwindcss/vite`: src/index.css starts with `@import "tailwindcss";`; there is no tailwind.config.js and no postcss config.
- API base path is `/api/v1`, reached through the Vite dev proxy (`/api` → http://localhost:3000); in production Express serves the frontend from the same origin. The token is kept in localStorage under `outinggo.token`.
- Component files export only components (eslint react-refresh rule): keep contexts and hooks in separate files.
- The agent terminal starts at the repo root, which has no package.json. Always run npm with `npm --prefix backend run <script>` or `npm --prefix frontend run <script>` (PowerShell, no &&).

## Architecture rules

Layers: routes → middlewares → controllers → services → repositories.

- routes: only wire path + middlewares + Zod schema + controller.
- controllers: read validated input, call ONE service, shape the HTTP response. No SQL. No business rules.
- services: business rules, meetup-level permission checks, transactions. No req/res. No SQL strings (call repositories).
- repositories: all SQL lives here. Parameterized only (`$1, $2`). Map snake_case rows to camelCase typed objects.
- engine/ (graph, dijkstra, kdtree, heap, trie, unionFind, scoring): pure TypeScript. No Express, no DB, no file/network I/O. Must be unit tested.

API conventions:

- Base path `/api/v1`. Resource URLs `/api/v1/resources/:id`. Status codes: 200, 201, 204, 400, 401, 403, 404, 409, 422, 500.
- Success: `{ "data": ..., "meta": { ... } }`. Error: `{ "error": { "code": "STRING_CODE", "message": "human readable", "details": [...] } }`.
- Throw `AppError(code, httpStatus, message)` in services; ONE central error handler turns it into the error envelope. Never leak stack traces in production.
- Lists use `page` and `pageSize` (allowed: 10, 20, 50, 100) and return `meta: { page, pageSize, total }`.

## Code rules

- TypeScript strict. No `any` (use `unknown` and narrow). Explicit return types on exported functions.
- Naming: camelCase in code, snake_case in the database, PascalCase for types/components.
- Keep files under about 300 lines; split by responsibility.
- Comments only for non-obvious WHY. JSDoc on exported engine functions. No commented-out code. No leftover TODOs.
- Time: store `timestamptz` (UTC). Business time zone is `Asia/Ho_Chi_Minh`; compare opening hours in that zone.
- No hard-coded secrets, URLs, or magic numbers. Read env through `config/env.ts` (validated with Zod). Keep `.env.example` current. Tunable engine constants live in one `engine/config.ts`.

## Security rules (non-negotiable)

- Passwords: bcrypt (cost 10-12). Never log or return `password_hash`.
- SQL: parameterized queries only. Never concatenate user input into SQL.
- Validate EVERY input with Zod on the server (body, params, query). Never trust the client.
- Auth: JWT in the `Authorization: Bearer` header. `authenticate` on every non-public route. `authorize(...roles)` for account-level roles.
- Meetup-level permissions (Leader vs Member) are checked in services, not only in the UI.
- Use `helmet`, configured CORS, and rate limiting on login/register.
- Never put secrets, tokens, or personal data in logs.

## Domain rules (never break)

- Roles, two levels. Account: `ADMIN`, `MODERATOR`, `USER`. Meetup: `LEADER`, `MEMBER` (stored in `meetup_participants`).
- A meetup has at most 5 participants (the Leader counts). Enforce in the service, inside a transaction.
- Meetup status: `OPEN → CONFIRMED → COMPLETED`, or `OPEN/CONFIRMED → CANCELLED`. No other transitions.
- Only the Leader can: edit the meetup, remove members, run the recommendation, confirm a venue, cancel. Leader cancel is immediate. No delegation.
- Voting is allowed only while `OPEN`. Confirming locks voting. One vote per member per meetup (changing a vote replaces it).
- Venues closed at the meeting time are excluded from recommendations. Opening hours can cross midnight.
- A venue with upcoming meetups (OPEN/CONFIRMED, meeting time in the future) cannot be deleted. Venues and users use soft delete (`is_active`).
- Only participants of a `COMPLETED` meetup can review the venue that was confirmed, once per meetup.
- Routing: run ONE single-source Dijkstra per member (not "multi-source"). Weights are travel time in seconds, motorbike assumption. See docs/PLAN.md section 6.

## Workflow for every task

1. Restate the task and list the files you will create or change in a few lines. If it touches the schema, wait for my approval; otherwise continue unless I say to wait.
2. Implement the minimum that meets the acceptance criteria.
3. Add or update tests (engine code and permission rules MUST have tests).
4. Run lint, typecheck/build and tests with npm --prefix <package>. Fix failures. Never weaken, skip, or delete a test to make it pass.
5. Finish with a short summary: files changed, how I can verify it by hand, assumptions you made, anything deferred.
6. Do not edit docs/TASKS.md or docs/AI_LOG.md (I update them by hand). Put a suggested 3-line AI_LOG entry (asked / generated / double-check) in your summary.
7. Suggest a commit message in the form `type(scope): message`.

## Do not

- Do not touch files outside the task's scope or reformat unrelated code.
- Do not change `database/schema.sql` or the API contract without saying so explicitly and getting approval.
- Do not invent endpoints, tables, or fields that are not in docs/PLAN.md.
- Do not use an ORM, a state-management library beyond TanStack Query, or a CSS framework other than Tailwind.
- Do not call external routing APIs (Google, Mapbox, OSRM). Routing is our own engine.
- Do not call the Overpass API at runtime. OSM data is processed offline by scripts.
- Do not claim something works unless you ran the checks above.
- Do not read or write `.env` files (the IDE blocks them). If a task needs one, tell me what to put in it and I will create it by hand.
- The terminal is Windows PowerShell: never chain commands with `&&`; use `;` or run them separately.
- Do not search the web; ask me if you need information you cannot get from the repo or npm.
- Do not start long-running servers from the agent terminal; ask me to run them and report back.
- Do not run docker commands. If a database or any service is unreachable (for example ECONNREFUSED), stop immediately and tell me; do not investigate the network or the machine.
- Do not research library APIs by reading node_modules. For a missing fact, state your assumption in one line and continue. Ask only when the choice is hard to undo; do not deliberate over several possibilities.