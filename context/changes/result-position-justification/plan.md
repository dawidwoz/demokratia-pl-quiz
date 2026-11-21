# Result Position Justification and Real Quiz Content Implementation Plan

## Overview

Show, on the result screen, each party's stance with justification, source and date for every question (roadmap S-02), and give the user a repeatable way to hand over the real quiz content (parties, questions, stances, justifications) as one validated JSON file that is turned into the seed migration replacing the fictional sample quiz.

## Current State Analysis

Problem statement (from `frame.md`, confidence MEDIUM, treated as authoritative):

> The actual problem to plan around is: the result API and UI have no path to show, after answering, each party's stance with justification, source and date per question, and the real content that will fill it is a separate piece of work with its own blockers, not yet a settled input.

- The `positions` table already stores `stance`, `justification`, `source_label`, `source_url`, `source_date` (`api/migrations/0006_create_positions.sql:3-7`). The sample seed leaves `justification` and `source_url` NULL for all 29 rows (`api/migrations/0007_seed_sample_quiz.sql:41`).
- `getScoringData` reads only `question_id, party_id, stance` (`api/quiz-data.js:68`). `POST /result` returns only `{id, name, percent, counted}` per party (`api/handler.js:180-194`). `computeResult` drops per-question stances (`api/scoring.js:60-71`).
- `GET /api/quizzes/:id` hides stances on purpose, locked by a test (`api/test/handler.test.js:111-122`) and the README (`api/README.md:23`).
- The result view renders only name, percent and counted (`src/app/quiz-run/quiz-run.html:22-51`). `quiz()` and `answers()` stay in memory after submit (`src/app/quiz-run/quiz-run.ts:44, 129-133`), so a breakdown can be aligned with the user's answers without any new state.
- The only write path to the database is a SQL migration applied by `api/migrate.js` (names tracked, no hash). Migration 0007 is already applied on vh.pl, so the real content needs a new migration, and deploy rollback never undoes migrations (`.github/workflows/deploy-vhpl.yml:19-20`). `is_sample` only marks, never hides.
- The PRD defines no precise "club majority" rule beyond "większość klubu", ties meaning no stance, and abstain-majority being its own stance (`context/foundation/prd.md:120`). This plan resolves it (see Key Discoveries).
- No admin panel exists (S-03 blocked, S-05/S-06 unbuilt), so content cannot enter any other way.

## Desired End State

A user who finishes the quiz sees, under the party bars, a collapsible block per question showing their own answer and then every party's stance, justification, source link and date. You can deliver the real content by filling `content/quizzes/<slug>.json` (or pasting raw notes that I normalise into it). A validator rejects incomplete or inconsistent data, a generator produces `api/migrations/0008_seed_real_quiz.sql` that retires the sample quiz, and after review of every stance against its source the real quiz replaces the sample locally. Verified by `npm test`, a scratch-database migration run, and a manual walkthrough.

### Key Discoveries:

- Stances are exposed only in the stateless `POST /result` response, so `GET /api/quizzes/:id` and its test stay valid and no stance appears before answering (`api/handler.js:265-270`, `api/test/handler.test.js:111-122`).
- `mysql2` already exports `escape` (`api/node_modules/mysql2/index.js:41`), so the generator needs no new dependency for SQL string escaping. `api/` is synced whole to the host, minus `node_modules`, `tmp` and `stderr.log` (`.github/workflows/deploy-vhpl.yml:152-156`), so the generator under `api/` ships harmlessly; the content JSON under repo-root `content/` does not ship.
- Seed migrations must be data-only, one transaction, and a file is recorded only after it succeeds (`api/README.md:57-59`, `api/migrate.js:74-75`). FK cascades clear `questions`, `positions` and `quiz_parties` when a quiz is deleted, but `parties` rows are not cascaded.
- **Club-majority rule (decided with the user):** a vote-based stance needs more than 50% of the whole club, absent members counting against it, so each vote carries `clubSize`. With `clubSize` 200, `za` 90, `przeciw` 60, `wstrzymuje` 10 nobody exceeds 100, so the club has no stance. At most one option can ever exceed half, so the rule is deterministic.
- Order of party stances in the UI must not follow the score ranking; it follows `quiz.parties` order (party id) for every question, for neutrality.

## What We're NOT Doing

