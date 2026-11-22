# Result Position Justification and Real Quiz Content — Plan Brief

> Full plan: `context/changes/result-position-justification/plan.md`
> Frame brief: `context/changes/result-position-justification/frame.md`

## What & Why

The result screen is a black box: it shows a percent per party and nothing about why. The actual problem to plan around is that the result API and UI have no path to show, after answering, each party's stance with justification, source and date per question, and the real content that will fill it is a separate piece of work with its own blockers, not yet a settled input. This plan builds the display and, in a gated last phase, the way to hand over and import the real content.

## Starting Point

The database already has the columns for stance, justification, source and date, but the sample seed leaves justification empty, the API never reads it, and the UI has no slot for it. Stances are hidden before answering by a tested contract. Content can only enter through SQL migrations; migration 0007 (sample quiz) is already applied on production, and rollback never undoes migrations.

## Desired End State

After finishing the quiz you open a collapsible block per question and see your answer next to every party's stance, justification, source link and date. You hand over real content by filling one JSON file (or pasting notes for me to normalise); a validator rejects incomplete data and a generator produces the migration that replaces the fictional sample quiz, after you have reviewed every stance against its source.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Problem scope | Display contract is the core; real content is a gated last phase | Display has no blockers; content depends on your data and decisions | Frame |
| Data hand-over | One JSON file per quiz in `content/quizzes/` | No new dependency, long Polish text works, and it is validated before SQL exists | Plan |
| Stance entry | Final stance plus optional vote counts, checked by the validator | Applies the same majority rule to every party | Plan |
| Club-majority rule | More than 50% of the whole club, so each vote carries `clubSize` | The PRD says only "większość klubu"; you chose the strictest reading | Plan |
| Exposure of stances | All questions, inside `POST /result` | Keeps `GET /quizzes/:id` hiding stances and its test valid, with no new endpoint | Plan |
| Result layout | Per question, expandable | Compares all parties on the same question, matching roadmap S-02 | Plan |
| Sample quiz | Deleted in the real-content migration | Fake stances must not sit beside real ones at launch | Plan |
| Strictness | Strict validation, local `--draft` that never writes a migration | Production cannot receive an incomplete quiz while you can preview partial content | Plan |

## Scope

**In scope:** content JSON format, README and template; validator and SQL generator with tests; stances in the POST result response; per-question blocks on the result screen; real-content migration `0008`; doc updates.

**Out of scope:** admin panel and accounts; schema changes and storing vote counts; scoring changes; new endpoints; agreement markers; AI-drafted justifications; deployment.

## Architecture / Approach

A pure module `api/content.js` validates the JSON and renders the seed SQL, and a small CLI in `api/scripts/` drives it. `getScoringData` reads the extra position columns and the handler adds a `questions` array to the 200 response of `POST /result`. The Angular result view renders that array with native `<details>` blocks, using the quiz and answers the component already holds in memory, so nothing new is stored anywhere.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Content intake | JSON schema, README, template, validator, generator, tests | Rules too loose or too strict for your real data |
| 2. API contract | Per-question stances in the POST result response | Breaking the tested contract that hides stances before answering |
| 3. Result UI | Expandable per-question blocks with defined empty states | Long lists on small screens and text-only rendering of content |
| 4. Real content import | Real quiz migration `0008`, scratch-DB proof, docs | Irreversible production data; content readiness is unverified |

**Prerequisites:** a local MariaDB/MySQL scratch database for Phase 2 and Phase 4 checks; for Phase 4 only, your filled content file with at least 8 complete questions.
**Estimated effort:** about 3 sessions for Phases 1 to 3; Phase 4 is one more session once the data exists.

## Open Risks & Assumptions

- Frame confidence is MEDIUM: what real content you have ("some complete questions") cannot be checked from the repo.
- Roadmap questions on question selection, declaration verification and weights stay unresolved; the validator cannot judge neutrality of the question set, so Phase 4 depends on your review.
- Club sizes must be sourced at vote time for every vote-based stance you want checked; stances without counts only produce a warning.
- A mistake that reaches production needs a new migration; there is no admin panel to fix data.

## Success Criteria (Summary)

- You can see, for every question, each party's stance with justification, source and date on the result screen.
- You can hand over content in one documented file and get clear errors for anything incomplete or inconsistent.
- The real quiz replaces the sample locally after you have checked every stance against its source; the deploy stays your decision.
