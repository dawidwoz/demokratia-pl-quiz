<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 Anonymous Quiz Result

- **Plan**: context/changes/s-01/plan.md
- **Scope**: Full plan (Phases 1-5 of 5)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria re-run on commit f754bbc: `npm test` (10 app specs, 44 API tests) pass, `npm run build` succeeds (264 kB initial), handler loads, `grep -c "require(" api/scoring.js` returns 0, Prettier clean on src and on the API files from this PR. All 38 Progress rows are `[x]` with SHAs; the manual rows have observable evidence (latency in infrastructure.md, docs in the diff). Not verified by this review: the SQL has not been run by the reviewers (the author ran it locally and on vh.pl).

## Findings

### F1 — A quiz with zero questions breaks POST and renders a blank page

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: api/handler.js:152, api/scoring.js:36-38, src/app/quiz-run/quiz-run.html:57-129
- **Detail**: `computeResult` throws RangeError for an empty question list (also for an invalid weight or stance read from the DB). It is called outside any try, so POST /result answers 500 `internal_error` and logs "unhandled api error". On the client, a 0-question quiz loads with `questions: []` and `minAnswered: 0`; the `@else if (question(); as question)` branch has no `@else`, so the page renders nothing and has no way back, while the list still shows "Liczba pytań: 0" with a start button.
- **Fix**: Hide quizzes without questions from `listQuizzes`/treat them as not found in `getQuiz` and `getScoringData`, map a RangeError from the scorer to a defined 503, and add an `@else` message with a back link in `quiz-run.html`.
  - Strength: Fixes both ends; an admin who creates an empty quiz in S-05 will not break the live site.
  - Tradeoff: Slightly more SQL (`HAVING COUNT(...) > 0` or an EXISTS) and one template branch.
  - Confidence: HIGH — failure reproduced by the reviewer with a fake data layer.
  - Blind spot: Behaviour of the changed SQL on MariaDB not run.
- **Decision**: FIXED (Fix now): quiz-data.js hides and 404s quizzes without questions, handler maps a scorer RangeError to 503, quiz-run.html shows "Ten quiz nie ma jeszcze pytań" with a back link; tests added

### F2 — Quiz page does not reload when only the route id changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/quiz-run/quiz-run.ts:50-65
- **Detail**: `load()` runs only in `ngOnInit`. Angular reuses the component when only `:id` changes (browser Back/Forward between /quiz/1 and /quiz/2), so the old quiz stays on screen with its old answers, `id` and `quiz` out of sync. A late response from an earlier load can also overwrite a newer one (no cancellation). Not confirmed in a browser; follows Angular's documented reuse behaviour. Only one quiz exists today, so it is latent.
- **Fix**: Load from the `id` input (an `effect`, or `toObservable(id)` with `switchMap` and `takeUntilDestroyed`) and reset answers, index and result whenever `id` changes.
  - Strength: Removes stale answers carried across quizzes and the race, with one small change.
  - Tradeoff: Needs a spec for the id-change case.
  - Confidence: MED — standard Angular behaviour, not reproduced in a browser.
  - Blind spot: Interaction with the signal-based `input()` in the spec setup.
- **Decision**: FIXED (Fix now): QuizRun loads from the id input via an effect, cancels the previous request, resets answers/index/result on id change; two specs added

### F3 — Seed uses INSERT IGNORE everywhere and the smoke check depends on it

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: api/migrations/0007_seed_sample_quiz.sql:6-71, .github/workflows/deploy-vhpl.yml:247-257
- **Detail**: `INSERT IGNORE` downgrades FK violations, truncation and type errors to warnings, so a broken seed can "succeed" with missing rows and still be recorded in `schema_migrations`. With hard-coded ids, pre-existing rows with the same ids make the seed silently skip, and the positions would attach to the wrong entities. The seed is already applied (locally and on vh.pl), so editing the file changes no live data, only how a fresh database behaves. The new smoke check requires `"id":` in `/api/quizzes`, which couples deploy success to sample or real data existing.
- **Fix A ⭐ Recommended**: Use plain `INSERT` inside the existing transaction so any error aborts (connection close rolls back), and keep idempotency out of the seed
  - Strength: Errors become visible; the runner already records a file only after it succeeds.
  - Tradeoff: A failed run must be retried after fixing the data, not re-run blindly.
  - Confidence: HIGH — behaviour of the runner read in api/migrate.js:66-75.
  - Blind spot: Edited file hash differs from what was applied on vh.pl (harmless, the runner tracks names only).
- **Fix B**: Leave as is and accept the risk until the real-content migration replaces the sample
  - Strength: No change to an applied migration.
  - Tradeoff: Silent partial seeds remain possible on any fresh database.
  - Confidence: MEDIUM — depends on nobody seeding ids 1-8 manually.
  - Blind spot: Not checked whether other environments exist.
