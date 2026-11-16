## 1. Overview

**Problem.** A group of 3-5 friends in different parts of Ho Chi Minh City wants to meet. Choosing a place that is fair for everyone takes a lot of back-and-forth.

**Solution.** Each member pins a start location. The backend computes realistic motorbike travel times over the OpenStreetMap road network from every member to every candidate venue, removes venues that are closed at the meeting time, and ranks the rest. The group votes; the Leader confirms.

**Two things are graded equally:** (1) a complete, secure full-stack web app, and (2) the routing engine built from our own data structures (Graph, Dijkstra, Min-Heap, KD-Tree, Trie, Union-Find). No external routing API is allowed.

**Guiding principle: core first.** Finish a small flow that works end to end (deployed), then add the rest. Never start a later milestone while an earlier one is not done.

---

## 2. Scope by priority

### CORE (milestones M0-M5) — must work before anything else

1. Register / login (JWT), roles.
2. Venues: seeded from real OSM data; list, search, filter, paginate, view.
3. Routing engine: graph loaded in memory, KD-Tree, Dijkstra, ranking.
4. Meetups: create, join by invitation code, pin location, run recommendation, vote, confirm, cancel.
5. Map UI for the meetup flow (pins, candidate list with per-member times, route lines).
6. Deployed to a public URL.

**Core demo script (the gate):** register 3 users → A creates a meetup → B and C join with the code and pin locations → A runs the recommendation → B and C vote → A confirms → status is `CONFIRMED`, routes drawn on the map. Must work on the deployed site.

### REQUIRED BY THE COURSE, AFTER CORE (M6)

Full CRUD for users, venues, categories, meetups, reviews; soft delete; audit log; admin user management; Moderator role; scheduled task `CONFIRMED → COMPLETED`; reviews; profile + change password.

### ADVANCED FEATURES (M7) — need 3, in this order

1. Routing engine + maps (already built in core; add Union-Find ride-share suggestions).
2. Trie autocomplete for venue names.
3. Notifications + live vote updates (SSE).

### LATER / ONLY IF TIME

Refresh tokens, email verification, saved searches, PDF export, charts dashboard, animation of Dijkstra, worker threads, CI/CD.

### OUT OF SCOPE

Payments, chat, delegation of the Leader role, other cities, other vehicle types.

---

## 3. Roles and permissions

Two levels. Do not mix them.

**Account level** (`users.role_id` → `roles`):

| Role | Purpose |
|---|---|
| `ADMIN` | System admin. Manages accounts (create, deactivate, change role), categories, venues; reads audit logs. |
| `MODERATOR` | Manages venues and moderates reviews. (Seeded in M0; its permissions are implemented in M6.) |
| `USER` | Normal user: creates meetups, joins meetups, votes, reviews. |

**Meetup level** (`meetup_participants.role`):

| Role | Purpose |
|---|---|
| `LEADER` | Creator of the meetup (group admin). Exactly one per meetup. |
| `MEMBER` | Joined with the invitation code. |

One user can be Leader of some meetups and Member of others.

**Permission matrix (meetup actions):**

| Action | Leader | Member | Non-participant |
|---|---|---|---|
| View meetup | yes | yes | no (403) |
| Edit meetup (while `OPEN`) | yes | no | no |
| Pin / change own location | yes | yes | no |
| Remove a member | yes | no | no |
| Leave meetup | no (must cancel) | yes | no |
| Run recommendation | yes | no | no |
| Vote (while `OPEN`) | yes | yes | no |
| Confirm venue | yes | no | no |
| Cancel meetup | yes | no | no |
| Review venue (after `COMPLETED`) | yes | yes | no |

`ADMIN` can view any meetup read-only. Admin/Moderator venue and user management is account-level only.

---

## 4. Meetup lifecycle

```
OPEN ──confirm (Leader)──▶ CONFIRMED ──meeting time passes (scheduler, M6)──▶ COMPLETED
 │                             │
 └────────cancel (Leader)──────┴──▶ CANCELLED
```

