# F-01: Production database connection Implementation Plan

## Overview

Give the production API on vh.pl a working MySQL connection and a way to ship schema changes as part of a normal deploy. A small DB module and migration runner are added to `api/`. The deploy workflow applies pending `.sql` migrations over SSH before restarting the app, and its smoke check gains a DB probe (`GET /api/health/db`). No feature tables are created; S-01 and S-03 define their own schema later. The unmeasured after-idle latency is closed with a recorded manual measurement against the DB endpoint.

## Current State Analysis

- `api/app.js` is a single-file CommonJS server on `node:http` that serves only `GET /api/health` and returns `404 {"status":"not_found"}` for everything else (`api/app.js:14-22`). `api/package.json` has `"dependencies": {}` (`api/package.json:10`).
- No schema, migration, seed or DB-config file exists anywhere in the repo. The only DB code that ever existed is the removed spike (`30ade11:spike/api/app.js:10-42`): `mysql2/promise`, config from `DB_HOST` (default `localhost`), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, one connection per request, no pool.
- `DB_*` are not set in the production app and the production database does not exist yet (`context/foundation/infrastructure.md:220`, `context/deployment/deploy-plan.md:9,69`). When set they live in the cPanel Node app and are stored in plain text in `<docroot>/api/.htaccess`, outside the repo (`infrastructure.md:141,170`).
- The deploy workflow has no migration step and no DB check. It syncs files, runs `npm install --omit=dev`, touches `tmp/restart.txt`, then smoke-checks `/api/health` and `/quiz/1` (`.github/workflows/deploy-vhpl.yml:140-184`). It can already run Node on the host over SSH after sourcing the app's activate script (`deploy-vhpl.yml:147-159`).
- `scripts/measure-latency.sh` hard-codes `<base>/api/health` (`scripts/measure-latency.sh:8`), which touches no DB, so it cannot show the first-DB-connection cost.
- There is no test runner (`CLAUDE.md`; F-02 owns it), so verification in this change is command- and `curl`-based.

## Desired End State

On `https://quiz.demokratia.pl`:

- `GET /api/health/db` returns HTTP 200 with `"db":"up"`, proving the production API reaches MySQL; `GET /api/health` still answers independently of the DB.
- A normal manual deploy applies any pending numbered migrations from `api/migrations/` before restarting the app, records them in `schema_migrations`, and fails the deploy (before the restart) if a migration fails. A second deploy with nothing new applies nothing.
- The deploy smoke check covers `/api/health`, `/api/health/db` and `/quiz/1`.
- The first-request-after-idle time (first DB connection included) is measured once and recorded in `infrastructure.md`.

Verified by the Phase 3 and Phase 4 success criteria.

### Key Discoveries:

- `/api/` is excluded from the SPA fallback (`deploy/vhpl/.htaccess:5`), so a new `/api/health/db` path needs no routing change.
- The API rsync has no `--delete` (`deploy-vhpl.yml:140-145`), so a removed or reverted migration file would linger on the host and still be applied. The migrations folder needs its own `--delete` sync.
- `npm install`, not `npm ci`, on the host because cPanel links `node_modules` to the Node virtualenv (`deploy-vhpl.yml:150`); `mysql2` is pure JS, so no native build is involved (`infrastructure.md:105,208`).
- Rollback is a rebuild of an older commit and does not undo schema changes (`infrastructure.md:171,198`); migrations must therefore be backward-compatible with the previous app version.
- After any change to the cPanel app registration or its variables, the workflow had to be run again before `/api/health` returned 200 (`infrastructure.md:162`); setting `DB_*` is expected to need the same.
- Remote MySQL access from GitHub IPs and an SSH tunnel are unconfirmed (`roadmap.md:90`, `infrastructure.md:116`); this plan runs migrations on the host, where MySQL is local.

## What We're NOT Doing

