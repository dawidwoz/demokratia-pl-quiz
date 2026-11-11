# S-01 Anonymous Quiz Result — Plan Brief

> Full plan: `context/changes/s-01/plan.md`
> Research: `context/changes/s-01/research.md`

## What & Why

An anonymous visitor takes a quiz and sees how closely they agree with each party, computed from weighted answers. This is the smallest end-to-end flow that meets the PRD Primary criterion and the first proof the product works. Answers must leave no trace in operator data.

## Starting Point

Only infrastructure exists: a MariaDB pool, a migration runner (only a no-op baseline), health endpoints, deploy and test scaffolding. There are no quiz tables, no endpoints, no scoring formula (F-02 only decided where it lives) and the Angular app is the bare scaffold with no routes or HttpClient.

## Desired End State

`/` lists the sample quiz, `/quiz/:id` runs it one question per screen with the source visible, and the result shows rounded % per party with "na podstawie k z M pytań" (or "brak danych"). The result button unlocks at half answered. Nothing about the answers is stored or logged; `npm test` covers formula, validation and routes without a database.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where scoring runs | Server, stateless `POST /api/quizzes/:id/result` | Follows the F-02 decision; one tested implementation; stances stay server-side | Research / Plan |
| przeciw↔wstrzymuję się | 0.25, symmetric | PRD only defines za↔wstrzymuję; asymmetry would bias against neutrality | Plan |
| Party with no stance on any answered question | `null` shown as "brak danych" | Honest, same algorithm for all parties, keeps every party listed | Plan |
| Result presentation | Integer % + "k z M pytań" per party | Familiar, but discloses the sample size behind each number (partial answer to OQ7) | Plan |
| Content | Sample seed, flagged `is_sample`, fictional party names | Unblocks building; avoids fake stances for real parties (my choice) | Plan |
| Seed mechanism | SQL migration `0003` | Reuses migration runner and deploy, no new tooling | Plan |
| Schema | Admin-ready normalized tables incl. justification/source/date per stance | S-02/S-05 need no breaking migration | Plan |
| API | Three endpoints, no router library, no stances returned | Smallest surface; respects minimal-deps hosting | Plan |
| API tests | Pure modules + injected data layer; no CI database | Keeps `npm test` DB-free as F-02 requires | Plan |
| Quiz UX | One question per screen; submit gated at half answered, API authoritative | Best on mobile; rule enforced in one place | Plan |
| Dev access to API | CORS only when `CORS_ORIGIN` is set (user's choice over proxy) | No CORS in production; needs an environment-based API URL in Angular | Plan |

## Scope

**In scope:** formula module + tests, schema + sample seed, three endpoints, Angular list/run/result, smoke check, latency re-measure, doc updates.

**Out of scope:** stance justification screen (S-02), accounts/saving (S-03/S-04), admin (S-05/S-06), PNG export (S-08), real content, client-side scoring, caching, rate limiting.

## Architecture / Approach

`api/scoring.js` (pure) ← `api/handler.js` (routes, validation, CORS) ← `api/quiz-data.js` (read-only mysql2) with `api/app.js` as the always-listening entry. Angular `quiz-api` service calls `/api` (absolute URL in dev, relative in production); answers live in a component signal only.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scoring module | Tested pure formula incl. open edge cases | Edge-case rules extend the PRD; must be recorded |
| 2. Schema + seed | Migrations 0002/0003 with sample quiz | Schema is hard to change later; rollback does not undo it |
| 3. API endpoints | Importable handler, 3 routes, validation, dev CORS | Refactoring `app.js` must not break Passenger startup or health checks |
| 4. Angular flow | List, run, result screens + specs | Starter placeholder replaced; environment/API URL wiring |
| 5. Verify + docs | Smoke check, latency number, PRD/roadmap/README updates | Real-host behaviour (latency, logs) only checkable after manual deploy |

**Prerequisites:** F-01 and F-02 done (they are); local MariaDB for manual checks; manual `workflow_dispatch` deploy for Phase 5.
**Estimated effort:** ~4–6 sessions across 5 phases; Phase 4 is the largest.

## Open Risks & Assumptions

- Sample content must be replaced before public launch (roadmap OQ13); it is flagged in data and UI.
- SQL queries are verified only manually and by the smoke check (no CI database by decision).
- Latency after idle on vh.pl is unmeasured under real traffic; plan B triggers above 2 s.
- Assumes the host's access logs record URLs only, not POST bodies (checked manually in 5.5).

## Success Criteria (Summary)

- An anonymous user completes the sample quiz and sees per-party agreement on the real host, on mobile.
- Below half answered there is no result; a party without stances shows "brak danych".
- `npm test` passes without a database and nothing about the answers is persisted or logged.