- `OPEN`: invite members, pin locations, run recommendation, vote.
- `CONFIRMED`: venue chosen, voting locked, members' travel time to the venue stored.
- `COMPLETED`: reviews enabled. (Until the scheduler exists in M6, a Leader-only or admin-only manual endpoint is NOT added; just build the scheduler in M6.)
- `CANCELLED`: terminal. Leader cancel is immediate.
- Re-running the recommendation while `OPEN` replaces the candidates and clears all votes.

---

## 5. Domain model (PostgreSQL 16, 3NF)

All tables have `created_at`, `updated_at`, `created_by`, `updated_by` (nullable where noted). Use `BIGINT GENERATED ALWAYS AS IDENTITY` primary keys. Every foreign key gets an index. Write `database/schema.sql` from this section; do not add tables.

**Main tables (8)**

- `roles`: id, name UNIQUE (`ADMIN`, `MODERATOR`, `USER`).
- `users`: id, email UNIQUE NOT NULL, password_hash NOT NULL, full_name NOT NULL, phone, avatar_url, role_id FK, is_active DEFAULT true.
- `categories`: id, name UNIQUE, slug UNIQUE, description, is_active DEFAULT true.
- `venues`: id, name NOT NULL, address, district, lat NOT NULL, lng NOT NULL, category_id FK, price_level SMALLINT CHECK 1-4, opening_time TIME NOT NULL, closing_time TIME NOT NULL (may be earlier than opening = crosses midnight), phone, description, osm_id (nullable), is_active DEFAULT true.
- `meetups`: id, title NOT NULL, description, leader_id FK users, meeting_time timestamptz NOT NULL, category_id FK (nullable, filter for recommendation), objective CHECK IN (`MIN_TOTAL`, `MIN_SPREAD`) DEFAULT `MIN_TOTAL`, status CHECK IN (`OPEN`,`CONFIRMED`,`COMPLETED`,`CANCELLED`) DEFAULT `OPEN`, invite_code UNIQUE NOT NULL (8 chars, A-Z0-9), confirmed_venue_id FK venues (nullable).
- `reviews`: id, venue_id FK, meetup_id FK, user_id FK, rating SMALLINT CHECK 1-5, comment, is_active DEFAULT true. UNIQUE (meetup_id, user_id).
- `notifications`: id, user_id FK, type, title, body, meetup_id FK (nullable), is_read DEFAULT false.
- `audit_logs`: id, actor_id FK users (nullable), action, entity_type, entity_id, details JSONB, created_at.

**Junction tables (3)**

- `meetup_participants`: PRIMARY KEY (meetup_id, user_id); role CHECK IN (`LEADER`,`MEMBER`); status CHECK IN (`JOINED`,`LEFT`,`REMOVED`) DEFAULT `JOINED`; lat, lng (nullable until pinned); confirmed_travel_time_sec (nullable, set on confirm); joined_at. Partial unique index: one `LEADER` per meetup.
- `meetup_candidates`: id; meetup_id FK; venue_id FK; rank SMALLINT; total_time_sec INT; spread_sec INT; travel_times JSONB (`{ "<userId>": seconds }`, a snapshot of the computed result — a justified denormalization); UNIQUE (meetup_id, venue_id).
- `meetup_votes`: PRIMARY KEY (meetup_id, user_id); candidate_id FK; voted_at. Service verifies the candidate belongs to the same meetup.

**Seed data (`database/seed`)**

- Roles, ~10 categories.
- Users with the course test-account format: `admin@test.com / Admin123!`, `moderator@test.com / Moderator123!`, `user1@test.com / User123!` ... `user10@test.com`. Hash passwords inside the seed script.
- 100-200 real venues for HCMC taken once from OSM (restaurants, cafes, etc.) by an offline script. If `opening_hours` is missing, default to 08:00-22:00.
- A few demo meetups in different statuses and a few reviews.

---

## 6. Routing engine (the core algorithm work)

Lives in `backend/src/engine/` (pure TS) and is wired up by `backend/src/services/recommendationService.ts`.

### 6.1 Offline data build (scripts, not runtime)

