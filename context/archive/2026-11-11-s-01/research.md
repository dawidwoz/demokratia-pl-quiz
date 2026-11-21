---
date: 2026-11-11T11:10:15+01:00
researcher: Claude (/10x-research, 3 read-only Explore workers + primary synthesis)
git_commit: 496869b78ead1a1ad12cb59a2a2386555e04d173
branch: main
repository: quiz (z-kim-mi-po-drodze)
topic: "S-01 anonymous-quiz-result: what the codebase and prior changes already give an anonymous quiz → party-agreement result flow"
tags: [research, codebase, api, angular, scoring, migrations, privacy]
status: complete
last_updated: 2026-11-11
last_updated_by: Claude
---

# Research: S-01 anonymous-quiz-result — what exists, what is missing

**Date**: 2026-11-11T11:10:15+01:00
**Git Commit**: 496869b (clean tree, branch `main`)

## Research Question

`/10x-research s-01` (intent: "anonymous-quiz-result"). Interpreted from `context/foundation/roadmap.md:110-123`: what in the current repo and in archived changes F-01/F-02 can S-01 build on, what must be created, and which constraints (privacy, latency, formula, hosting) bind it?

## Summary

- **Everything S-01 needs is still to be built.** In this inspected tree there are no domain tables, no quiz/result endpoints, no scoring module, no Angular routes/components and no seed content. Only the DB pool, migration runner, health endpoints, deploy and test scaffolding exist.
- **The scoring formula is NOT implemented, despite F-02 being `done`.** F-02 only tested `readConfig()` (`api/test/db.test.js`, the single API test file); it explicitly moved the formula to S-01 (`context/archive/2026-11-11-f-02/plan.md:40`). The roadmap's F-02 "Unlocks" text (`roadmap.md:100`) therefore overstates what F-02 delivered. Only the location decision exists: plain CommonJS module in `api/`, tested with `node --test`.
- **The PRD fixes the formula but leaves cases undefined**: przeciw↔wstrzymuję się, zero denominator, rounding/output scale (`f-02/plan.md:41`; PRD only defines za↔wstrzymuję się = 0.25, za↔przeciw = 0, `prd.md:122`).
- **Privacy constraint shapes the API**: anonymous answers must leave no trace in operator data (`prd.md:106`), so scoring must be a stateless request (answers in, scores out, no insert, no answer logging).
- **The API is raw `node:http` with no router, no body parsing and a non-importable server** (`api/app.js:31-40`), so S-01 must at least add POST/body handling and split testable handler code from the listening entrypoint.

## Detailed Findings

### API runtime (`api/`)

- Framework-free CommonJS; single `http.createServer` handler with hand-written `if (method && pathname)` routing, 404 `{status:'not_found'}` fallback (`api/app.js:31-36`). Only `GET /api/health` and `GET /api/health/db` exist. This inspected path has no POST handling, path params or body parsing.
- `sendJson` helper exists but is not exported; the server starts listening at `require` time (`api/app.js:39-40`), so handlers are untestable without refactor.
- Only dependency: `mysql2 ^3.11.0` (`api/package.json`); F-01 forbids ORM/query builder and native modules (`archive/2026-11-07-f-01/plan.md:37-39`, `foundation/infrastructure.md:105`).
- Error convention: short error codes only, never raw messages or `DB_*` values (`f-01/plan.md:56,138`).
- No CORS, no static serving. SPA and API share one origin on vh.pl; `/api/*` bypasses the SPA fallback (`deploy/vhpl/.htaccess:4-8`, marked UNVERIFIED against cPanel rules in its header).

### Database and migrations

- `api/db.js` exports `getPool, ping, closePool, readConfig, MissingConfigError`; lazy pool, `connectionLimit` 3, `DB_HOST` default localhost, `DB_USER/DB_PASSWORD/DB_NAME` required (`api/db.js:7-12,32-59,83`). S-01 should reuse it (`f-01/plan.md:109,113`).
- `api/migrate.js` applies `api/migrations/NNNN_name.sql` in filename order, records them in `schema_migrations`, takes `GET_LOCK`, uses a `multipleStatements` connection (`api/migrate.js:95-161`). The only migration is `0001_baseline.sql` (`SELECT 1;`), so S-01 starts at `0002`.
- No down-migrations; rollback redeploys an older commit without undoing schema, so migrations must be backward-compatible (`f-01/plan.md:32,54`; `deploy-vhpl.yml:17-20`). MariaDB 11.4.13, `wait_timeout` 600 s (`infrastructure.md:235`). DDL commits implicitly, so keep one DDL statement per migration or make it re-runnable (`f-01/plan.md:125`).
- **Seed content has no decided mechanism** (SQL migration vs. script). Roadmap lists ≥8 questions, parties, positions with sources as an S-01 prerequisite (`roadmap.md:115`) and allows sample content for planning (`roadmap.md:120`). S-05/S-06 later replace seeded content (`roadmap.md:175`), so the schema should be admin-ready (weights 1–3, source, date).

### Scoring formula

