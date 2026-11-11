---
date: 2026-11-11T09:55:51+01:00
researcher: Claude Code (claude-fable-5-2)
git_commit: 17d9a1d09c18d6bb113315df9de04af7ca6b6807
branch: main
repository: demokratia-pl-quiz
topic: "F-02 automated test baseline: what the codebase already has for running tests with one command across the app and the API"
tags: [research, codebase, testing, vitest, angular, api, scoring-formula]
status: complete
last_updated: 2026-11-11
last_updated_by: Claude Code (claude-fable-5-2)
---

# Research: F-02 automated test baseline

**Date**: 2026-11-11T09:55:51+01:00
**Researcher**: Claude Code (claude-fable-5-2)
**Git Commit**: 17d9a1d09c18d6bb113315df9de04af7ca6b6807 (working tree also has uncommitted edits to `CLAUDE.md` and `context/foundation/roadmap.md`, and the untracked `context/changes/f-02/`)
**Branch**: main
**Repository**: demokratia-pl-quiz

## Research Question

`/10x-research f-02`. The change has no stated question beyond its roadmap entry, so the question is taken from the F-02 outcome (`context/foundation/roadmap.md:97`): tests run with one command, include at least one logic test, and the same approach works for app code and API code. What does the codebase already have towards that, what is missing, and what constraints must the plan respect?

This is internal research only. It does not compare runners or consult library documentation; that is external research (exa.ai, Context7) for the planning step.

## Summary

- **No test runs today, on either side.** The root `npm test` script calls `ng test` (`package.json:9`), but `angular.json` defines two architect targets, `build` (`angular.json:43`) and `serve` (`angular.json:83`), and no `test` target. `api/package.json:7-10` has two scripts, `start` and `migrate`, and no test script. No `*.spec.ts` or `*.test.ts` file exists under `src/`, and no test file exists under `api/`.
- **The front end is one target and two packages away from a working runner.** The installed `@angular/build` 21.2.24 ships a `unit-test` builder (marked experimental) whose default runner is Vitest. With default options it requires `vitest` plus `jsdom` or `happy-dom` to be installed; none of the three is in root `node_modules` or `devDependencies`. `tsconfig.spec.json:7-9` already declares `vitest/globals`.
- **The API is a separate, plain CommonJS JavaScript package**, not an npm workspace member, with its own lockfile and `node_modules`. Nothing at the root references `api/`. Covering it with the same command is the part of F-02 that the scaffold does not pre-solve.
- **There is nothing to test yet.** `src/app` holds five scaffold files with no logic, and the scoring formula is not implemented in `src/` or `api/`. F-02 must either add the formula (or a slice of it) as the first tested logic, or test existing API code.
- **The PRD formula has gaps that affect test cases.** The text defines za↔wstrzymuję się = 0.25 and za↔przeciw = 0 (`context/foundation/prd.md:122`) but does not define przeciw↔wstrzymuję się, a zero denominator, or rounding.
- **No document decides the runner, where the formula lives, or whether tests run in CI.** Vitest is implied by the scaffold, not chosen.

## Detailed Findings

### Front-end test tooling (Angular, repo root)

- `angular.json` has one project with two architect targets: `build` using `@angular/build:application` (`angular.json:43`) and `serve` (`angular.json:83`). A search of the file for a `"test"` key returns nothing.
- Schematics set `skipTests: true` for eight schematic types (`angular.json:15-36`), so `ng generate` does not create spec files. The scaffold itself was generated with `--skip-tests` (`context/changes/bootstrap-verification/verification.md:53`).
- `tsconfig.spec.json:7-9` sets `types: ["vitest/globals"]`; its `include` is `src/**/*.d.ts` and `src/**/*.spec.ts` (`tsconfig.spec.json:11-14`).
- `tsconfig.app.json:9-14` includes `src/**/*.ts` and excludes `src/**/*.spec.ts`. A file named `*.test.ts` under `src/` matches the include and not the exclude, so it would be compiled into the app build. Inference: use the `.spec.ts` suffix for front-end tests unless both tsconfigs change.
- `tsconfig.json:24-29` references `./tsconfig.app.json` and not the spec config (affects IDE and `tsc -b`, not the builder).
- `src/app` contains `app.ts`, `app.html`, `app.scss`, `app.config.ts` and `app.routes.ts`. `app.routes.ts` exports an empty `routes` array and `app.html` is the CLI placeholder. None of the five contains business logic.
- `README.md:39-45` says unit tests run with `ng test` and Vitest. This is CLI boilerplate and does not match the repo: the target and the package are both absent.

### What the installed Angular builder provides