- No admin panel or admin write path (S-05, S-06) and no accounts (S-03).
- No schema change. Vote counts stay in the JSON file only; the DB has no column for them.
- No change to the scoring formula or to `GET /api/quizzes/:id`.
- No new API endpoint and no per-party grouping or separate details screen.
- No agreement marker ("zgodne / różne") per stance in this change; the user's answer and the party stance sit side by side and the percent already summarises the match.
- No AI-drafted justifications (FR-011) and no importing Sejm votes automatically.
- No deploy. The production deploy is a manual `workflow_dispatch` that you trigger after the review in Phase 4.
- No resolution of roadmap open questions on question selection criteria and declaration verification (OQ1, OQ2, OQ6, OQ13): the validator cannot judge neutrality of question choice, so Phase 4 keeps a human review step.

## Implementation Approach

Phase 1 comes first so you can start preparing real content while the code phases proceed. The data format is one JSON file with explicit ids (as in 0007) so a later correction can delete and re-insert the same rows in a new migration. A pure module (`api/content.js`) validates and renders SQL so it can be unit-tested under the existing `node --test` setup. Phases 2 and 3 are fully verifiable on fixtures and the sample seed, so they do not depend on real content. Phase 4 is gated on you delivering data and is the only irreversible one.

## Phase 1: Content intake — format, validator, generator

### Overview

Define the file you will hand me, validate it strictly, and generate the seed migration from it. No database, API or UI change.

### Changes Required:

#### 1. Intake format documentation and template

**File**: `content/README.md`, `content/quizzes/_template.json`

**Intent**: Tell you exactly how to pass data and give a copy-ready example. The README explains the fields, the rules the validator enforces, the commands to check and build, and the alternative of pasting raw notes in chat for me to normalise.

**Contract**: One file per quiz, `content/quizzes/<slug>.json`, with explicit integer ids unique within the file:
`quiz {id, title, description}`, `parties [{id, name}]`, `questions [{id, text, weight, source{label,url,date}, positions [{party, basis, stance, votes?, justification, source{label,url,date}}]}]`.
`basis` is `vote` or `declaration`. `stance` is `za`, `przeciw`, `wstrzymuje` or `brak`. `votes` is `{clubSize, za, przeciw, wstrzymuje}` and is optional. Keys starting with `_` are ignored for notes. The template contains two clearly fictional questions and is expected to pass only in draft mode.

#### 2. Validator and SQL renderer

**File**: `api/content.js`

**Intent**: Pure functions with no I/O: `validateContent(doc, {draft})` returns `{errors, warnings}`, and `renderSeedSql(doc, {sourceFile})` returns the migration text.

**Contract**: Strict rules (errors): at least 8 questions (draft relaxes only this) and at least 2 parties; ids are positive integers and unique; `quiz.title` ≤ 200, party name ≤ 120 and unique, question text ≤ 500, weight an integer 1 to 3, `source.label` non-empty ≤ 255, `source.url` optional http(s) ≤ 500, dates valid ISO `YYYY-MM-DD` and not in the future; every position references a known party, appears once per question and party, has a non-empty `justification` ≤ 1000 characters, a source label and date, and `basis` set. When `votes` is present: counts are non-negative integers, `za + przeciw + wstrzymuje ≤ clubSize`, and the stated stance must equal the derived one (option with count > `clubSize / 2`, else `brak`); `stance: "brak"` is accepted only with `votes` proving no majority. Warning only: `basis: "vote"` without `votes`. `stance: "brak"` positions produce no SQL row. Generated SQL: header comment naming the source file and "generated, do not edit"; `START TRANSACTION`; delete quizzes with `is_sample = 1`; delete parties not linked to any quiz; plain INSERTs for quiz (`is_sample = 0`), parties, quiz_parties, questions, positions in file order using `mysql2` `escape`; `COMMIT`. Output is deterministic for identical input.

#### 3. CLI and npm scripts

**File**: `api/scripts/build-content-migration.js`, `api/package.json`

**Intent**: Run the validator and generator from the command line with understandable messages (path and question or party id for each error).

**Contract**: `npm --prefix api run content:check -- <file> [--draft]` validates only and exits non-zero on errors. `npm --prefix api run content:build -- <file> --out api/migrations/NNNN_seed_real_quiz.sql` writes the file, and refuses to write when `--draft` is given; `--draft` prints the SQL to the screen only. The `--out` target must match `^\d{4}_.+\.sql$` and must not already exist.