- `scripts/build-graph.ts`: reads an OSM extract of a configurable bounding box (`GRAPH_BBOX=south,west,north,east`) → writes `backend/data/graph.json` (or a compact binary).
- Start with a small inner-city area. Expand only after measuring memory. Target: graph in memory well under 150 MB so free hosting works.
- Keep drivable-by-motorbike ways only. Include `trunk, primary, secondary, tertiary, unclassified, residential, living_street, service` and their `_link`. Exclude `motorway` (motorbikes are not allowed on expressways), footpaths, steps, cycleways, `access=no/private`.
- Respect one-ways (`oneway=yes/-1`, roundabouts). Add reverse edges for two-way roads (deduplicate).
- Keep only the largest strongly connected component, so every node can reach every other node.
- Edge weight is travel time: `travelSec = lengthM / (speedKph / 3.6)`.
- Speed model (tunable constants in `engine/config.ts`, assumption: motorbike in city traffic): primary 35, secondary 30, tertiary 25, trunk 40, residential/unclassified 20, living_street/service 15 km/h, default 20.
- `scripts/seed-venues.ts`: pulls venue POIs once from OSM for the same bounding box and writes the seed file.

### 6.2 In-memory structures (loaded once at server startup)

- Graph in CSR form with typed arrays (`offsets`, `targets`, `weights`), node ids remapped to `0..N-1`, plus node `lat/lng`.
- KD-Tree over graph nodes (for snapping a pin to the road network).
- KD-Tree over active venues (for candidate pre-filtering). Rebuild it after a venue is created, updated, or deleted.
- Binary Min-Heap with lazy deletion for Dijkstra.
- Log node/edge counts, load time, and heap usage at startup.

### 6.3 Snapping

A pin or venue is snapped to the nearest graph node with the node KD-Tree. If the nearest node is farther than `MAX_SNAP_M` (default 500 m), reject with `422 LOCATION_OUT_OF_COVERAGE`.

### 6.4 Recommendation algorithm

`recommend(meetupId, objective)`, Leader only, meetup must be `OPEN`:

1. Load `JOINED` participants. Require at least 2 with a pinned location.
2. Venue candidates: active, matching the meetup category (if set), **open at `meeting_time`** (Asia/Ho_Chi_Minh, midnight-crossing aware).
3. Compute the centroid of member locations. Use the venue KD-Tree to take the `K_CANDIDATES` (default 40) venues nearest to the centroid.
4. For each member, run ONE single-source Dijkstra from their snapped node over the graph, stopping early once all candidate venue nodes are settled. Do NOT use a multi-source Dijkstra: it returns the distance to the nearest member, not each member's time.
5. Drop venues unreachable by any member. Build the time matrix `[member][venue]`.
6. Score: `MIN_TOTAL` = sum of times (ties by smaller max); `MIN_SPREAD` = max time minus min time (ties by smaller sum).
7. Keep the top `TOP_N` (default 5). Replace rows in `meetup_candidates`, delete existing votes, return the list.

Route lines: `GET .../routes` runs Dijkstra with parent pointers from each member to the chosen venue and returns coordinate arrays. Compute on demand; do not store.

### 6.5 Later (M7)

- **Union-Find ride-share:** union members whose pairwise travel time is below `RIDE_SHARE_MAX_SEC`; return the groups as suggestions. Add member nodes to the Dijkstra targets so pairwise times come from the same runs.
- **Trie:** prefix search over venue names for autocomplete, built at startup and rebuilt when venues change.

### 6.6 Engine testing (required)

- Dijkstra: hand-made tiny graph with known answers; one-way edge case; unreachable node; compare against a simple Bellman-Ford on random small graphs.
- KD-Tree: nearest and k-nearest compared with a linear scan on random points.
- Heap: pops in sorted order.
- Opening hours: normal range, midnight-crossing range, boundary times.
- Scoring: both objectives, tie-breaks.

---

## 7. API (`/api/v1`)

Mark: C = core (M1-M5), R = required later (M6), A = advanced (M7).