- Spec (`prd.md:116-122`): per party, sum of weights of questions with matching answer ÷ sum of weights of answered questions where the party has a stance; same answer = 1, za↔wstrzymuję się = 0.25, za↔przeciw = 0; skipped questions excluded; no result if fewer than half the questions answered. Club 50/50 split = no stance for that party's question (`prd.md:120`).
- Not implemented anywhere in `api/` or `src/` (workers' search of both trees; I confirmed `api/` contains only `app.js, db.js, migrate.js, migrations/, test/`).
- Open edge cases: przeciw↔wstrzymuję się (0.25 by symmetry or 0), zero denominator for a party (all answered questions lack a stance), rounding/output scale (`f-02/plan.md:41`).
- Neutrality guarantee = same code path for every party; weights' effect on neutrality is PRD Open Question 6 (`prd.md:148`).

### Angular front end (`src/`)

- Bare scaffold: `routes: Routes = []` (`src/app/app.routes.ts:3`); `app.config.ts:6-10` has only error listeners and `provideRouter`, **no `provideHttpClient`**. No services, models, environments or proxy config.
- `app.html` is the 344-line starter placeholder and must be replaced; `app.ts` uses standalone component, `signal()`, `RouterOutlet` (`src/app/app.ts:4-12`).
- Conventions: SCSS, `skipTests: true` schematics, prefix `app`, files without `.component` suffix (`angular.json:12-44`); Prettier 100 cols, single quotes; `strict`, `noPropertyAccessFromIndexSignature` (`tsconfig.json`).
- Deploy smoke check expects `/quiz/1` to return HTTP 200 (`.github/workflows/deploy-vhpl.yml:244`, verified), implying route `/quiz/:id`. `<base href="/">` is set in `src/index.html:6`.
- API reach: prod same-origin relative `/api` works; dev has no proxy (`ng serve` :4200, API :3000 via `PORT`, `api/app.js:39`) → needs `proxy.conf.json` wired in `angular.json` serve options, or CORS.
- Tests: Vitest + jsdom via `@angular/build:unit-test`, globals enabled; sole spec is `app.spec.ts` smoke test; no HttpClient testing example (would need `provideHttpClientTesting`).

### Latency and hosting

- NFR: result < 2 s after last answer (`prd.md:110`); quiz must work without Sejm API (data local, `prd.md:111`).
- vh.pl measured once: first request after idle on `/api/health/db` 0.20 s; Passenger cold start not observed; re-measure under real traffic, possibly in S-01, with `scripts/measure-latency.sh`; plan-B trigger is first request after idle > 2 s (`infrastructure.md:177-181,226,238`). A 429 appeared after ~25 rapid requests from one IP (`infrastructure.md:145`).
- Deploy is manual `workflow_dispatch`; migrations run over SSH before restart; failed migration fails the deploy; smoke covers `/api/health`, `/api/health/db`, `/quiz/1`.

### Privacy of anonymous answers

- `prd.md:106`, `roadmap.md:112`: no durable storage of anonymous answers. Implications for S-01 design (inference from those lines, not an existing mechanism): stateless scoring request, no answer persistence, no answer content in request logs (app currently logs only a listening line; host stderr/server logs not inspected).

## Code References

- `api/app.js:31-40` — hand-rolled router, non-exported server
- `api/db.js:7-83` — pool, config, exports
- `api/migrate.js:95-161` — migration runner
- `api/migrations/0001_baseline.sql` — only migration
- `api/test/db.test.js` — only API test (`readConfig`)
- `src/app/app.routes.ts:3`, `src/app/app.config.ts:6-10` — empty routes, no HttpClient
- `context/foundation/prd.md:59-69,104-122` — US-01, NFRs, formula
- `context/foundation/roadmap.md:110-123` — S-01 block

## Architecture Insights

- Pure-JS, minimal-dependency backend by design (shared hosting, Passenger); keep scoring a pure function module separate from HTTP so it is unit-testable with `node --test` (matches F-02 decision).
- Anonymous flow can be fully stateless: GET quizzes / GET quiz questions (with source, date), POST answers → scores. Quiz and party data read from MariaDB.

## Historical Context (from prior changes)

- `archive/2026-11-11-f-02/plan.md:40-41,52-53` — formula deferred to S-01; undefined cases explicitly left open (supported by the file; contradicts roadmap F-02 "Unlocks" wording at `roadmap.md:100` as to what was delivered).
- `archive/2026-11-07-f-01/plan.md:37-56,109-126` — DB access, migration rules, error sanitising (supported).
- `foundation/infrastructure.md:145,177-181,226` — latency/429 evidence, re-measure suggestion (supported).
- Workers cited formula spec at `prd.md:167-173` and NFR lines `175-181`; those line numbers are wrong for the current file (actual `prd.md:104-122`); content matches.

## Related Research

- `context/archive/2026-11-07-f-01/research.md`, `context/archive/2026-11-11-f-02/research.md`. No `lessons.md` exists.

## Open Questions

1. Presentation of the result without false precision (PRD OQ7, `prd.md:149`; roadmap unknown, non-blocking) — user decision, needed for UI.
2. Content: which ≥8 questions/parties and where positions come from (PRD OQ2); who prepares real content (roadmap OQ13). Sample content can unblock building; publishing cannot.
3. Formula edge cases: przeciw↔wstrzymuję się, zero denominator (party shows "no data"?), rounding/scale.
4. Seed mechanism: SQL migration vs. seed script (affects S-05 handover).
5. Whether to add a dev proxy vs. CORS, and whether to add an S-01 smoke check / latency re-measure.
6. How to test DB-backed routes (F-02 excluded DB-dependent tests; `f-02/research.md:138`).
7. Does the app-side router-outlet exist beyond the placeholder (`app.html` contains one occurrence, inside the starter markup; will vanish on replacement).
