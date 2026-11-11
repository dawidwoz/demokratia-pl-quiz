# Automated Test Baseline (F-02) — Plan Brief

> Full plan: `context/changes/f-02/plan.md`
> Research: `context/changes/f-02/research.md`

## What & Why

Make `npm test` at the repo root run the Angular app tests and the `api/` tests in one go, with one real logic test, and run it automatically on GitHub. Roadmap item F-02 needs this so that later slices, starting with the scoring formula in S-01, can be verified instead of trusted.

## Starting Point

No test runs today. Root `npm test` calls `ng test`, but `angular.json` has no `test` target and Vitest is not installed. `api/` is a separate plain CommonJS package with no test script. The one workflow is the manual deploy, with no test step.

## Desired End State

One command, `npm test`, runs the app tests then the API tests and fails if either fails. `npm run test:app` and `npm run test:api` run each side alone. A GitHub workflow runs the same command on pull requests and pushes to `main`, and the docs describe the working commands.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| First logic test | Existing API code: `readConfig()` in `api/db.js` | Smallest change with no product decisions; the formula waits for S-01. | Plan |
| Scoring formula location | `api/`, plain CommonJS (built in S-01, not here) | One authoritative implementation next to party positions and weights. | Plan |
| Runner pairing | Angular `unit-test` builder (Vitest) for the app, `node --test` for `api/`, chained by root `npm test` | The Angular builder cannot run `api/` tests, and Node's runner is stable and dependency-free. | Research / Plan |
| CI | New workflow on pull requests and pushes to `main`; deploy workflow untouched | Every change is checked without altering the workflow verified in F-01. | Plan |
| CI Node version | Node 24 | It is the version the host runs. | Plan |
| App spec | One smoke spec that creates the `App` component | `ng test` fails with "No tests found" when there are no specs. | Research |
| Test file names | `.spec.ts` in `src/`, `api/test/*.test.js` in the API | `tsconfig.app.json` excludes only `*.spec.ts`; `node --test` discovers `test/` by default. | Research |

## Scope

**In scope:**
- `vitest` and `jsdom` dev dependencies, a `test` target in `angular.json`, one app smoke spec
- `node --test` script and `readConfig()` tests in `api/`
- Root `test`, `test:app` and `test:api` scripts
- `.github/workflows/test.yml`
- Testing notes in `CLAUDE.md`, `README.md`, `api/README.md`; one line in the roadmap's S-01 block recording the formula location

**Out of scope:**
- The scoring formula and its undefined cases
- Changes to the deploy workflow or to production code in `api/`
- Tests that need a database, module mocking, coverage, linting, end-to-end tests

## Architecture / Approach

Two runners behind one command. The app goes through Angular's documented default path, which builds the specs and hands them to Vitest with a jsdom environment. The API uses Node's built-in runner directly on its CommonJS files, so it gains no dependencies and production installs are unaffected. The root `test` script chains the two with `&&`; the CI workflow installs both packages and runs that one script.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. App test runner | `npm run test:app` passes with one smoke spec and exits | New dev dependencies; the builder is marked experimental in the installed `builders.json` |
| 2. API tests and the single command | `readConfig()` tests and a root `npm test` covering both sides | Tests leaking or depending on the developer's `DB_*` environment |
| 3. CI and docs | Test workflow on GitHub and corrected docs | Workflow runs on Node 24 while the deploy build uses Node 22 |

**Prerequisites:** None. F-01 is merged; no database or host access is needed.
**Estimated effort:** About one session across 3 phases.

## Open Risks & Assumptions

- Whether the Angular `unit-test` builder is stable in 21.x is unconfirmed from a primary source; the plan accepts it because it is the default for new Angular 21 projects.
- The formula stays unverified until S-01, which then also has to decide its undefined cases.
- `api/test/` is copied to the host by the existing deploy; assumed harmless because Passenger starts `app.js` only.
- A failing test does not block a deploy, because the deploy workflow is unchanged.

## Success Criteria (Summary)

- `npm test` at the root passes, and fails when any test on either side fails.
- The test workflow passes on the pull request for this change.
- The docs no longer say tests don't work and name the three commands.