**Auth**
- C `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- R `PATCH /auth/me`, `POST /auth/change-password`

**Venues and categories**
- C `GET /venues` (filters: `q`, `categoryId`, `district`, `priceLevel`, `openAt`, `minRating`; sort: `name`, `priceLevel`, `rating`, multi-column; pagination) and `GET /venues/:id`; `GET /categories`
- R `POST /venues`, `PATCH /venues/:id`, `DELETE /venues/:id` (soft; ADMIN/MODERATOR); category CRUD (ADMIN)
- A `GET /venues/suggest?prefix=`

**Meetups**
- C `POST /meetups`; `GET /meetups` (mine); `GET /meetups/:id`
- C `POST /meetups/join` body `{ inviteCode }`
- C `PUT /meetups/:id/me/location` body `{ lat, lng }`
- C `POST /meetups/:id/recommend` body `{ objective }` (Leader)
- C `GET /meetups/:id/candidates`; `GET /meetups/:id/candidates/:candidateId/routes`
- C `PUT /meetups/:id/vote` body `{ candidateId }`
- C `POST /meetups/:id/confirm` body `{ candidateId }` (Leader); `POST /meetups/:id/cancel` (Leader)
- R `PATCH /meetups/:id` (Leader, `OPEN`); `DELETE /meetups/:id/members/:userId` (Leader); `DELETE /meetups/:id/members/me` (Member leaves)

**Reviews**
- R `POST /meetups/:id/reviews`; `GET /venues/:id/reviews`; `PATCH/DELETE /reviews/:id` (author; Moderator can hide)

**Admin**
- R `GET/POST /admin/users`, `PATCH /admin/users/:id` (role, is_active); `GET /admin/audit-logs`

**Notifications / live**
- A `GET /notifications`, `PATCH /notifications/:id/read`; `GET /meetups/:id/events` (SSE)

**Infra**
- C `GET /health` (also checks the database)

Document the final contract in `docs/API.md` as endpoints are built (or generate OpenAPI from the Zod schemas).

---

## 8. Architecture and structure

```
project-root/
├─ backend/
│  ├─ src/
│  │  ├─ config/          env.ts (Zod-validated), db pool
│  │  ├─ routes/          one file per resource
│  │  ├─ middlewares/     authenticate, authorize, validate, errorHandler, requestLogger
│  │  ├─ controllers/
│  │  ├─ services/
│  │  ├─ repositories/
│  │  ├─ schemas/         Zod schemas (request validation)
│  │  ├─ engine/          graph, dijkstra, kdtree, heap, trie, unionFind, scoring, config
│  │  ├─ errors/          AppError
│  │  └─ app.ts, server.ts
│  ├─ data/               graph file (generated, gitignored if large)
│  ├─ tests/
│  └─ package.json
├─ frontend/
│  └─ src/{pages, components, api, hooks, lib}
├─ database/              schema.sql, seed files, ER-diagram.png
├─ scripts/               build-graph.ts, seed-venues.ts
├─ docs/                  PLAN.md, TASKS.md, API.md, AI_LOG.md, DEPLOYMENT.md
├─ docker-compose.yml, .env.example, .gitignore, README.md
└─ .continue/rules/project.md
```

Startup order: validate env → connect DB → load graph + build KD-Trees → start listening. If the graph file is missing, fail fast with a clear message.

---

## 9. Frontend (core pages only)

React Router + TanStack Query + Tailwind + react-leaflet. Responsive (desktop / tablet / mobile), loading and empty states, confirmation dialog for destructive actions.

Core pages:
1. Login / Register.
2. Venues: filters, sort, page-size selector, "Showing 21-40 of 156".
3. My meetups: list, "Create meetup", "Join with code".
4. Meetup detail (the main screen): map with member pins; click the map to set my location; member list; Leader buttons (run recommendation, remove, confirm, cancel); candidate list showing each member's travel time, total, and spread; vote button; draw routes of the selected candidate.

Keep the frontend dumb: it sends input, shows loading state, renders results. No routing math in the browser.

---

## 10. Testing

Required in every milestone that adds the matching code:

- **Unit (Vitest):** all of `engine/`; meetup service rules (max 5 members, status transitions, Leader-only actions, voting locked after confirm, venue closed at meeting time).
- **Integration (a few):** register + login; a protected route returns 401 without a token and 403 with the wrong role; create meetup → join → pin → recommend → vote → confirm happy path (test DB).
- **Manual checklist** (`docs/TEST_SCENARIOS.md`, 10-15 scenarios, needed for the report): duplicate email, wrong password, join with a bad code, 6th member rejected, pin outside coverage, member tries to confirm, vote after confirm, venue closed at meeting time, responsive layout on a phone.

---

## 11. Milestones

Each milestone ends with a checkpoint. If a checkpoint fails, fix it before moving on. Each task is small, runs in a fresh AI session, on its own Git branch.

**M0 — Foundation**
- Repo, `.gitignore`, ESLint/Prettier, Docker Compose with PostgreSQL, `schema.sql`, seed (roles, categories, test users), Express skeleton, env validation, error handler, `/health`.
- Deploy the skeleton (backend + managed PostgreSQL) so the public URL exists from day one.
- *Checkpoint:* `GET /health` is OK on the public URL and the database is connected.

**M1 — Auth**
- Register, login, `/auth/me`, `authenticate` and `authorize`, rate limit on login, helmet, request logger. Login/Register pages.
- *Checkpoint:* login works as `ADMIN` and `USER`; a protected route gives 401/403 correctly; tests pass.

**M2 — Venues**
- Seed real venues from OSM. `GET /venues` with 5+ filters, sort, pagination, stats; venue detail. Venues page.
- *Checkpoint:* filter + sort + page-size works on the deployed site with 100+ venues.

**M3 — Routing engine**
- Graph build script, graph loader, KD-Trees, Heap, Dijkstra, opening-hours check, scoring, recommendation function, all engine tests. A script `scripts/try-recommend.ts` that prints a ranked list for 3 sample points.
- *Checkpoint:* tests pass; the script prints sensible rankings; startup time and memory are logged and acceptable.

**M4 — Meetups API**
- Schema usage for meetups/participants/candidates/votes; create, join, pin, remove/leave (basic), recommend, vote, confirm, cancel; routes endpoint; all business rules with tests.
- *Checkpoint:* the full core flow works through the API (integration test passes).

**M5 — Meetup UI**
- Meetups list, create/join, meetup detail with map, recommendation, voting, confirm, route drawing.
- *Checkpoint:* **the core demo script works on the deployed site. CORE DONE.** Stop and review before M6.

**M6 — Required completeness**
- Full CRUD for venues/categories/meetups/reviews/users, soft delete, audit logs written by services, admin user management, Moderator permissions, profile + change password, reviews, scheduler (`CONFIRMED → COMPLETED`), 5-filter polish.
- *Checkpoint:* every requirement in the course checklist is demonstrable.

**M7 — Advanced features**
- Trie autocomplete; notifications + SSE live votes; Union-Find ride-share suggestions.
- *Checkpoint:* three advanced features demonstrable.

**M8 — Delivery**
- README (setup, env vars, test accounts, screenshots), API docs, ER diagram, deployment doc, test scenarios, AI usage report, technical report, slides, demo rehearsal with a recorded backup.

---

## 12. Definition of done (every task)

- Acceptance criteria in `docs/TASKS.md` are met.
- `npm run lint`, `npx tsc --noEmit`, `npm test` pass.
- No secrets in code; `.env.example` updated if env changed.
- I read the diff and can explain every line.
- `docs/TASKS.md` status updated; entry added to `docs/AI_LOG.md`; commit message in `type(scope): message` format.

---

## 13. Decisions log

- Node + Express + TypeScript chosen to reuse existing TypeScript algorithm code and use one language across the stack (compare with Spring Boot in the report).
- Raw SQL with `pg`, not an ORM, so the schema, constraints, and indexes stay visible and graded.
- Graph and venue KD-Tree live in memory; PostgreSQL stores users, venues, and meetups only. No PostGIS.
- `meetup_candidates.travel_times` is a JSONB snapshot of computed results (justified denormalization).
- Access token only for now; refresh tokens are deferred.
- Moderator exists in `roles` from M0 so the course's "3 account roles" rule is met; its screens come in M6.

---

## 14. Prompt template for each task

Use this when starting a fresh AI session:

```
Read .continue/rules/project.md and docs/PLAN.md.
Task: <paste ONE task from docs/TASKS.md, with files and acceptance criteria>.
First tell me your plan and the files you will touch. Wait for my OK before editing.
Then implement the minimum, run lint + tsc + tests, and summarize.
```