- **Decision**: FIXED via Fix A: 0007 uses plain INSERT inside the transaction (comment and api/README.md updated)

### F4 — Database queue is unbounded and queries have no timeout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: api/db.js:49-57, api/quiz-data.js
- **Detail**: `connectionLimit` is 3 and `queueLimit` defaults to unlimited, with only `connectTimeout` set. If the DB hangs, requests hang and the queue grows. Each valid POST costs 4 queries and each GET quiz 3, with no application-level rate limiting; the host's 429 behaviour is the only protection.
- **Fix**: Set a `queueLimit` (for example 50) so overflow fails fast into the existing 503 path, and add a per-query timeout.
  - Strength: Bounded memory and fast failure using the existing `sendUnavailable` path.
  - Tradeoff: Choosing the numbers without load data on this host.
  - Confidence: MED — standard mysql2 pool options, not load-tested.
  - Blind spot: Passenger/Apache request timeouts not inspected.
- **Decision**: DELEGATED: separate session for the queueLimit and per-query timeout (db.js)

### F5 — "na podstawie k z M pytań" uses the total as denominator

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/quiz-run/quiz-run.html:46, api/handler.js:96
- **Detail**: `counted` is bounded by the answered questions, so a user who answered 5 of 8 may read "3 z 8" for a party that covered 3 of their 5 answers, which can mislead. Related edge: `Math.round(fraction * 100)` uses floats, so an exact x.5 percent that is not exactly representable (needs a weight sum of about 50 or more) could round down; fine for the sample.
- **Fix**: Show "z {{ result.answered }}" and update the PRD sentence that says "k z M".
- **Decision**: FIXED (Fix now): "na podstawie k z M pytań" now uses the answered count; PRD sentence and spec updated (float rounding edge left as a noted limitation)

### F6 — Small API hardening gaps

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: api/handler.js:50-54, :22-25, :56-89; api/app.js
- **Detail**: Public quiz endpoints return the raw DB error code (for example ER_ACCESS_DENIED_ERROR), which reveals infrastructure state; no `Cache-Control: no-store` on the result response and no `X-Content-Type-Options: nosniff`; after a 413 the handler keeps draining the body instead of closing the connection, and there is no explicit request timeout; `//x/api/health` and `/api/quizzes/000000001` resolve to real routes.
- **Fix**: Return a fixed `unavailable` code publicly (keep the real code in the log), add the two headers, send `Connection: close` on overflow, and set `server.requestTimeout`.
- **Decision**: FIXED (Fix now): fixed public code "unavailable" (real code only logged), Cache-Control: no-store on /result, nosniff, Connection: close on 413, requestTimeout/headersTimeout, stricter id regex and path parsing; tests added

### F7 — Test gaps

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: api/test/handler.test.js:237-266, api/quiz-data.js, api/db.js (query)
- **Detail**: The plan's "console never called with an answer value" is asserted only on the success and 503 paths, not on 400, 413 and 422. The SQL in quiz-data.js and the retry in `query()` have no automated coverage (by decision: no CI database); they were verified manually.
- **Fix**: Extend the console spy to the 400, 413 and 422 paths and add a unit test for the `query()` retry using a fake pool.
- **Decision**: FIXED (Fix now): console spy extended to 400/413/422; db-query.test.js covers the query() retry; quiz-data.js SQL still has no automated test (by decision)

### F8 — Stale documentation text

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: api/README.md (Migrations section), CLAUDE.md (tech-stack bullet)
- **Detail**: The README still names `0002_create_parties.sql` as the example of the next migration, but 0002 and 0003 now exist. CLAUDE.md still cites "MVP target 2026-11-04", a date the project memory says was dropped (target is 2026-12-06), and says "US-01" where S-01 is meant in one place.
- **Fix**: Update the example to `0008_...`, the MVP date to 2026-12-06 and the reference to S-01.
- **Decision**: FIXED (Fix now): README migration example, MVP date and S-01 reference in CLAUDE.md

### F9 — Lesson not followed: PowerShell migration-test reminder

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/lessons.md:5-10
- **Detail**: The accepted rule says to remind the user, whenever a migration is added, how to test it locally in PowerShell with a scratch database (`$env:DB_*` then `node migrate.js`). In Phases 2 and 3 the reminder given was the generic `node api/migrate.js`, not that recipe. The checks passed anyway.
- **Fix**: Give the exact PowerShell recipe from the lesson the next time a migration is added or changed (F3 would trigger it).
- **Decision**: FIXED (Fix now): PowerShell scratch-database recipe from lessons.md given for the changed 0007 migration
