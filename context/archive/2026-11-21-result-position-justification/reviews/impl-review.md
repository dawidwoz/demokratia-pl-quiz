<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Result Position Justification and Real Quiz Content

- **Plan**: context/changes/result-position-justification/plan.md
- **Scope**: Full plan (4 of 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-21
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence: every planned file matches its intent (no DRIFT, no MISSING); extras (`api/test/quiz-data.test.js`, exported `assembleScoringData`, roadmap status flips, extra validator rules and CLI guards) are harmless and respect the "NOT doing" list. All automated criteria were re-run: strict check on the real file (20 questions, 8 parties, 0 warnings), `npm test` (92 API + 21 app tests), production build, no sample text in migration 0008. Prettier is clean on the committed (LF) content; on this Windows checkout `core.autocrlf` gives the working copy CRLF, which makes Prettier flag 10 files, including older untouched test files, so it is not a defect of this change. The regenerated SQL is byte-identical to the committed `0008`. All 14 manual items in Progress are checked and were confirmed by the user in chat.

## Findings

### F1 — Result view crashes if the API response has no `questions`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/quiz-run/quiz-run.ts:72
- **Detail**: `new Map(result.questions.map(...))` throws a TypeError when a result has no `questions` field, for example the new front end talking to an older API after an API-only rollback. The throw happens inside a `computed`, so the whole result view fails, including the party scores that worked before.
- **Fix**: Guard with `(result.questions ?? [])` and add a spec for a result without `questions` that still shows the party scores.
- **Decision**: ACCEPTED (2026-11-22): the user accepts the risk without a fix. API and SPA ship in the same deploy; it only matters after an API-only rollback.

### F2 — Nothing ties the committed JSON to the migration or checks it in CI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: api/test/content.test.js (no case uses content/quizzes/sejm-x-kadencja.json)
- **Detail**: The tests only use synthetic documents. If someone edits the JSON, or the generated SQL by hand, the two drift silently and a broken JSON would only show at the next `content:build`. `.github/workflows/test.yml` runs only `npm test`.
- **Fix A ⭐ Recommended**: Add a test that validates every `content/quizzes/*.json` except `_template.json` with strict `validateContent` (0 errors, 0 warnings)
  - Strength: Catches a broken real file in CI with no coupling to migration numbers; the real file already passes.
  - Tradeoff: Does not detect hand edits of `0008`.
  - Confidence: HIGH — the same pure function the CLI uses.
  - Blind spot: A second real quiz file with intentional warnings would need an exception.
- **Fix B**: Also assert that `renderSeedSql(doc)` equals the committed `0008` apart from the header line
  - Strength: Detects any drift between JSON and migration.
  - Tradeoff: Fails as soon as a later migration supersedes `0008`, so it would need an explicit expiry.
  - Confidence: MEDIUM — depends on how corrections are shipped later.
  - Blind spot: How future content updates will be numbered.
- **Decision**: FIXED via Fix A (2026-11-22): `api/test/content.test.js` now validates every `content/quizzes/*.json` except `_template.json` with the strict rules (0 errors, 0 warnings) and requires at least one such file. Break check: a weight of 9 in the real file turns the test red.

### F3 — Migration 0008 deletes every party outside any quiz, and is not re-runnable

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: api/content.js:306 (generated into api/migrations/0008_seed_real_quiz.sql)
- **Detail**: `DELETE FROM parties WHERE id NOT IN (SELECT party_id FROM quiz_parties)` removes all parties without a quiz, not only the sample ones. Today that is only the four fictional parties, but it would also wipe parties added in advance by a future admin feature. The file is atomic (an error rolls back and `schema_migrations` is not written), but if the real ids or party names already exist the INSERTs fail with a duplicate key and block later migrations until fixed by hand. `0008` has not been applied to production yet, so it can still be regenerated.
- **Fix**: Make the generator delete only the parties linked to sample quizzes (collect them before the quiz delete), regenerate `0008`, and re-run the scratch-database check.
  - Strength: Removes the one data-affecting step that is broader than "retire the sample", before anything is deployed.
  - Tradeoff: A small generator and test change plus one more scratch-database run.
  - Confidence: HIGH — the foreign keys cascade from parties to positions and quiz links.
  - Blind spot: A party shared between a sample and a real quiz would still be deleted.
- **Decision**: FIXED (2026-11-22): the generator now deletes only parties linked to a sample quiz and not linked to any non-sample quiz, before deleting the sample quizzes (so a party shared with a real quiz is kept, which also closes the blind spot above). `0008` was regenerated; only the header and the delete statements changed, the 138 position rows are identical. Covered by a new test and a break check. PENDING for you: re-run the migration on a FRESH scratch database, because the SQL itself has not been run against MariaDB.

### F4 — Validator accepts some values the database or routes cannot use

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: api/content.js:15-16, 28-35, 37-38
- **Detail**: Ids and `clubSize` have no upper bound (a `quiz.id` of 10 digits would load but never be reachable, since routes accept at most 9 digits). `quiz.description` has no length check. URLs such as `http:example.com` or ones containing credentials pass `new URL()`. The party-name check only approximates the database collation. All of these fail loudly or harmlessly later (database error, rolled back), none is a security issue because Angular sanitises `javascript:` links.
- **Fix**: Cap ids at 999999999, `clubSize` at 460 and `description` at a sane length, reject URLs with whitespace or credentials, and note the collation limitation in a comment.
- **Decision**: ACCEPTED (2026-11-22): the user accepts without a fix. The strict check passes on the real file, and any value the database cannot take fails loudly and rolls back.

### F5 — A "brak" position loses its explanation

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: api/content.js:283
- **Detail**: For a position with `stance: "brak"` the generator writes no row, so its justification (for example "82 against, 109 absent" for question 102) never reaches the user, who sees only "Brak stanowiska". This follows from the `positions.stance` ENUM and the PRD rule, but it drops the most informative reason.
- **Fix A ⭐ Recommended**: Accept it and document it in `content/README.md` ("a `brak` justification is kept in the JSON only")
  - Strength: No schema change, consistent with the PRD stance rule and the scoring semantics.
  - Tradeoff: Users cannot see why a club had no stance.
  - Confidence: HIGH — three positions are affected today.
  - Blind spot: Whether users will ask for the reason.
- **Fix B**: Plan a follow-up that stores the explanation (needs a schema change)
  - Strength: Full transparency for no-stance cases.
  - Tradeoff: A migration, API and UI change for 3 positions.
  - Confidence: MEDIUM — depends on how many such cases real content will have.
  - Blind spot: The right place to store it.
- **Decision**: ACCEPTED (2026-11-22): the user accepts the loss without a fix; the explanation stays in the JSON only. Not documented in `content/README.md`.

### F6 — Result response repeats sources and is about 53 KB

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: api/quiz-data.js:70-76, api/handler.js:181-190
- **Detail**: For the real quiz each of 138 positions carries its own source label, URL and date, most of them identical within a question, and nothing compresses responses. This is acceptable for the PRD target of under 2 seconds at 5 to 50 users.
- **Fix**: No change now; enable gzip at the reverse proxy if the quiz grows.
- **Decision**: ACCEPTED (2026-11-22): the user accepts without a fix.
