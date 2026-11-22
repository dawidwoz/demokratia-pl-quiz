# Frame Brief: Result position justification and real quiz questions

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The result shows only a whole-percent agreement per party. The `positions` table already has
`justification`, `source_label`, `source_url` and `source_date` per party stance, but the result
API and UI expose none of them. The quiz content is fictional sample data (`is_sample = 1`).

## Initial Framing (preserved)

- **User's stated cause or approach**: Showing the justification (roadmap S-02) and creating the real
  questions belong in one change.
- **User's proposed direction**: One change, `result-position-justification`, that does both.
- **Pre-dispatch narrowing**:
  - Leading concern: "Result is a black box".
  - Content scope: "Full launch content" (at least 8 questions, real parties, every stance sourced and dated).
  - Source of content: "Mixed" (some ready, some still to research).
- **Post-investigation narrowing** (Step 4):
  - Real content today: "Some complete questions" (some questions have real stances with justification, source and date; the rest are missing).
  - Reason for coupling: "Avoid replacing data twice".

## Dimension Map

The observation could originate at any of these dimensions:

1. **Data** — `positions` holds justification/source/date, but the seed may leave them empty.
2. **API contract** — the justification may never leave the database.
3. **UI** — the result view may have nowhere to show per-question, per-party detail.
4. **Content pipeline** — real content may have no write path other than SQL migrations.
5. **Coupling** — display and content may have different blockers and risk, so one change may be the wrong cut. ← initial framing

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Data gap: seed omits justification | `0007_seed_sample_quiz.sql:41` column list omits `justification` and `source_url`, so all 29 positions have NULL justification. `source_label` and `source_date` are filled. Schema is ready (`0006_create_positions.sql:3-7`). No justification text exists anywhere in the repo. | STRONG (a seed gap, not a schema gap) |
| 2. API never exposes it | `quiz-data.js:68` selects only `question_id, party_id, stance`. `getQuiz` withholds stances on purpose (`quiz-data.js:25`, `api/README.md:23`, locked by the test at `handler.test.js:111-122`). `formatParties` (`handler.js:180-194`) returns only `{id, name, percent, counted}`. `scoring.js:60-71` drops per-question stances. The archived S-01 plan cut this on purpose (`context/archive/2026-11-11-s-01/plan.md:30`). | STRONG |
| 3. UI has no slot | `quiz-run.html:22-51` renders only name, percent and counted. `quiz.models.ts:50-63` has no stance or justification type. No structural barrier: `quiz()` and `answers()` stay in memory after submit (`quiz-run.ts:44, 129-133`), and a source/date pattern already exists on the question screen (`quiz-run.html:64-76`). | STRONG for the missing slot, ABSENT for any layout barrier |
| 4. Content only enters via migrations | `migrate.js` is the only DB writer. There is no admin write path, and S-05/S-06 are unbuilt (S-03 blocked). Migration 0007 is already applied on vh.pl and the runner tracks names only, so editing it does not change production. Real content needs a new numbered migration. Deploy runs migrations and rollback never undoes them (`deploy-vhpl.yml:19-20, 159-213`). `is_sample` only marks, never hides, so sample and real quizzes would both be listed. | STRONG |
| 5. Display and content have different blockers | S-02 lists `Blockers: —`, `Unknowns: —` (`roadmap.md:134`). Real content depends on user-owned open questions: roadmap OQ1, OQ2, OQ13 and PRD OQ6 (`roadmap.md:234-239, 246`), plus external research. None are resolved. Display can be fully verified on fixtures and sample content (`handler.test.js` mocks the data layer; `quiz-run.spec.ts` uses typed fixtures). | STRONG |

## Narrowing Signals

- The leading concern is the black-box result, so the display contract is the confirmed core.
- The only reason given for coupling is not wanting to write sample justifications and then replace them. That reason concerns throwaway sample data, not the code.
- Some real content exists, but a quiz needs at least 8 complete questions (`prd.md:35, 41`) and "some complete questions" is not that.
- Whether the existing real questions meet the PRD rules (club majority, abstain as a stance, 50/50 meaning no row, source and date on every stance) cannot be verified from the repo.

## Cross-System Convention

The roadmap already treats these as different kinds of work. S-01 shipped on sample content because
"sample content can unblock building; publishing cannot" (archived `research.md:104`, `roadmap.md:120`).
Real content is tracked as OQ13 with `Block: publikacja`, and the admin slices S-05 and S-06 are the
intended long-term write path. The initial framing runs against that convention, but only on the
coupling. On the diagnosis (black box, content not real) it matches.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the result API and UI have no path to show, after answering,
> each party's stance with justification, source and date per question, and the real content that will
> fill it is a separate piece of work with its own blockers, not yet a settled input.

The diagnosis held: the result is a black box and the content is fictional. What the evidence does not
support is treating them as one unit of work. Showing stances is a read-only contract and UI gap that
needs no human decision and can be verified without real data. The real content has unresolved
decisions (selection criteria, who prepares it, declaration-verification rules, weights), enters only
through a migration that deploy cannot undo, and the user holds only some complete questions. The
user's reason, avoiding a double data replacement, is addressed without coupling, because the display
side does not need seeded sample justifications to be verified.

## Confidence

**MEDIUM.** Evidence for the separation is strong and documented. Two points keep it from HIGH. First, the
real-content inventory ("some complete questions") cannot be checked from the repo. Second, I did not run
a context-free independent search. The prior-occurrence check came from the content-pipeline agent
instead.

## What Changes for /10x-plan

The plan should centre on the per-question stance, justification, source and date contract and its
result UI, including the case where `justification` is NULL. It also has to respect the tested rule
that stances stay hidden before answering. Real content should be scoped explicitly as either a
separate change or a named, gated part of this one. The scoping call is the user's to make in
planning, because it decides what this change is able to ship.

## References

- Source files: `api/migrations/0006_create_positions.sql:3-7`, `api/migrations/0007_seed_sample_quiz.sql:41`,
  `api/quiz-data.js:25,68`, `api/handler.js:180-194,265-270`, `api/scoring.js:60-71`,
  `api/test/handler.test.js:111-122`, `src/app/quiz-run/quiz-run.html:22-51,64-76`,
  `src/app/quiz-run/quiz-run.ts:44,129-133`, `src/app/quiz.models.ts:50-63`, `api/migrate.js`,
  `.github/workflows/deploy-vhpl.yml:19-20,159-213`
- Context: `context/foundation/roadmap.md` (S-02, S-05, S-06, OQ1/2/6/13),
  `context/foundation/prd.md:35,41,116-120`, `context/archive/2026-11-11-s-01/plan.md:30`
- Related research: none yet for this change
- Investigation tasks: three read-only Explore agents (data and API, UI, content pipeline and coupling)