- `node_modules/@angular/build/package.json:3` is version 21.2.24. `node_modules/@angular/build/builders.json` lists a `unit-test` builder, described as experimental.
- `vitest ^4.0.8` is declared as a peer dependency (`node_modules/@angular/build/package.json:72`) and marked optional (`:108`).
- Builder defaults, from `node_modules/@angular/build/src/builders/unit-test/schema.json` and `options.js`: `runner` defaults to `vitest`; `buildTarget` defaults to the project's `build:development`; `tsConfig` defaults to `tsconfig.spec.json` when that file exists; `include` defaults to `**/*.spec.ts` and `**/*.test.ts`; no option is required.
- Dependency check before a Vitest run (`node_modules/@angular/build/src/builders/unit-test/runners/vitest/index.js:22-46`):
  - `vitest` is checked in every case.
  - When `runnerConfig` is set, nothing else is checked.
  - When `runnerConfig` is not set and `browsers` is empty, `jsdom` or `happy-dom` must be installed. The check does not look at what the tests do, so it applies to pure-logic tests too.
  - When coverage is enabled, `@vitest/coverage-v8` is also checked.
- `vitest`, `jsdom`, `happy-dom`, `@vitest/*`, `karma` and `jasmine-core` are absent from root `node_modules`.

### API package (`api/`)

- Plain Node.js, CommonJS, no framework and no TypeScript. `api/package.json` has no `type`, `engines`, `devDependencies` or build script; its one dependency is `mysql2 ^3.11.0` (`api/package.json:11-13`).
- Source files: `api/app.js` (HTTP server), `api/db.js` (config and lazy pool), `api/migrate.js` (migration runner), `api/migrations/0001_baseline.sql`.
- Import safety, which decides what a unit test can load:
  - `api/app.js:40` calls `server.listen(...)` at module top level and the file has no `module.exports`. Requiring it from a test binds a port. Testing it needs a refactor (export the handler, guard the listen) or a child process plus HTTP.
  - `api/db.js` exports `getPool`, `ping`, `closePool`, `readConfig` and `MissingConfigError` (`api/db.js:83`). `mysql2/promise` is required inside `getPool()`, not at import. `readConfig()` reads `process.env` and is testable without a database. `isConnectionLost()` is pure but not exported.
  - `api/migrate.js` guards its CLI with `require.main === module` (`api/migrate.js:96`) and exports `migrate` (`api/migrate.js:118`). `migrate()` opens a MySQL connection, so it needs a real database or a mocked `mysql2/promise`. `listMigrationFiles()` is not exported.
- `context/changes/f-01/plan.md:274-288` names the migration runner's behaviours as candidates for F-02's baseline. That is a suggestion in the F-01 plan, not a decision.

### Relationship between root and `api/`

- Root `package.json` has no `workspaces` field. `api/` has its own `package-lock.json` and `node_modules`. Root `tsconfig.json`, `tsconfig.app.json` and `tsconfig.spec.json` include paths under `src/` and none under `api/`.
- Consequence: a test that imports an API module which requires `mysql2` resolves it from `api/node_modules`, so `api/` dependencies must be installed wherever the tests run.
- Not verified: whether the Angular `unit-test` builder can include test files outside `src/`. The dependency checker is constructed with `projectSourceRoot` (`runners/vitest/index.js:23`). If it cannot, API tests need a second runner invocation chained from the one command.

### CI and deploy

- One workflow exists, `.github/workflows/deploy-vhpl.yml`, triggered by `workflow_dispatch` (`:37`). It uses Node 22 (`:104`), runs `npm ci` and `npm run build` at the root (`:112-113`), and has no test step.
- `api/` is copied to the host without a build step, and the host runs `npm install --omit=dev` (`.github/workflows/deploy-vhpl.yml:182`). Test packages added to `api/` as `devDependencies` are therefore not installed in production.
- The host runs Node v24.21.0 (`context/foundation/infrastructure.md:130`, `:156`), while CI uses Node 22. A test run in CI would exercise API code on a different major version than production.
- No pull-request or push workflow exists, so adding tests to CI means either a new workflow or a step in the manual deploy workflow.

### The scoring formula (the first logic to test)

Source: `context/foundation/prd.md:114-122`, repeated in `context/foundation/shape-notes.md:36`.

Cases the text supports:

| Case | Rule | Source |
| --- | --- | --- |
| Same answer (za, przeciw or wstrzymuję się) | counts the full question weight | `prd.md:122` |
| za ↔ wstrzymuję się | counts 0.25 of the weight | `prd.md:122` |
| za ↔ przeciw | counts 0 | `prd.md:122` |
| Skipped question | excluded from numerator and denominator | `prd.md:122` |
| Party has no position (club split evenly) | question does not count for that party | `prd.md:120` |
| Weights | scale 1–3, set by the admin | `prd.md:118` |
| More than half the questions skipped | no result shown | `prd.md:122` |
| Exactly half answered | result shown ("co najmniej połowę") | `prd.md:116` |