- No feature tables (quiz, questions, parties, positions, users, results); each slice adds its own migrations.
- No down-migrations, no migration checksums, no ORM or query builder, no migration library.
- No DB tunnel or remote MySQL access from GitHub runners.
- No migrations at app startup and no manual-only migration path.
- No auto-deploy after merge (still deferred, `infrastructure.md:222`).
- No change to the hosting platform; a first request after idle above 2 s only triggers a recorded decision by the owner, not an automatic move to plan B.
- No Docker or docker-compose; local MySQL is the developer's own.
- No rate limiting or caching on `/api/health/db` (caching would distort the latency measurement; the host's own 429 limit applies); revisit if it is abused.
- No test runner (F-02), and no GDPR/data-location work (gates S-03, `infrastructure.md:221`).

## Implementation Approach

Phase 1 is the human gate the roadmap flags as the risk: create the database and set `DB_*`, and find out whether those variables are visible in the SSH shell the workflow uses. That result selects how Phase 3 supplies credentials to the migration step. Phase 2 builds and verifies locally everything that does not need the host: pooled DB access, the migration runner, one no-op baseline migration, and the DB health route. Phase 3 wires the runner into the workflow and the smoke check and proves it with a production deploy. Phase 4 makes the latency script path-aware, records the after-idle measurement, and updates the foundation docs. Migrations are plain numbered SQL files applied by a small runner that records them in `schema_migrations`, so the only new runtime dependency is `mysql2`.

## Critical Implementation Details

- **Timing & lifecycle:** the migration step runs after file sync and `npm install` but before `touch tmp/restart.txt`, so the previous app version keeps serving against the new schema for the length of a deploy. Every migration must be backward-compatible with the previous app version (add before use, remove only after nothing uses it).
- **State sequencing:** `api/migrations/` is synced in its own `rsync --delete` step so the host folder always equals the checked-out commit's folder; the main API rsync stays without `--delete` because cPanel owns `node_modules`, `tmp` and `stderr.log` in the same root.
- **Debug & observability:** neither the runner nor the DB route may print `DB_*` values. Missing variables are reported by name only; the DB route returns only a short error `code`. The workflow must not enable shell tracing in the migration step.

## Phase 1: Provision the database and verify the host environment (manual gate)

### Overview

A human creates the production MySQL database and user and sets the `DB_*` variables in the cPanel Node app, then checks whether those variables are visible in the SSH shell used by the workflow. The outcome selects branch A or B for Phase 3. No repository changes.

### Changes Required:

#### 1. cPanel and SSH (human, outside the repo)

**File**: none (cPanel, host shell). Findings are recorded in this plan under "Phase 1 outcome" by the implementer.

**Intent**: Create the database and a dedicated user with a new random password, set the four variables on the existing `quiz.demokratia.pl/api` Node app, re-save the app so it restarts, and test what an SSH session sees after sourcing the activate script, looking at variable names only.

**Contract**:
- Variables set on the Node app: `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. The password is never written to the repo, GitHub, or chat.
- Visibility check (names only, values never printed): `ssh vhpl 'source <VHPL_NODE_ACTIVATE path>; env | grep "^DB_" | cut -d= -f1'`.
- Branch A: all four names are visible, so Phase 3 passes nothing extra to the migration step. Branch B: one or more are missing, so Phase 3 passes the four values from GitHub environment `production` secrets to the host inside the piped remote script (not on the command line; see Phase 3).
- Record the MySQL or MariaDB flavour, version and `wait_timeout` (`SELECT VERSION()` and `SHOW VARIABLES LIKE 'wait_timeout'` in phpMyAdmin) for Phase 2 and the Phase 4 docs.
- Branch B only: create the four `VHPL_DB_*` secrets in GitHub environment `production` now, so Phase 3 can run.

### Success Criteria:

#### Automated Verification:

None; this phase is a manual gate.

#### Manual Verification:

- Production database and dedicated user exist in cPanel, created with a new random password that was not pasted into the repo or chat
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are set on the `quiz.demokratia.pl/api` Node app, and the app has been re-saved or restarted
- The SSH visibility check was run and its result is recorded as branch A (all four `DB_*` names visible) or branch B (any name missing)
- MySQL or MariaDB flavour, version and `wait_timeout` are recorded
- Branch B only: the four `VHPL_DB_*` secrets exist in GitHub environment `production` (n/a under branch A)

**Implementation Note**: After completing this phase, pause for the human to confirm the gate and the branch (A or B) before proceeding. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 2: DB layer, migration runner and `/api/health/db`

### Overview

Add `mysql2`, a lazily connecting pooled DB module, a migration runner with a CLI, a no-op baseline migration, and the `GET /api/health/db` route. Document the local run recipe. Everything is verified locally; the production host is not touched.

### Changes Required:

#### 1. DB access module

**File**: `api/db.js` (new)

**Intent**: One place that builds the MySQL pool from the environment and exposes a connectivity probe, so later slices import it instead of opening their own connections. It must not connect at `require` time, so the app starts and `/api/health` works with no database.

**Contract**:
- Reads `DB_HOST` (default `localhost`), `DB_USER`, `DB_PASSWORD`, `DB_NAME` from `process.env`; no credentials in code.
- Exports `getPool()` (creates the `mysql2/promise` pool on first call; small `connectionLimit`, 3, to respect the host's shared limits; bounded `connectTimeout`; explicit `idleTimeout` and `maxIdle` set well below the host's `wait_timeout` recorded in Phase 1, so idle connections are closed by the app before MySQL drops them), `ping()` (runs `SELECT 1`, resolves or rejects; retries once on a connection-lost error so a stale pooled connection after a long idle does not surface as `db down`), `closePool()`.
- Missing required variables surface as an error naming the missing variables, never their values.

#### 2. Migration runner

**File**: `api/migrate.js` (new), `api/migrations/0001_baseline.sql` (new)

**Intent**: Apply pending migrations in order and record them, usable both as `node migrate.js` (what the workflow runs) and importable. The baseline file is a deliberate no-op that proves apply-and-record without creating any feature table.

**Contract**:
- Migration files: `api/migrations/NNNN_name.sql`, applied in ascending filename order; applied names are stored in `schema_migrations(name VARCHAR(255) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`, which the runner creates if missing.
- Runs under a MySQL named lock (`GET_LOCK`, bounded wait) on a dedicated connection so two runs cannot interleave; releases it on exit.
- A file is recorded only after it executed successfully. The first failure stops the run with a non-zero exit code and later files are not attempted. MySQL DDL commits implicitly, so a migration should hold one DDL statement or be written to be re-runnable; the runner does not roll DDL back.
- Only files matching `^\d{4}_.+\.sql$` are considered; other files in the folder are skipped with a warning. Names recorded in `schema_migrations` whose file no longer exists are ignored. Files sharing a number sort by full filename.
- Prints one line per applied file and `no pending migrations` when there is nothing to do; exits 0 in both cases. Missing `DB_*` exits non-zero naming the missing variables only.
- `0001_baseline.sql` contains only `SELECT 1;`.

#### 3. Health route and wiring

**File**: `api/app.js`

**Intent**: Add the DB probe route and keep liveness independent of the database.

**Contract**:
- `GET /api/health` is unchanged.
- `GET /api/health/db`: `200 {"status":"ok","db":"up"}` when `ping()` succeeds; `503 {"status":"error","db":"down","code":"<short error code or MISSING_CONFIG>"}` otherwise. No credential values or raw error messages in the body or logs.
- Other routes keep returning the existing 404 JSON.

#### 4. Dependency and scripts

**File**: `api/package.json`, `api/package-lock.json`

**Intent**: Introduce the first runtime dependency and a convenient migrate script.

**Contract**: `dependencies.mysql2` (`^3.11.0`, the version proven in the spike); script `"migrate": "node migrate.js"`; lockfile refreshed. `api/.gitignore` is unchanged.

#### 5. Local run recipe

**File**: `api/README.md` (new)

**Intent**: Tell a developer how to run API code that needs MySQL locally, without prescribing how MySQL is installed.

**Contract**: Lists the four `DB_*` variables, shows running `node migrate.js` and `node app.js` against any local MySQL, notes that migrations must be backward-compatible and that the DB password must never be committed, and explains how to add a migration (next number, one DDL statement per file).

### Success Criteria:

#### Automated Verification:

- Syntax check passes: `node --check api/app.js && node --check api/db.js && node --check api/migrate.js`
- Dependencies install without a native build and the lockfile lists `mysql2`: `cd api && npm install --omit=dev --no-audit --no-fund`
- With no `DB_*` set, `node api/app.js` starts and `curl -fsS localhost:3000/api/health` returns `"status":"ok"`
- With no `DB_*` set, `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/health/db` prints `503` and the body contains `"db":"down"` and no credential values
- With no `DB_*` set, `node api/migrate.js` exits non-zero and prints only variable names

#### Manual Verification:

- Against a local MySQL, `node migrate.js` applies `0001_baseline.sql`, records it in `schema_migrations`, and a second run prints `no pending migrations`
- A deliberately failing migration file exits non-zero, is not recorded, and a later file is not applied (then remove the failing file)
- A throwaway migration with one `CREATE TABLE` statement applies and is recorded (then remove the file and drop the table), proving DDL goes through the runner
- With `DB_*` set to the local database, `/api/health/db` returns 200 with `"db":"up"`

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human before proceeding. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 3: Deploy integration and production verification

### Overview

Add the migration step and the DB smoke check to the workflow, merge, and prove the whole chain with a production deploy.

### Changes Required:

#### 1. Workflow: migrations folder sync, migration step, smoke check

**File**: `.github/workflows/deploy-vhpl.yml`

**Intent**: Make "schema change ships with a normal deploy" true: sync migrations exactly, apply them on the host before the restart, and have the smoke check prove DB connectivity.

**Contract**:
- New step after "Sync API into the app root": `rsync -azs --delete api/migrations/ "vhpl:$VHPL_API_DIR/migrations/"`. The existing API rsync stays without `--delete`.
- New step "Apply database migrations" after "Install API dependencies on the host" and before "Restart API": over `ssh vhpl bash -s`, source `$VHPL_NODE_ACTIVATE`, `cd "$VHPL_API_DIR"`, run `node migrate.js`; no shell tracing; fails the job on a non-zero exit.
- Credentials per the Phase 1 outcome. Branch A: nothing extra. Branch B: add `VHPL_DB_HOST`, `VHPL_DB_USER`, `VHPL_DB_PASSWORD`, `VHPL_DB_NAME` as secrets of GitHub environment `production`, pass them into the remote shell by piping one combined script into a single `ssh vhpl bash -s`: a leading block of `export DB_X=<value>` lines (values taken from the step's env and quoted with `printf %q`), followed by the existing quoted heredoc body. The heredoc already occupies stdin in the other steps, so credentials must not be sent separately, and they must not appear on the command line, in argv or in logs, and extend the "Validate inputs and secrets" step to require them. Only the branch chosen in Phase 1 is implemented.
- Smoke check, after the existing `/api/health` check: `curl -fsS` (same timeout and retry flags) of `${SITE_URL%/}/api/health/db` and a `grep -q '"db":"up"'`. The existing `if: vars.VHPL_SITE_URL != ''` condition and the `/quiz/1` check stay.
- Header comment updated to mention migrations and, for branch B, the extra secrets.

#### 2. Merge and deploy

**File**: none (git, GitHub)

**Intent**: The workflow must be on `main` to be run (`deploy-plan.md:35`), so the change is committed, reviewed and merged first; the production run is then dispatched by the human.

**Contract**: Commits follow the `/10x-implement` commit ritual; push and PR require the user's confirmation. The deploy is a manual `workflow_dispatch` from `main` in environment `production`; the production run is a human action.

### Success Criteria:

#### Automated Verification:

- The latest deploy run on `main` succeeded: `gh run list --workflow deploy-vhpl.yml --limit 1 --json conclusion -q '.[0].conclusion'` prints `success`
- `curl -fsS https://quiz.demokratia.pl/api/health/db` returns a body containing `"db":"up"`
- `curl -fsS https://quiz.demokratia.pl/api/health` still returns `"status":"ok"`

#### Manual Verification:

- The human dispatched the workflow from `main` and approved environment `production`; the "Apply database migrations" log shows `0001_baseline.sql` applied and no `DB_*` values
- A second dispatch with no new migration logs `no pending migrations`, and `/api/health` shows `uptimeSeconds` near 0 afterwards
- `<docroot>/api/.htaccess` still exists after the deploy (existence only; its content is not printed)

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human before proceeding. The `uptimeSeconds` check also confirms the `tmp/restart.txt` restart, which is still open in `infrastructure.md:157`. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Phase 4: Latency gate and documentation

### Overview

Make the latency script target any path, measure the after-idle response once against the DB endpoint, record the result, and bring the foundation docs up to date.

### Changes Required:

#### 1. Path-aware latency script

**File**: `scripts/measure-latency.sh`

**Intent**: Allow measuring a DB-touching endpoint without changing existing behaviour.

**Contract**: Usage becomes `measure-latency.sh <base-url> [requests=20] [path=/api/health]`; the default path keeps the current behaviour. A comment states that more than about 25 rapid requests from one address returned HTTP 429 and recommends about 10 for this check.

#### 2. Foundation docs (edited in place, in Polish like the file)

**File**: `context/foundation/infrastructure.md`

**Intent**: Record what is now true instead of leaving stale "open" statements.

**Contract**: Add the measured after-idle result (first request and p50/p95, request count, idle time, endpoint) and the MySQL/MariaDB version and `wait_timeout` from Phase 1; update Open Decision 5 and risk-register row for after-idle latency; update "Getting Started" with the DB gate, the Phase 1 branch (A or B), `api/migrations/` and the migration step; record the restart confirmation if Phase 3 confirmed it. If the first request after idle exceeded 2 s, say so and leave the plan-B decision to the owner, citing trigger 1 in the "Recommendation" section.

#### 3. Roadmap status

**File**: `context/foundation/roadmap.md`

**Intent**: Close F-01 on the roadmap. The folder id `f-01` differs from the roadmap Change ID `production-database-connection`, so the skills' automatic status sync does not match and the edit is manual.

**Contract**: Item F-01 Status set to `done` in both the `## At a glance` table and the `### F-01` block; frontmatter `updated` bumped if present.

### Success Criteria:

#### Automated Verification:

- The script parses: `bash -n scripts/measure-latency.sh`
- Running it without arguments exits non-zero and prints usage: `bash scripts/measure-latency.sh`

#### Manual Verification:

- After at least 30 minutes without requests, the human ran about 10 requests against `/api/health/db` using the script, and the first-request time and p50/p95 are recorded in `infrastructure.md`
- `infrastructure.md` reflects the measurement, the DB version, the Phase 1 branch, the migration flow and the restart confirmation
- Roadmap F-01 Status is `done` in both places

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation from the human. Phase blocks use plain bullets; the checkboxes live in `## Progress`.

---

## Testing Strategy

There is no test runner until F-02, so this change adds none.

### Unit Tests:

- Not applicable in this change; the migration runner's behaviours (apply, record, no-op rerun, failure stop, DDL) are exercised by the Phase 2 manual checks and are good first candidates for F-02's baseline.

### Integration Tests:

- Production: the deploy's own smoke check (`/api/health`, `/api/health/db`, `/quiz/1`) and the Phase 3 re-run for idempotence.

### Manual Testing Steps:

1. Run the runner twice against a local MySQL and confirm the second run is a no-op.
2. Make a migration fail on purpose and confirm the exit code and that nothing is recorded.
3. Deploy to production, then deploy again with no changes.
4. After 30+ idle minutes, run the latency script against `/api/health/db`.

## Performance Considerations

- The pool is created lazily and capped at 3 connections for the shared host's limits (300 processes, `infrastructure.md:104`).
- The PRD target is a result in under 2 s (`prd.md:110`); the after-idle first request is the specific unknown here (`roadmap.md:91`) and is measured once in Phase 4. Request counts stay at or below about 10 to avoid the 429 limit (`infrastructure.md:145`).

## Migration Notes

- The production database starts empty; the first deploy with this change creates `schema_migrations` and records `0001_baseline`.
- Backups run twice a day for 31 days (`infrastructure.md:69`); take or confirm a recent backup before the first migration that changes real data (not needed for the no-op baseline).
- Rollback to an older commit rebuilds old code but leaves applied migrations in place; later migrations must stay compatible with the code version before them.

## References

- Related research: `context/changes/f-01/research.md`
- Roadmap entry: `context/foundation/roadmap.md:80-93`
- Deploy workflow: `.github/workflows/deploy-vhpl.yml:140-184`
- Spike DB code (history only): `30ade11:spike/api/app.js:10-42`
- Latency script: `scripts/measure-latency.sh:7-8`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Provision the database and verify the host environment (manual gate)

#### Manual

- [x] 1.1 Production database and dedicated user exist in cPanel, created with a new random password that was not pasted into the repo or chat
- [x] 1.2 `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` are set on the `quiz.demokratia.pl/api` Node app, and the app has been re-saved or restarted
- [x] 1.3 The SSH visibility check was run and its result is recorded as branch A (all four `DB_*` names visible) or branch B (any name missing)
- [x] 1.4 MySQL or MariaDB flavour, version and `wait_timeout` are recorded
- [x] 1.5 Branch B only: the four `VHPL_DB_*` secrets exist in GitHub environment `production` (n/a under branch A)

### Phase 2: DB layer, migration runner and `/api/health/db`

#### Automated

- [ ] 2.1 Syntax check passes: `node --check api/app.js && node --check api/db.js && node --check api/migrate.js`
- [ ] 2.2 Dependencies install without a native build and the lockfile lists `mysql2`: `cd api && npm install --omit=dev --no-audit --no-fund`
- [ ] 2.3 With no `DB_*` set, `node api/app.js` starts and `curl -fsS localhost:3000/api/health` returns `"status":"ok"`
- [ ] 2.4 With no `DB_*` set, `curl -s -o /dev/null -w '%{http_code}' localhost:3000/api/health/db` prints `503` and the body contains `"db":"down"` and no credential values
- [ ] 2.5 With no `DB_*` set, `node api/migrate.js` exits non-zero and prints only variable names

#### Manual

- [ ] 2.6 Against a local MySQL, `node migrate.js` applies `0001_baseline.sql`, records it in `schema_migrations`, and a second run prints `no pending migrations`
- [ ] 2.7 A deliberately failing migration file exits non-zero, is not recorded, and a later file is not applied (then remove the failing file)
- [ ] 2.8 A throwaway migration with one `CREATE TABLE` statement applies and is recorded (then remove the file and drop the table), proving DDL goes through the runner
- [ ] 2.9 With `DB_*` set to the local database, `/api/health/db` returns 200 with `"db":"up"`

### Phase 3: Deploy integration and production verification

#### Automated

- [ ] 3.1 The latest deploy run on `main` succeeded: `gh run list --workflow deploy-vhpl.yml --limit 1 --json conclusion -q '.[0].conclusion'` prints `success`
- [ ] 3.2 `curl -fsS https://quiz.demokratia.pl/api/health/db` returns a body containing `"db":"up"`
- [ ] 3.3 `curl -fsS https://quiz.demokratia.pl/api/health` still returns `"status":"ok"`

#### Manual

- [ ] 3.4 The human dispatched the workflow from `main` and approved environment `production`; the "Apply database migrations" log shows `0001_baseline.sql` applied and no `DB_*` values
- [ ] 3.5 A second dispatch with no new migration logs `no pending migrations`, and `/api/health` shows `uptimeSeconds` near 0 afterwards
- [ ] 3.6 `<docroot>/api/.htaccess` still exists after the deploy (existence only; its content is not printed)

### Phase 4: Latency gate and documentation

#### Automated

- [ ] 4.1 The script parses: `bash -n scripts/measure-latency.sh`
- [ ] 4.2 Running it without arguments exits non-zero and prints usage: `bash scripts/measure-latency.sh`

#### Manual

- [ ] 4.3 After at least 30 minutes without requests, the human ran about 10 requests against `/api/health/db` using the script, and the first-request time and p50/p95 are recorded in `infrastructure.md`
- [ ] 4.4 `infrastructure.md` reflects the measurement, the DB version, the Phase 1 branch, the migration flow and the restart confirmation
- [ ] 4.5 Roadmap F-01 Status is `done` in both places