#### 4. Tests

**File**: `api/test/content.test.js`

**Intent**: Cover the rules that protect production data, using `node:test` like the rest of `api/test/`.

**Contract**: Cases include: valid minimal doc; each error rule; the majority rule with `clubSize` 200 (101 `za` accepted, exactly 100 `za` rejected as `za` and accepted as `brak`, 101 `wstrzymuje` accepted as `wstrzymuje`); declaration basis without votes; draft versus strict question count; SQL escaping of an apostrophe, a backslash and Polish characters; `brak` writes no row; output is byte-identical on repeat; the generator refuses `--out` together with `--draft`.

### Success Criteria:

#### Automated Verification:

- API tests pass including the new content tests: `npm run test:api`
- Template passes in draft mode: `npm --prefix api run content:check -- ../content/quizzes/_template.json --draft`
- Template fails in strict mode with a non-zero exit and a message about the 8-question minimum: `npm --prefix api run content:check -- ../content/quizzes/_template.json`
- Formatting is clean: `npx prettier --check content api/content.js api/scripts api/test/content.test.js`

#### Manual Verification:

- You follow `content/README.md`, copy the template, fill in one real question and run the check; the error messages are understandable without reading the code.
- The draft SQL printed for the template looks right: sample deletion comes first, strings are quoted correctly, and no `brak` row appears.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: API contract — stances in the result response

### Overview

Return every party's stance, justification, source and date for every quiz question in the stateless `POST /api/quizzes/:id/result` response, without exposing stances before answering.

### Changes Required:

#### 1. Data access

**File**: `api/quiz-data.js`

**Intent**: Make `getScoringData` also read `justification`, `source_label`, `source_url` and `source_date` of each position, and expose them as a per-question detail list alongside the existing stance map that `computeResult` consumes.

**Contract**: `getScoringData` keeps its current return fields (`questions[{id, weight}]`, `parties[{id, name, positions}]`) and adds `details: [{questionId, positions: [{partyId, stance, justification|null, source: {label, url|null, date}}]}]`, questions in `sort_order`, positions by party id, dates formatted `YYYY-MM-DD` as in `getQuiz`. Still read-only and one query round.

#### 2. Handler response

**File**: `api/handler.js`

**Intent**: Add the details to the 200 response of `postResult` only.

**Contract**: 200 body becomes `{answered, total, parties, questions: [{id, positions: [{partyId, stance, justification, source}]}]}`. A party with no row for a question is simply absent from that question's `positions`. The 400, 413, 422 and 503 bodies are unchanged and carry no stances. `GET /api/quizzes/:id` is unchanged.

#### 3. Tests and docs

**File**: `api/test/handler.test.js`, `api/README.md`

**Intent**: Extend the fake data layer with details and lock in the contract; update the endpoint table.

**Contract**: New cases: 200 returns `questions` with positions in party-id order, a null justification stays `null`, a party without a row is absent, the 422 body has no `questions`; the existing GET test (no `weight`, `stance` or `positions`) must keep passing unchanged; the privacy tests (nothing logged, `no-store`) keep passing. README row for `POST /result` describes the new field.

### Success Criteria:

#### Automated Verification:

- API tests pass: `npm run test:api`
- Formatting is clean: `npx prettier --check api/quiz-data.js api/handler.js api/test/handler.test.js api/README.md`

#### Manual Verification:

- Against a local database seeded with the sample quiz, a POST of eight answers returns `questions` with positions, `justification` null and source label and date present; nothing about the answers appears in the API output or logs.
- `GET /api/quizzes/1` still shows no stances.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Result UI — per-question stance blocks

### Overview

Render the new data under the party bars as expandable blocks, one per question, using only state the component already holds.

### Changes Required:

#### 1. Models

**File**: `src/app/quiz.models.ts`

**Intent**: Mirror the new response so the compiler flags any mismatch.

**Contract**: Add `PartyPosition {partyId, stance: Answer, justification: string | null, source: QuestionSource}` and `QuestionPositions {id, positions: PartyPosition[]}`, and `questions: QuestionPositions[]` on `QuizResult`.

#### 2. Result template and styles

