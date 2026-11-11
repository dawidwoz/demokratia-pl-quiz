# S-01 Anonymous Quiz Result Implementation Plan

## Overview

An anonymous visitor picks a quiz from a list, answers questions one per screen (za / przeciw / wstrzymuję się, or skips; the question's source is shown), and sees agreement with every party in the quiz. The result appears only when at least half the questions are answered. Answers are never stored or logged. Scoring is a pure CommonJS module in `api/`, called by a stateless `POST`; quiz and party data come from MariaDB; the front end is Angular.

## Current State Analysis

Nothing for this slice exists yet (research.md, inspected tree at commit 496869b):

- API is raw `node:http` with only `GET /api/health` and `/api/health/db`; no POST, no path params, no body parsing; `app.js` listens at `require` time (`api/app.js:31-40`).
- DB access: `getPool()` lazy mysql2 pool (`api/db.js`); migrations `api/migrations/NNNN_*.sql` applied by `api/migrate.js` in the deploy; only `0001_baseline.sql` (`SELECT 1;`) exists.
- Scoring formula is not implemented (F-02 only tested `readConfig`); the F-02 decision is "plain CommonJS module in `api/`, tested with `node --test`" (`context/archive/2026-11-11-f-02/plan.md:40`).
- Angular is the bare scaffold: `routes = []`, no `provideHttpClient`, no environments, `app.html` is starter placeholder (`src/app/app.routes.ts:3`, `src/app/app.config.ts:6-10`).
- Deploy smoke check already expects `/quiz/1` to return HTTP 200 (`.github/workflows/deploy-vhpl.yml:244`); `/api/*` bypasses the SPA fallback (`deploy/vhpl/.htaccess`).

## Desired End State

On `ng serve` + `node app.js` with a local MariaDB, and after deploy on vh.pl: `/` lists the sample quiz; `/quiz/:id` runs it; the result screen shows rounded % per party sorted descending with "na podstawie k z M pytań" per party, or "brak danych" for a party with no stance on any answered question; the Show-result button is disabled below half answered. `npm test` (no DB) covers the formula, validation and routes. No answer is written to the DB, logs, URLs or browser storage. Verify with the phase success criteria below.

### Key Discoveries:

- Passenger loads the startup file, so `require.main === module` is unreliable; keep `app.js` always listening and move all handler logic into an importable module (`api/app.js:39-40`; F-01 plan).
- F-01 forbids ORM/query builder and native modules; only `mysql2` (`context/archive/2026-11-07-f-01/plan.md:37-39`, `context/foundation/infrastructure.md:105`).
- Rollback does not undo schema, so migrations must be backward-compatible and re-runnable (`f-01/plan.md:32,54,125`).
- PRD formula and guardrails: `context/foundation/prd.md:104-122`.

## What We're NOT Doing

- Party-stance justification screen (S-02), accounts and saving results (S-03/S-04), admin CRUD (S-05/S-06), PNG export (S-08). The schema stores justification/source/date now but the API does not return stances.
- Real party/question content. S-01 ships clearly marked sample content; publishing waits for real content (roadmap OQ13).
- Client-side scoring, a router library, an ORM, request logging middleware, rate limiting, caching.
- Persisting answers anywhere (DB, logs, `localStorage`, `sessionStorage`, router state, URL).
- Changing `deploy-vhpl.yml` beyond smoke checks; no CI MariaDB service.

## Implementation Approach

Bottom-up so each phase is verifiable alone: pure formula → schema/seed → API (importable handler with injected data layer) → Angular → deploy verification and docs. Decisions fixed in planning (user-confirmed unless noted):

- Same answer = 1; za↔wstrzymuję się = 0.25; **przeciw↔wstrzymuję się = 0.25 (symmetric; extends PRD, recorded in Phase 5)**; za↔przeciw = 0.
- Party with no stance on any answered question → `null` ("brak danych"). Rounding: `Math.round(fraction * 100)`, integer percent, half up.
- "Answered" = answered with any of the three values (wstrzymuję się counts); skipped = absent. Result requires `answered * 2 >= total`.
- Sample content uses **fictional party names** (my choice, to avoid attributing fabricated stances to real parties) and is flagged `is_sample`.

## Critical Implementation Details

- **Entry point vs. handler**: `api/app.js` must keep calling `listen` unconditionally; extract logic to `api/handler.js` (exports `createHandler(deps)`), which tests import without opening a port.
- **Dev CORS** (user decision): add CORS headers only when `CORS_ORIGIN` is set; production never sets it. The Angular dev build uses an absolute API URL, production uses relative `/api`.
- **Privacy**: answers travel only in the POST body; the handler and data layer never log request bodies; error logs contain short codes only (existing convention `api/app.js:20-29`).

## Phase 1: Scoring module

### Overview

Pure, dependency-free formula module with exhaustive `node --test` coverage. This is the neutrality guarantee: one code path for every party.

### Changes Required:

#### 1. Scoring module

**File**: `api/scoring.js`

**Intent**: Compute per-party agreement from weighted questions, party positions and the user's answers, applying the PRD matrix and the half-answered gate.

**Contract**: `computeResult({ questions, parties, answers })` where `questions: [{id, weight(1..3)}]`, `parties: [{id, positions: {[questionId]: 'za'|'przeciw'|'wstrzymuje'}}]` (missing key = no stance), `answers: {[questionId]: 'za'|'przeciw'|'wstrzymuje'}` (missing key = skipped). Returns `{ status: 'ok', answered, total, parties: [{id, fraction: number|null, counted}] }` or `{ status: 'insufficient_answers', answered, total }`. `counted` = number of answered questions the party has a stance on. `fraction` = Σ weight×match ÷ Σ weight over those questions; `null` when `counted === 0`. Unknown answer values or unknown question ids in `answers` throw `RangeError` (validation normally happens earlier).

#### 2. Tests

**File**: `api/test/scoring.test.js`

**Intent**: Pin every rule, including the cases PRD leaves open.

**Contract**: `node:test` + `node:assert/strict`, CommonJS. Cases: all-match = 1; all-opposite = 0; za↔wstrzymuję = 0.25 and przeciw↔wstrzymuję = 0.25; weights 1–3 change the result as hand-computed; skipped question excluded from numerator and denominator; party without stance on a question excludes it for that party only; `counted === 0` → `fraction: null`; gate: 8 questions with 4 answered → ok, 3 answered → `insufficient_answers`; 9 questions with 4 → insufficient, 5 → ok; wstrzymuję się counts as answered; same input gives identical results regardless of party order (neutrality).

### Success Criteria:

#### Automated Verification:

- API tests pass: `npm run test:api`
- Full suite passes: `npm test`
- Module has no dependencies: `grep -c "require(" api/scoring.js` returns 0

#### Manual Verification:

- Hand-compute one 3-party example from the PRD text and confirm it equals a test's expected value

**Implementation Note**: After this phase and automated verification pass, pause for manual confirmation before Phase 2.

---

## Phase 2: Schema and sample seed

### Overview

Admin-ready normalized schema plus marked sample content, delivered by the existing migration runner.

### Changes Required:

#### 1. Schema migration

**File**: `api/migrations/0002_quiz_schema.sql`

**Intent**: Create tables the slice reads and S-02/S-05 will extend without breaking changes. Use `CREATE TABLE IF NOT EXISTS` so the multi-statement file is re-runnable (DDL commits implicitly; no down-migrations).

**Contract**: InnoDB, utf8mb4, MariaDB 11.4 compatible. Tables: `quizzes(id PK, title, description, is_sample BOOL, created_at)`; `parties(id PK, name UNIQUE)`; `quiz_parties(quiz_id, party_id, PK both, FKs)`; `questions(id PK, quiz_id FK, sort_order INT, text, weight TINYINT CHECK 1..3, source_label, source_url NULL, source_date DATE NULL)`; `positions(question_id, party_id, PK both, FKs, stance ENUM('za','przeciw','wstrzymuje') NOT NULL, justification TEXT NULL, source_label NOT NULL, source_url NULL, source_date DATE NOT NULL)`. A missing `positions` row means "no stance" (e.g. 50/50 club split). No table stores user answers.

#### 2. Sample seed migration

**File**: `api/migrations/0003_seed_sample_quiz.sql`

**Intent**: One sample quiz so the flow can be built and verified; clearly marked as sample.

**Contract**: One quiz, `is_sample = 1`, title containing "przykładowy"; 8–10 questions with mixed weights 1–3 and a source label/date each; 3–4 fictional parties ("Partia Przykładowa A…"); positions covering all three stances, at least one question where one party has no row (no stance), and one party with a stance on only few questions. Fixed explicit ids. Insert with `INSERT IGNORE` so a re-run is harmless.

### Success Criteria:

#### Automated Verification:

- Migration files match the runner pattern and sort after baseline: `ls api/migrations` shows `0001_…`, `0002_quiz_schema.sql`, `0003_seed_sample_quiz.sql`
- API tests still pass: `npm run test:api`

#### Manual Verification:

- On a local MariaDB: `node api/migrate.js` applies both; running it twice is a no-op
- `SELECT COUNT(*) FROM questions` ≥ 8 for the sample quiz; every position row has a `source_date`
- Grep the schema for any table/column that could hold user answers: none

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: API endpoints

### Overview

Importable handler with three routes, validation, an injected data layer, dev-only CORS, and DB-free tests.

### Changes Required:

#### 1. Handler extraction and routing

**Files**: `api/handler.js` (new), `api/app.js`

**Intent**: Move request handling out of the always-listening entry file so tests can call it; add minimal routing with a `:id` path parameter and JSON body reading. Keep health endpoints behaviourally identical.

**Contract**: `createHandler({ data, health, ping })` returns `(req, res)`. `app.js` builds real deps (`quiz-data`, existing `ping`) and calls `listen` unconditionally on `PORT` (default 3000). Body reader enforces a 16 KB cap and `Content-Type: application/json`. Unknown route → existing 404 `{status:'not_found'}`.

#### 2. Data layer

**File**: `api/quiz-data.js`

**Intent**: Read quizzes, questions and positions with plain `mysql2` queries via `getPool()`; no writes.

**Contract**: `listQuizzes() → [{id,title,description,isSample,questionCount}]`; `getQuiz(id) → {id,title,isSample,questions:[{id,text,source:{label,url,date}}],parties:[{id,name}]} | null` (no weights, no stances); `getScoringData(id) → {questions:[{id,weight}], parties:[{id,name,positions}]} | null`. Only module that touches the DB for this slice.

#### 3. Routes and validation

**File**: `api/handler.js` (+ `api/validate.js` for pure validation)

**Intent**: Three endpoints; reject malformed input with short error codes; format the scoring output for the client.

**Contract**:
- `GET /api/quizzes` → 200 array.
- `GET /api/quizzes/:id` → 200 quiz payload including `minAnswered = ceil(total/2)`; 404 `{status:'not_found'}` for unknown/non-integer id.
- `POST /api/quizzes/:id/result`, body `{ "answers": [{ "questionId": n, "answer": "za"|"przeciw"|"wstrzymuje" }] }` (skipped questions omitted). 200 `{ answered, total, parties: [{ id, name, percent: int|null, counted }] }` sorted by `percent` desc, `null` last, ties by name (pl locale). 400 `{status:'error', code:'invalid_request'}` for bad body/duplicate or foreign `questionId`/bad value; 422 `{status:'error', code:'insufficient_answers', answered, total, minAnswered}`; 503 with short code if the DB is unavailable (same sanitising as `healthDb`). Answers never in URL or query string.

#### 4. Dev-only CORS

**File**: `api/handler.js`

**Intent**: Let `ng serve` (origin `http://localhost:4200`) call the API in development without exposing CORS in production.

**Contract**: Only if `process.env.CORS_ORIGIN` is set: add `Access-Control-Allow-Origin: <that value>`, `Vary: Origin`, allow methods `GET, POST, OPTIONS`, header `Content-Type`; answer `OPTIONS` with 204. Unset → no CORS headers and `OPTIONS` falls to 404.

#### 5. Tests

**Files**: `api/test/handler.test.js`, `api/test/validate.test.js`

**Intent**: Cover routing, validation, status codes and the privacy invariant without a database.

**Contract**: Call the handler with a fake `data` object and fake req/res (or a real `http` server on port 0). Assert: list/get/post happy paths; 404 for unknown id; each 400 reason; 422 below half; `percent: null` passthrough; sort order; CORS headers present only with `CORS_ORIGIN` set (set/restore `process.env` per F-02 convention); during a POST, `console.log`/`console.error` are never called with any answer value (spy).

### Success Criteria:

#### Automated Verification:

- API tests pass without a database: `npm run test:api`
- Full suite passes: `npm test`
- Entry file still starts: `node -e "require('./api/handler')"` exits 0

#### Manual Verification:

- With local MariaDB and `CORS_ORIGIN=http://localhost:4200`: `curl /api/quizzes`, `GET /api/quizzes/1`, and a POST with 4 of 8 answers return expected shapes; 3 answers → 422
- `curl /api/health` and `/api/health/db` unchanged
- Browser `OPTIONS` preflight from `http://localhost:4200` succeeds; without `CORS_ORIGIN` it does not

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: Angular quiz flow

### Overview

Front end: list, one-question-per-screen run with visible source, gated submit, result screen. Answers live only in an in-memory component signal.

### Changes Required:

#### 1. HTTP wiring and environments

**Files**: `src/app/app.config.ts`, `src/environments/environment.ts`, `src/environments/environment.development.ts`, `angular.json`

**Intent**: Provide `HttpClient` and an environment-driven API base URL: relative `/api` in production, `http://localhost:3000/api` in development via `fileReplacements` in the `development` build configuration (serve default is development, build default is production — `angular.json:81,93`).

**Contract**: `provideHttpClient(withFetch())`; `environment.apiBaseUrl` string.

#### 2. API client and models

**File**: `src/app/quiz-api.ts` (+ `src/app/quiz.models.ts`)

**Intent**: Typed wrapper over the three endpoints.

**Contract**: `listQuizzes()`, `getQuiz(id)`, `submitAnswers(id, answers)` returning Observables of the payload types from Phase 3. Keep `noPropertyAccessFromIndexSignature` happy with typed interfaces. No storage of answers.

#### 3. Shell, routes, components

**Files**: `src/app/app.html`, `src/app/app.ts`, `src/app/app.routes.ts`, new `src/app/quiz-list/`, `src/app/quiz-run/`

**Intent**: Replace the starter placeholder with a minimal shell (title, router outlet) and two routed pages: `''` quiz list and `'quiz/:id'` run + result (result is a state of the run component, so answers never pass through router state or URL). Follow repo conventions: standalone, signals, SCSS, no `.component` suffix, Polish copy, Prettier.

**Contract**:
- List: title, description, "przykładowy" badge when `isSample`, link per quiz; loading and error states.
- Run: shows "pytanie k z M", question text, source label (link when `source.url`) and date, four controls (za, przeciw, wstrzymuję się, pomiń), back button, selected answer highlighted. "Pokaż wynik" is enabled only when answered count ≥ `minAnswered`, with an inline explanation otherwise; on submit calls the API; a 422 is shown as the same explanation (API is authoritative).
- Result: per party rounded `NN%`, "na podstawie k z M pytań" (`counted` of `total`), "brak danych" when `percent` is null, parties in API order, short note on how it is computed (the quiz is a sample when `isSample`, and the result is an indication, not a recommendation), button to retake. Works at phone width.

#### 4. Specs

**Files**: `src/app/quiz-api.spec.ts`, `src/app/quiz-run/quiz-run.spec.ts`

**Intent**: Cover client behaviour that has logic.

**Contract**: Vitest globals; `provideHttpClientTesting`. Specs: `quiz-api` requests the right URLs/body; run component enables "Pokaż wynik" exactly at `answered >= minAnswered` (e.g. 3 of 8 disabled, 4 of 8 enabled), skipping does not count, and no answer is written to `localStorage`/`sessionStorage`.

### Success Criteria:

#### Automated Verification:

- App specs pass: `npm run test:app`
- Full suite passes: `npm test`
- Production build succeeds within budgets: `npm run build`
- Formatting clean: `npx prettier --check src api`

#### Manual Verification:

- `ng serve` + local API: complete the sample quiz on a phone-width window; result renders, "brak danych" appears for the sparse party
- Answer 3 of 8: button disabled with explanation; 4 of 8: enabled
- Reload mid-quiz loses answers (expected) and DevTools → Application shows nothing stored
- The source (and date) is visible on every question screen

**Implementation Note**: Pause for manual confirmation before Phase 5.

---

## Phase 5: Verification and docs

### Overview

Prove it on the real host and record the decisions where future work will read them.

### Changes Required:

#### 1. Deploy smoke checks

**File**: `.github/workflows/deploy-vhpl.yml`

**Intent**: Extend the existing smoke step so a broken quiz API fails the deploy.

**Contract**: After the `/quiz/1` check, `GET ${SITE_URL}/api/quizzes` must return HTTP 200 with a non-empty JSON array, guarded like the DB check so older rollback commits (without `api/quiz-data.js`) skip it. No POST in the smoke test.

#### 2. Latency re-measure

**Manual step** using `scripts/measure-latency.sh <url> 10 /api/quizzes` after an idle period (see `infrastructure.md:226,238`); record the first-request-after-idle time against the 2 s NFR.

#### 3. Documentation

**Files**: `context/foundation/prd.md`, `context/foundation/roadmap.md`, `api/README.md`, `CLAUDE.md`

**Intent**: Foundation docs are edited in place. Record the formula clarifications (przeciw↔wstrzymuję się = 0.25; `brak danych` for zero denominator; integer % rounding and the "na podstawie k z M pytań" disclosure, partially answering OQ7), the S-01 outcome in the roadmap, API endpoints and `CORS_ORIGIN` in `api/README.md`, and refresh the "Project state" paragraph of `CLAUDE.md`.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npm test`
- Workflow YAML parses: `node -e "require('fs').readFileSync('.github/workflows/deploy-vhpl.yml','utf8')"` (syntax review in PR; actionlint if available)

#### Manual Verification:

- After a manual `workflow_dispatch` deploy: smoke checks green; sample quiz works on the real host end to end
- First request after idle < 2 s (record the measured value in `infrastructure.md` risk row)
- No answer content appears in host `stderr.log` / access logs after a test run
- Docs mention the sample-content caveat so the product is not published with it (roadmap OQ13)

---

## Testing Strategy

### Unit Tests:

- `api/test/scoring.test.js`: matrix, weights, skipped, no-stance, `null`, gate boundaries (8/4, 9/4, 9/5), neutrality
- `api/test/validate.test.js`: every invalid-body reason
- `src/app/quiz-run/quiz-run.spec.ts`: gate at `minAnswered`, no browser storage

### Integration Tests:

- `api/test/handler.test.js`: routes with a fake data layer, status codes, CORS only when configured, privacy log spy
- Real SQL is verified manually (migrations on local MariaDB) and by the deploy smoke check; no CI database by decision.

### Manual Testing Steps:

1. Run migrations locally, start API with `CORS_ORIGIN=http://localhost:4200`, `npm start`.
2. Take the sample quiz with 4 of 8 answered; confirm each party's % by hand against the PRD formula.
3. Try 3 of 8; try all-skipped; try all-wstrzymuję.
4. Check phone width and the source visibility.

## Performance Considerations

PRD NFR: result < 2 s after the last answer. The result path is one indexed read set plus an O(questions × parties) loop; the risk is Passenger cold start / new DB connection after idle (first request measured 0.20 s, cold start not observed — `infrastructure.md:177-181`). Phase 5 re-measures. Plan B trigger stays: first request after idle > 2 s with no workaround.

## Migration Notes

Add-only, re-runnable migrations; rollback redeploys older code against the newer schema, which is harmless because nothing existing reads the new tables. The sample seed must be replaced by real content (admin panel S-05 or a later migration) before public launch.

## References

- Related research: `context/changes/s-01/research.md`
- Roadmap slice: `context/foundation/roadmap.md:110-123`; formula: `context/foundation/prd.md:116-122`; privacy: `context/foundation/prd.md:106`
- Prior decisions: `context/archive/2026-11-11-f-02/plan.md:40-41`, `context/archive/2026-11-07-f-01/plan.md:37-56,109-126`
- Existing code: `api/app.js:31-40`, `api/db.js`, `api/migrate.js`, `src/app/app.config.ts`, `.github/workflows/deploy-vhpl.yml:225-244`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Scoring module

#### Automated

- [x] 1.1 API tests pass: `npm run test:api` — a0b54d1
- [x] 1.2 Full suite passes: `npm test` — a0b54d1
- [x] 1.3 Module has no dependencies: `grep -c "require(" api/scoring.js` returns 0 — a0b54d1

#### Manual

- [x] 1.4 Hand-compute one 3-party PRD example and confirm it equals a test's expected value — a0b54d1

### Phase 2: Schema and sample seed

#### Automated

- [x] 2.1 Migration files match the runner pattern and sort after baseline — 56f7214
- [x] 2.2 API tests still pass: `npm run test:api` — 56f7214

#### Manual

- [x] 2.3 On local MariaDB `node api/migrate.js` applies both migrations and a second run is a no-op — 56f7214
- [x] 2.4 Sample quiz has at least 8 questions and every position row has a `source_date` — 56f7214
- [x] 2.5 No table or column can hold user answers — 56f7214

### Phase 3: API endpoints

#### Automated

- [x] 3.1 API tests pass without a database: `npm run test:api` — 463bfba
- [x] 3.2 Full suite passes: `npm test` — 463bfba
- [x] 3.3 Handler module loads: `node -e "require('./api/handler')"` exits 0 — 463bfba

#### Manual

- [x] 3.4 curl list, get and POST (4 of 8 answers) return expected shapes; 3 answers returns 422 — 463bfba
- [x] 3.5 `/api/health` and `/api/health/db` behave as before — 463bfba
- [x] 3.6 Browser preflight from `http://localhost:4200` succeeds with `CORS_ORIGIN` set and fails without it — 463bfba

### Phase 4: Angular quiz flow

#### Automated

- [x] 4.1 App specs pass: `npm run test:app`
- [x] 4.2 Full suite passes: `npm test`
- [x] 4.3 Production build succeeds within budgets: `npm run build`
- [x] 4.4 Formatting clean: `npx prettier --check src api`

#### Manual

- [x] 4.5 Complete the sample quiz at phone width; result renders and "brak danych" appears for the sparse party
- [x] 4.6 Answering 3 of 8 disables the button with an explanation; 4 of 8 enables it
- [x] 4.7 Reload loses answers and DevTools shows nothing stored
- [x] 4.8 Source and date are visible on every question screen

### Phase 5: Verification and docs

#### Automated

- [ ] 5.1 Full suite passes: `npm test`
- [ ] 5.2 Workflow file still parses and the new smoke check is guarded for older commits

#### Manual

- [ ] 5.3 After a `workflow_dispatch` deploy the smoke checks are green and the sample quiz works end to end on the real host
- [ ] 5.4 First request after idle is under 2 s and the value is recorded in `infrastructure.md`
- [ ] 5.5 No answer content appears in host `stderr.log` or access logs after a test run
- [ ] 5.6 PRD, roadmap, `api/README.md` and `CLAUDE.md` updated, including the sample-content caveat
