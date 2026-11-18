Group Meetup Planner — Project Rules

Project in one paragraph

Web app for a group of 3-5 friends in Ho Chi Minh City. Each member pins a start location on a map. The backend computes realistic motorbike travel times over the OpenStreetMap road network, drops venues that are closed at the meeting time, and ranks venues (smallest total travel time, or smallest gap between members). The group votes and the Leader confirms the final venue. This is a university course final project (Web Application Development): it is graded on full-stack completeness AND on the routing engine.

Read before every task
docs/PLAN.md — source of truth for scope, roles, data model, API, milestones.
docs/TASKS.md — work ONLY on the task you were given.
database/schema.sql and docs/API.md (when they exist) — the contracts. Follow them exactly.

If the code, the plan, or my instruction conflict, STOP and ask. Do not silently pick one.

Rule #1: core first
Build in the order of the milestones in docs/PLAN.md. The core flow (login → create meetup → join → pin → recommend → vote → confirm) must work end to end before anything else.
Do NOT implement anything from a later milestone, even if it looks easy or "would be nice".
No speculative abstraction: no generic frameworks, plugin systems, caching layers, queues, microservices, DI containers, or extra config layers. Write simple, direct code. Three similar lines are better than a premature abstraction.
Do not add a dependency without asking first. Justify it in one sentence.
Make the smallest change that satisfies the task's acceptance criteria. Do not refactor unrelated code.
Stack
Backend: Node.js 20+, Express, TypeScript (strict), pg with raw parameterized SQL (no ORM), Zod, jsonwebtoken, bcrypt, helmet, cors, express-rate-limit, dotenv, Vitest.
Frontend: React, Vite, TypeScript, Tailwind CSS, React Router, TanStack Query, Leaflet (react-leaflet).
Database: PostgreSQL 16 (Docker Compose locally).
Tooling: ESLint + Prettier.
Architecture rules

Layers: routes → middlewares → controllers → services → repositories.

routes: only wire path + middlewares + Zod schema + controller.
controllers: read validated input, call ONE service, shape the HTTP response. No SQL. No business rules.
services: business rules, meetup-level permission checks, transactions. No req/res. No SQL strings (call repositories).
repositories: all SQL lives here. Parameterized only ($1, $2). Map snake_case rows to camelCase typed objects.
engine/ (graph, dijkstra, kdtree, heap, trie, unionFind, scoring): pure TypeScript. No Express, no DB, no file/network I/O. Must be unit tested.

API conventions:

Base path /api/v1. Resource URLs /api/v1/resources/:id. Correct status codes: 200, 201, 204, 400, 401, 403, 404, 409, 422, 500.
Success: { "data": ..., "meta": { ... } }. Error: { "error": { "code": "STRING_CODE", "message": "human readable", "details": [...] } }.
Throw AppError(code, httpStatus, message) in services; ONE central error handler turns it into the error envelope. Never leak stack traces in production.
Lists use page and pageSize (allowed: 10, 20, 50, 100) and return meta: { page, pageSize, total }.
Code rules
TypeScript strict. No any (use unknown and narrow). Explicit return types on exported functions.
Naming: camelCase in code, snake_case in the database, PascalCase for types/components.
Keep files under about 300 lines; split by responsibility.
Comments only for non-obvious WHY. JSDoc on exported engine functions. No commented-out code. No leftover TODOs.
Time: store timestamptz (UTC). Business time zone is Asia/Ho_Chi_Minh; compare opening hours in that zone.
No hard-coded secrets, URLs, or magic numbers. Read env through config/env.ts (validated with Zod). Keep .env.example current. Tunable engine constants live in one engine/config.ts.
Security rules (non-negotiable)
Passwords: bcrypt (cost 10-12). Never log or return password_hash.
SQL: parameterized queries only. Never concatenate user input into SQL.
Validate EVERY input with Zod on the server (body, params, query). Never trust the client.
Auth: JWT in the Authorization: Bearer header. authenticate middleware on every non-public route. authorize(...roles) for account-level roles.
Meetup-level permissions (Leader vs Member) are checked in services, not only in the UI.
Use helmet, configured CORS, and rate limiting on login/register.
Never put secrets, tokens, or personal data in logs.
Domain rules (never break)
Roles, two levels. Account: ADMIN, MODERATOR, USER. Meetup: LEADER, MEMBER (stored in meetup_participants).
A meetup has at most 5 participants (the Leader counts). Enforce in the service, inside a transaction.
Meetup status: OPEN → CONFIRMED → COMPLETED, or OPEN/CONFIRMED → CANCELLED. No other transitions.
Only the Leader can: edit the meetup, remove members, run the recommendation, confirm a venue, cancel. Leader cancel is immediate. No delegation.
Voting is allowed only while OPEN. Confirming locks voting. One vote per member per meetup (changing a vote replaces it).
Venues closed at the meeting time are excluded from recommendations. Opening hours can cross midnight.
A venue with upcoming meetups (OPEN/CONFIRMED, meeting time in the future) cannot be deleted. Venues and users use soft delete (is_active).
Only participants of a COMPLETED meetup can review the venue that was confirmed, once per meetup.
Routing: run ONE single-source Dijkstra per member (not "multi-source"). Weights are travel time in seconds, motorbike assumption. See docs/PLAN.md section 6.
Workflow for every task
Restate the task and list the files you will create or change. If it touches the schema or more than 3 files, wait for my approval.
Implement the minimum that meets the acceptance criteria.
Add or update tests as required by the testing section of docs/PLAN.md (engine code and permission rules MUST have tests).
Run npm run lint, npx tsc --noEmit, and npm test in the affected package. Fix failures. Never weaken, skip, or delete a test to make it pass.
Finish with a short summary: files changed, how I can verify it by hand, assumptions you made, anything deferred.
Update the task status in docs/TASKS.md and append a 3-line entry to docs/AI_LOG.md (what was asked / what you generated / what I should double-check).
Suggest a commit message in the form type(scope): message, e.g. feat(auth): add login endpoint.
Do not
Do not touch files outside the task's scope or reformat unrelated code.
Do not change database/schema.sql or the API contract without saying so explicitly and getting approval.
Do not invent endpoints, tables, or fields that are not in docs/PLAN.md.
Do not use an ORM, a state-management library beyond TanStack Query, or a CSS framework other than Tailwind.
Do not call external routing APIs (Google, Mapbox, OSRM). Routing is our own engine.
Do not call the Overpass API at runtime. OSM data is processed offline by scripts.
Do not claim something works unless you ran the checks above.
Do not try to read or write `.env` files (the IDE blocks them). If a task needs one, tell me what to put in it and I will create it by hand.
 The terminal is Windows PowerShell: never chain commands with `&&`; use `;` or run them separately.
 Do not search the web; ask me if you need information you cannot get from the repo or npm.
Do not start long-running servers from the agent terminal; ask me to run them and report back
- Do not edit docs/TASKS.md or docs/AI_LOG.md; I update them by hand. Put the suggested AI_LOG entry in your final summary instead.