Not defined in the PRD (each needs a decision before it can be asserted in a test):

- przeciw ↔ wstrzymuję się: 0.25 by symmetry, or 0.
- Denominator of 0: the user answered enough questions, but the party has no position on any of them.
- Rounding and output scale (fraction or percentage). Presentation is PRD open question Q7 (`prd.md:149`).
- Whether "half of the questions" counts all quiz questions or only those where the party has a position. The literal text reads as all quiz questions.
- Whether weights must be integers.
- No worked numeric example exists in `prd.md` or `shape-notes.md`.

The formula is not implemented: a search of `src/` and `api/` (excluding `node_modules`) for `scor`, `zgodno`, `agreement`, `0.25`, `weight` and `waga` matched CSS in `src/app/app.html` and nothing else.

## Code References

- `package.json:9` - root `test` script, `ng test`
- `angular.json:43`, `angular.json:83` - the two architect targets, `build` and `serve`
- `angular.json:15-36` - `skipTests: true` schematics
- `tsconfig.spec.json:7-14` - `vitest/globals` types, `*.spec.ts` include
- `tsconfig.app.json:9-14` - app include and `*.spec.ts` exclude
- `node_modules/@angular/build/src/builders/unit-test/runners/vitest/index.js:22-46` - dependency check
- `node_modules/@angular/build/package.json:72` - `vitest ^4.0.8` peer range
- `api/package.json:7-13` - API scripts and dependency
- `api/app.js:40` - `server.listen` at import time
- `api/db.js:83`, `api/migrate.js:96`, `api/migrate.js:118` - exports and CLI guard
- `.github/workflows/deploy-vhpl.yml:104`, `:112-113`, `:182` - Node 22, root build, `--omit=dev`
- `context/foundation/prd.md:114-122` - scoring formula
- `context/foundation/roadmap.md:95-106` - F-02 entry

## Architecture Insights

- The repo is two independent npm packages in one tree: a TypeScript ESM Angular app at the root and a CommonJS JavaScript API in `api/`. "One command for both" has to bridge that; the candidates visible from the code are a root script that chains two runs, or one runner configured over both trees.
- API modules follow a "no side effects on import" convention in `db.js` and `migrate.js`; `app.js` is the exception.
- The API has no build step and production installs without dev dependencies, so test tooling in `api/` stays out of the deployed app.
- No document says where the scoring formula runs (browser, API, or both) and no shared-code location exists. A pure module's location determines which side's test setup the first logic test exercises.

## Historical Context (from prior changes)

- `context/changes/f-01/plan-brief.md:35` - test runner declared out of scope for F-01 and deferred to F-02. Supported: no runner was added.
- `context/changes/f-01/research.md:130` - how API code needing MySQL is run and tested locally was left undecided and flagged as interacting with F-02. Still open.
- `context/changes/f-01/plan.md:161` - the one automated check in F-01 is `node --check` on API files.
- `CLAUDE.md` (project state paragraph on tests) - says `npm test` does not work for lack of a `test` target and Vitest. Supported by the current files. The same section's claims that the repo is a bare scaffold with no git history are contradicted: F-01 is merged (commits 33fd61d, 17d9a1d). The paragraph asks to be deleted once a runner and target exist.
- `context/foundation/infrastructure.md:8` - lists the language as TypeScript. Partial: true for the app, while the API as written is JavaScript.
- `context/archive/` contains a README and no archived changes.

## Related Research

- `context/changes/f-01/research.md` - API and deploy layout before F-01.

## Open Questions

Decisions for the user or the plan:

1. Which logic does the first test cover: the scoring formula (new code, matches the F-02 "Unlocks" line) or existing API code such as `readConfig()`? The roadmap outcome needs one logic test and a working path on both sides.
2. Where does the scoring formula live, given no shared-code location exists?
3. One runner over both trees, or a root command chaining an app run and an API run?
4. Formula gaps listed above, at least przeciw ↔ wstrzymuję się and the zero denominator, if the formula is the first tested logic.
5. Do tests run in CI in this change, and on which Node version (CI 22, host 24.21.0)?

Evidence gaps for external research:

- Whether the Angular 21 `unit-test` builder can run tests located outside `src/` and tests of CommonJS JavaScript.
- Whether a `runnerConfig` removes the DOM-package requirement in practice for pure-logic tests.
- Stability of the experimental `unit-test` builder against the alternative of plain Vitest.