**File**: `src/app/quiz-run/quiz-run.html`, `src/app/quiz-run/quiz-run.ts`, `src/app/quiz-run/quiz-run.scss`

**Intent**: Under the party list add a section "Dlaczego taki wynik" with one native `<details>` per question (collapsed by default). The summary shows the question text and "Twoja odpowiedź: Za / Przeciw / Wstrzymuję się" or "Pominięte". The body lists every party of `quiz().parties` in that order with its stance as a text label, the justification, and the source label as a link (when a URL exists) plus the date in the same `dd.MM.yyyy` format as the question screen.

**Contract**: Defined states: no position for a party shows "Brak stanowiska"; `justification` null shows "Brak uzasadnienia w danych"; skipped question shows "Pominięte". All values are rendered as text interpolation, never as HTML; external links use `rel="noopener noreferrer"` and `target="_blank"` like the question source. Stance is conveyed by text, not colour alone. Party order never follows the score ranking. Answers stay in the component's signal only (no URL, router state or storage).

#### 3. Component tests

**File**: `src/app/quiz-run/quiz-run.spec.ts`

**Intent**: Extend the typed fixture and cover the states with the existing Vitest and jsdom conventions.

**Contract**: Cases: one block per question; stance label, justification, source link and date shown; party order equals `quiz.parties` order; "Brak stanowiska", "Brak uzasadnienia w danych" and "Pominięte" states; a justification containing `<b>` renders as text; the existing no-`setItem` privacy test still passes.

### Success Criteria:

#### Automated Verification:

- App tests pass: `npm run test:app`
- Production build passes: `npm run build`
- Formatting is clean: `npx prettier --check src/app/quiz.models.ts src/app/quiz-run`

#### Manual Verification:

- In the browser against the local API, finish the sample quiz, open blocks, and see a party with no stance, the missing-justification message and a skipped question rendered as described.
- Keyboard only: Tab reaches each summary and Enter or Space toggles it; light and dark themes keep the text readable.
- DevTools show no answers in the URL, local storage or session storage after the result.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Real content import (gated on your data)

### Overview

Runs only once you deliver the filled JSON. Validates it strictly, generates the migration that replaces the sample quiz, proves it on a scratch database, and gets your sign-off on every stance against its source. This is the only phase with an irreversible production effect, and it does not deploy.

### Changes Required:

#### 1. Real content file

**File**: `content/quizzes/<slug>.json`

**Intent**: The real quiz: at least 8 questions, real parties, and for each stance basis, justification, source and date. You deliver it either by filling the template or by pasting raw notes that I normalise into the file; I do not invent any stance, source, date or justification.

**Contract**: Must pass `content:check` in strict mode with zero errors; warnings (for example vote-based stances without `votes`) are listed to you for a decision.

#### 2. Generated seed migration

**File**: `api/migrations/0008_seed_real_quiz.sql`

**Intent**: Generated from the JSON with `content:build`. It deletes the sample quiz and its now-unlinked fictional parties and inserts the real quiz in one transaction.

**Contract**: Data statements only, one transaction, header naming the source file. After it is applied, a correction to content requires a new migration, not an edit.

#### 3. Documentation

**File**: `api/README.md`, `CLAUDE.md`

**Intent**: Remove the statements that the quiz content is sample and that S-02 is not built; point to `content/README.md` as the way to update content.

**Contract**: Edit the "sample quiz" paragraph in `api/README.md` and the "Project state" paragraph in `CLAUDE.md`; foundation docs are edited in place.

### Success Criteria:

#### Automated Verification:

- Strict check passes on your file with zero errors: `npm --prefix api run content:check -- ../content/quizzes/<slug>.json`
- Full test suite passes: `npm test`
- The migration exists and no sample text remains in it: `Select-String -Path api/migrations/0008_seed_real_quiz.sql -Pattern "Dane przykładowe"` returns nothing
- Formatting is clean: `npx prettier --check content api/README.md CLAUDE.md`

#### Manual Verification:

- On a scratch database: `cd C:\Projects\10xDEV\quiz\api`, set `$env:DB_HOST`, `$env:DB_USER`, `$env:DB_PASSWORD` and `$env:DB_NAME` (scratch database), run `node migrate.js` and see `applied 0008_seed_real_quiz.sql`, run it again and see `no pending migrations`; the sample quiz and fictional parties are gone and the question, party and position counts match the JSON.
- Locally, the quiz list shows only the real quiz without a sample badge, and the result screen shows a justification, source and date for every stance.
- You review every stance against its source: the justification matches the source, the link opens, the date is right, vote counts and `clubSize` are right, and every party is judged by the same rule.
- You decide when to deploy; it is a manual `workflow_dispatch` and migration 0008 cannot be undone by a rollback.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- Content validator rules and the club-majority boundary (`api/test/content.test.js`).
- SQL rendering: escaping, ordering, determinism, no row for `brak`.
- Handler response shape, ordering, null justification, unchanged 4xx bodies (`api/test/handler.test.js`).
- Result component states and text-only rendering (`src/app/quiz-run/quiz-run.spec.ts`).

### Integration Tests:

- No database tests exist in this project; migration behaviour is proven by the scratch-database run in Phase 4.

### Manual Testing Steps:

1. Fill one question from the template and run the check (Phase 1).
2. POST answers to a local API and inspect `questions` (Phase 2).
3. Complete the quiz in the browser and open the blocks, keyboard only (Phase 3).
4. Run the migration twice on a scratch database and review each stance (Phase 4).

## Performance Considerations

The response grows by at most questions × parties × 1000 characters of justification, a few tens of KB for a realistic quiz; the 1000-character cap in the validator keeps it bounded. The result must still appear within 2 s (PRD); positions come from the same query round as scoring.

## Migration Notes

Migration 0008 is applied by the manual deploy and cannot be undone by rollback. Corrections after deploy need a new migration (`DELETE` the quiz by id and re-insert, using the same explicit ids from the JSON). Follow the lesson in `context/foundation/lessons.md`: always test the migration locally on a scratch database first, in PowerShell.

## References

- Frame brief: `context/changes/result-position-justification/frame.md`
- Roadmap: `context/foundation/roadmap.md` (S-02, Open Roadmap Questions 1, 2, 6, 13)
- PRD: `context/foundation/prd.md:116-120` (business logic and stance rule)
- Similar implementation: `api/migrations/0007_seed_sample_quiz.sql` (seed pattern), `api/quiz-data.js:57-84` (scoring data query)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Content intake — format, validator, generator

#### Automated

- [x] 1.1 API tests pass including the new content tests — 33ed789
- [x] 1.2 Template passes the content check in draft mode — 33ed789
- [x] 1.3 Template fails the content check in strict mode with a non-zero exit — 33ed789
- [x] 1.4 Formatting check is clean for the content files — 33ed789

#### Manual

- [x] 1.5 Following the README, a filled-in question can be checked and errors are understandable — 33ed789
- [x] 1.6 Draft SQL for the template reads correctly (sample deletion first, quoting, no brak row) — 33ed789

### Phase 2: API contract — stances in the result response

#### Automated

- [x] 2.1 API tests pass with the new result-response cases — c84b9dd
- [x] 2.2 Formatting check is clean for the API files — c84b9dd

#### Manual

- [x] 2.3 Local POST of eight answers returns positions with justification null and source label and date — c84b9dd
- [x] 2.4 GET quiz still shows no stances — c84b9dd

### Phase 3: Result UI — per-question stance blocks

#### Automated

- [x] 3.1 App tests pass
- [x] 3.2 Production build passes
- [x] 3.3 Formatting check is clean for the app files

#### Manual

- [x] 3.4 Browser walkthrough shows no-stance, no-justification and skipped states
- [x] 3.5 Keyboard-only toggling works and both themes stay readable
- [x] 3.6 No answers appear in the URL or browser storage after the result

### Phase 4: Real content import (gated on your data)

#### Automated

- [ ] 4.1 Strict content check passes with zero errors on the real file
- [ ] 4.2 Full test suite passes
- [ ] 4.3 Generated migration exists and contains no sample text
- [ ] 4.4 Formatting check is clean for content and docs

#### Manual

- [ ] 4.5 Scratch-database migration applies, reruns as no pending, and counts match the JSON
- [ ] 4.6 Local quiz list and result screen show only real content with justifications
- [ ] 4.7 Every stance is reviewed against its source and signed off
- [ ] 4.8 You decide when to deploy and know that migration 0008 cannot be rolled back
