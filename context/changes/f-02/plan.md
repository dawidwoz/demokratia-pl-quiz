# Automated Test Baseline (F-02) Implementation Plan

## Overview

Make `npm test` at the repo root run the Angular app tests and the `api/` tests in one go, with one real logic test on the API side, and run the same command automatically on GitHub. This is roadmap item F-02 (`context/foundation/roadmap.md:95-106`): tests run with one command, include at least one logic test, and the same approach works for app code and API code.

## Current State Analysis

No test runs today on either side.

- Root `npm test` calls `ng test` (`package.json:9`), but `angular.json` has two architect targets, `build` (`angular.json:43`) and `serve` (`angular.json:83`), and no `test` target.
- `vitest`, `jsdom` and `happy-dom` are absent from root `node_modules` and `devDependencies`. `tsconfig.spec.json:7-9` already declares `vitest/globals` and includes `src/**/*.spec.ts`.
- `api/package.json:7-10` has `start` and `migrate` scripts and no test script. `api/` is a separate CommonJS JavaScript package with its own lockfile; it is not an npm workspace member.
- No `*.spec.ts` exists under `src/` and no test file exists under `api/`.
- The one workflow, `.github/workflows/deploy-vhpl.yml`, is manual (`workflow_dispatch`) and has no test step.

## Desired End State

- `npm test` at the repo root runs the app tests, then the API tests, exits 0 when both pass and non-zero when either fails, and returns to the prompt without watching.
- `npm run test:app` and `npm run test:api` run each side alone.
- `api/test/db.test.js` verifies the behaviour of `readConfig()` in `api/db.js`.
- A GitHub workflow runs `npm test` on pull requests and on pushes to `main`.
- `CLAUDE.md`, `README.md` and `api/README.md` describe the working commands.

Verify by running `npm test` locally and by opening a pull request and seeing the test workflow pass.

### Key Discoveries:

- The Angular `unit-test` builder cannot run `api/` tests. It resolves test globs from `src/` (`node_modules/@angular/build/src/builders/unit-test/test-discovery.js:61-66`), bundles each spec for the browser platform, and deletes `test.projects` and `test.include` from a user Vitest config (`node_modules/@angular/build/src/builders/unit-test/runners/vitest/plugins.js:81-90`). The API therefore needs its own run, chained from the root script.
- With no spec files the builder throws "No tests found" (`node_modules/@angular/build/src/builders/unit-test/runners/vitest/build-options.js:77-82`), so the app needs one spec for `ng test` to pass.
- The builder requires `vitest` and one of `jsdom` / `happy-dom` (`node_modules/@angular/build/src/builders/unit-test/runners/vitest/index.js:22-46`). The peer range is `vitest ^4.0.8` (`node_modules/@angular/build/package.json:72`).
- `ng test` watches in an interactive terminal and runs once otherwise (`node_modules/@angular/build/src/builders/unit-test/options.js:66`); `--no-watch` forces a single run.
- `node:test` is stable on Node 22 and Node 24 and needs no dependency (https://nodejs.org/docs/latest-v24.x/api/test.html). Production installs `api/` with `--omit=dev` (`.github/workflows/deploy-vhpl.yml:182`), and a built-in runner adds nothing to install.
- `readConfig()` is exported (`api/db.js:83`), reads only `process.env` (`api/db.js:32-41`), and `mysql2` is required lazily inside `getPool()`, so a test can load `api/db.js` without a database or installed API dependencies.
- `tsconfig.app.json:9-14` excludes `*.spec.ts` only; a `*.test.ts` file under `src/` would be compiled into the app build. App tests use the `.spec.ts` suffix.
- The host runs Node v24.21.0 (`context/foundation/infrastructure.md:130`); the deploy workflow builds with Node 22 (`.github/workflows/deploy-vhpl.yml:104`).

## What We're NOT Doing

- Not implementing or testing the scoring formula. It moves to S-01. Decision recorded for S-01: the formula will live in `api/` as a plain CommonJS module.
- Not deciding the formula's undefined cases (przeciw ↔ wstrzymuję się, zero denominator, rounding).
- Not changing `.github/workflows/deploy-vhpl.yml`; a failing test does not block a deploy in this change.
- Not changing production code in `api/` (no refactor of `api/app.js`, no new exports).
- Not testing code that needs a database (`getPool`, `ping`, `migrate`) and not adding module mocking.
- Not adding coverage, linting, end-to-end tests, or a shared-code location between the app and `api/`.
- Not turning `skipTests` off in the `angular.json` schematics.

## Implementation Approach

Two runners, one command. The app uses Angular's documented default (the `unit-test` builder with Vitest and jsdom). The API uses Node's built-in runner so it gains no dependencies. The root `test` script chains them with `&&`, so the first failure stops the run and sets the exit code. A separate workflow runs the same root command on Node 24, the version the host runs.

## Critical Implementation Details

- **Environment isolation in the API test.** `readConfig()` reads `process.env` at call time, so each test case must set and restore `DB_HOST`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` itself; a developer's shell may already define them.
- **Test files ship to the host.** The deploy rsync copies `api/` as it is, so `api/test/` reaches production. That is harmless (Passenger starts `app.js` only) and is accepted here because the deploy workflow stays untouched.

## Phase 1: App test runner

### Overview

`ng test` runs the app tests once and exits, with one passing spec.

### Changes Required:

#### 1. Test dependencies

**File**: `package.json`, `package-lock.json`

**Intent**: Add the packages the Angular `unit-test` builder needs for its default Vitest runner.

**Contract**: `devDependencies` gains `vitest` (range satisfying `^4.0.8`) and `jsdom`. Installed with npm so the lockfile updates. No other dependency changes.

#### 2. Test target

**File**: `angular.json`

**Intent**: Give `ng test` a target to run.

**Contract**: Under the project's `architect`, add `test` with builder `@angular/build:unit-test` and no options, matching what Angular 21 generates for new projects. Defaults then apply: Vitest runner, `tsconfig.spec.json`, `build:development`.

#### 3. Smoke spec

**File**: `src/app/app.spec.ts` (new)

**Intent**: Provide the one spec the builder needs, proving that Angular's test setup and component compilation work.

**Contract**: One test that creates the `App` component through `TestBed` and asserts the instance exists. It must not assert on template text, because `src/app/app.html` is a placeholder that S-01 replaces.

#### 4. Spec config reference

**File**: `tsconfig.json`

**Intent**: Let editors and `tsc -b` type-check spec files.

**Contract**: `references` gains `./tsconfig.spec.json` next to `./tsconfig.app.json`.

#### 5. App test script

**File**: `package.json`

**Intent**: A named script that runs the app tests once without watching.

**Contract**: `scripts["test:app"]` = `ng test --no-watch`. The existing `test` script is rewired in Phase 2.

### Success Criteria:

#### Automated Verification:

- App tests pass and the command exits: `npm run test:app`
- Production build still succeeds: `npm run build`
- The spec file exists: `src/app/app.spec.ts`

#### Manual Verification:

- `npm run test:app` returns to the prompt in an interactive terminal without entering watch mode

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: API tests and the single command

### Overview

The API gets its first logic test, and the root `npm test` runs both sides.

### Changes Required:

#### 1. API test script

**File**: `api/package.json`

**Intent**: Run the API tests with Node's built-in runner, adding no dependency.

**Contract**: `scripts.test` = `node --test`. No `devDependencies` are added. Default discovery picks up files under `api/test/` and skips `node_modules`.

#### 2. Logic test for the database config reader

**File**: `api/test/db.test.js` (new)

**Intent**: Verify the existing behaviour of `readConfig()` so the API side has a real logic test. No change to `api/db.js`.

**Contract**: CommonJS test using `node:test` and `node:assert/strict`, requiring `../db.js`. Cases, each with its own environment setup and restore:

- All of `DB_USER`, `DB_PASSWORD`, `DB_NAME` set and `DB_HOST` unset: returns `{ host: 'localhost', user, password, database }` with the set values.
- `DB_HOST` set: the returned `host` is that value.
- One required variable unset: throws `MissingConfigError` with `code` `MISSING_CONFIG` and `missing` equal to exactly that one name.
- All three required variables unset: `missing` lists `DB_USER`, `DB_PASSWORD`, `DB_NAME` in that order.
- A required variable set to an empty string counts as missing.
- When `DB_PASSWORD` is set and another variable is missing, the error message does not contain the password value.

#### 3. Single root command

**File**: `package.json`

**Intent**: One command for both sides, plus a way to run the API side alone from the root.

**Contract**: `scripts["test:api"]` = `npm --prefix api test`. `scripts.test` = `npm run test:app && npm run test:api`. A failure on either side makes `npm test` exit non-zero.

### Success Criteria:

#### Automated Verification:

- API tests pass: `npm run test:api`
- Both sides pass with one command: `npm test`
- API files still parse: `node --check api/db.js`

#### Manual Verification:

- Temporarily breaking one assertion in `api/test/db.test.js` makes `npm test` exit non-zero, and restoring it makes it pass again
- `npm test` output shows the app run followed by the API run

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: CI and docs

### Overview

The same command runs automatically on GitHub, and the docs stop saying tests don't work.

### Changes Required:

#### 1. Test workflow

**File**: `.github/workflows/test.yml` (new)

**Intent**: Run the test command on every pull request and on pushes to `main`, without touching the deploy workflow.

**Contract**: Triggers `pull_request` and `push` to `main`. One job on `ubuntu-latest`: checkout, `actions/setup-node@v4` with `node-version: 24` and npm cache, `npm ci` at the root, `npm ci --prefix api`, then `npm test`. Read-only `contents` permission; no secrets.

#### 2. Project instructions

**File**: `CLAUDE.md`

**Intent**: Replace the stale "tests do not work" note with the working commands, as that paragraph itself asks.

**Contract**: In `## Commands`, delete the paragraph beginning "As of 2026-10-08, `npm test` / `ng test` does not work" and add `npm test`, `npm run test:app` and `npm run test:api` to the command block, noting that app specs use the `.spec.ts` suffix and API tests live in `api/test/`. Leave the 10x-cli block and other sections unchanged.

#### 3. READMEs

**File**: `README.md`, `api/README.md`

**Intent**: Make the testing instructions match the repo.

**Contract**: `README.md` "Running unit tests" section describes `npm test` and the two per-side scripts instead of bare `ng test`. `api/README.md` gains a short testing section: `npm test` in `api/`, Node's built-in runner, tests in `api/test/`, no database needed.

#### 4. Record the formula location for S-01

**File**: `context/foundation/roadmap.md`

**Intent**: Keep the decision made during this planning where S-01 planning will find it.

**Contract**: In the `### S-01` block, add one line stating that the agreement formula will be implemented in `api/` as a plain CommonJS module and tested with `node --test` (decided 2026-11-11 in F-02 planning). No other roadmap fields change in this step.

### Success Criteria:

#### Automated Verification:

- Workflow file exists: `.github/workflows/test.yml`
- Full test command still passes after the doc edits: `npm test`
- The stale note is gone: searching `CLAUDE.md` for "does not work" returns nothing

#### Manual Verification:

- The test workflow runs and passes on the pull request for this change
- `CLAUDE.md`, `README.md` and `api/README.md` read correctly and name the three commands

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- App: one smoke spec creating the `App` component.
- API: `readConfig()` — defaults, host override, each missing-variable case, empty string as missing, and no secret value in the error message.

### Integration Tests:

- None in this change. The deploy smoke check from F-01 remains the only end-to-end check.

### Manual Testing Steps:

1. Run `npm test` in an interactive terminal; confirm both runs pass and the prompt returns.
2. Break one API assertion, run `npm test`, confirm a non-zero exit, then restore it.
3. Open the pull request and confirm the test workflow passes.

## Performance Considerations

The app run performs a development build before testing, so `npm test` takes noticeably longer than the API run alone. `npm run test:api` gives a fast loop for API work.

## Migration Notes

None. No data, schema or deploy changes.

## References

- Related research: `context/changes/f-02/research.md`
- Roadmap entry: `context/foundation/roadmap.md:95-106`
- Angular 21 testing guide: https://v21.angular.dev/guide/testing
- Node test runner: https://nodejs.org/docs/latest-v24.x/api/test.html
- Existing workflow conventions: `.github/workflows/deploy-vhpl.yml:99-113`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: App test runner

#### Automated

- [x] 1.1 App tests pass and the command exits: `npm run test:app` — c65d77c
- [x] 1.2 Production build still succeeds: `npm run build` — c65d77c
- [x] 1.3 The spec file exists: `src/app/app.spec.ts` — c65d77c

#### Manual

- [x] 1.4 `npm run test:app` returns to the prompt in an interactive terminal without entering watch mode — c65d77c

### Phase 2: API tests and the single command

#### Automated

- [x] 2.1 API tests pass: `npm run test:api` — b481fe0
- [x] 2.2 Both sides pass with one command: `npm test` — b481fe0
- [x] 2.3 API files still parse: `node --check api/db.js` — b481fe0

#### Manual

- [x] 2.4 Temporarily breaking one assertion in `api/test/db.test.js` makes `npm test` exit non-zero, and restoring it makes it pass again — b481fe0
- [x] 2.5 `npm test` output shows the app run followed by the API run — b481fe0

### Phase 3: CI and docs

#### Automated

- [x] 3.1 Workflow file exists: `.github/workflows/test.yml`
- [x] 3.2 Full test command still passes after the doc edits: `npm test`
- [x] 3.3 The stale note is gone: searching `CLAUDE.md` for "does not work" returns nothing

#### Manual

- [ ] 3.4 The test workflow runs and passes on the pull request for this change
- [x] 3.5 `CLAUDE.md`, `README.md` and `api/README.md` read correctly and name the three commands
