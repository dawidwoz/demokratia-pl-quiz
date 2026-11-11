# F-01: Production database connection — Plan Brief

> Full plan: `context/changes/f-01/plan.md`
> Research: `context/changes/f-01/research.md`

## What & Why

Connect the production API on vh.pl to MySQL and make a schema change shippable as part of a normal deploy. Every slice that stores or reads data (S-01 quiz content, S-03 accounts) depends on it, and the roadmap flags the manual cPanel step as the first risk (`roadmap.md:80-93`).

## Starting Point

`api/app.js` serves only `/api/health` and has no dependencies. No schema, migration or DB config exists, `DB_*` are unset in production, and the deploy workflow neither migrates nor checks the DB (`deploy-vhpl.yml:140-184`). The DB code from the vh.pl spike (`mysql2`, `DB_*` env) is only in git history.

## Desired End State

On `quiz.demokratia.pl`, `GET /api/health/db` returns 200 `"db":"up"`. A normal manual deploy applies pending numbered `.sql` migrations before restarting the app, records them, and fails the deploy if one fails. The smoke check covers the DB, and the after-idle first-request latency has been measured once and recorded.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where migrations run | Workflow step over SSH on the host, before the restart | A failed migration fails the deploy before new code starts and adds nothing to cold start | Plan |
| Credentials for that step | Branch chosen by a Phase 1 check: host env if `DB_*` are visible over SSH, otherwise GitHub environment secrets | Whether cPanel's `DB_*` reach the SSH shell is unverified | Research / Plan |
| Migration tooling | Numbered SQL files plus a small runner and a `schema_migrations` table | Keeps `mysql2` as the only new dependency, in line with the zero-dependency API | Plan |
| DB health signal | Separate `GET /api/health/db`; `/api/health` stays DB-independent | Deploy proves the DB without making liveness depend on it, and the latency script gets a DB target | Plan |
| Local development | `DB_*` env vars against any local MySQL, no Docker | Docker was not evaluated in the infrastructure research | Plan |
| After-idle latency | Manual gate: about 10 requests after 30+ min idle, result recorded | Closes the roadmap's named verification without making the platform decision automatic | Plan |
| First migration | No-op `0001_baseline.sql` | Proves apply-and-record without creating feature tables | Plan |
| Migrations folder sync | Own `rsync --delete` step | The API rsync has no `--delete`, so removed files would still be applied | Plan |

## Scope

**In scope:** DB module and pool, migration runner and baseline, `/api/health/db`, workflow migration step and smoke check, local run recipe, path-aware latency script, one latency measurement, `infrastructure.md` and roadmap updates.

**Out of scope:** feature tables, down-migrations, checksums, ORM or library, DB tunnel, startup migrations, auto-deploy, Docker, test runner (F-02), GDPR and data location (gates S-03).

## Architecture / Approach

`api/db.js` builds a lazy `mysql2` pool from `DB_*`. `api/migrate.js` takes a MySQL named lock, applies pending files from `api/migrations/` in order, and records each after success. The workflow syncs the migrations folder exactly, runs the runner on the host in the app's Node environment, then restarts. The smoke check also calls `/api/health/db`. Migrations must be backward-compatible, since rollback does not undo schema.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Provision DB and verify host env | DB and user exist, `DB_*` set, branch A or B recorded | Manual cPanel gate; `DB_*` may not be visible over SSH |
| 2. DB layer, runner, `/api/health/db` | Code verified locally against any MySQL | No test runner, so checks are manual or `curl`-based |
| 3. Deploy integration | Migration step and DB smoke check proven by a production deploy | Merge to `main` is needed to dispatch; restart behaviour still unconfirmed |
| 4. Latency gate and docs | Measured after-idle latency recorded, docs and roadmap updated | First request after idle may exceed 2 s, which opens the plan-B decision |

**Prerequisites:** cPanel access to the production account, a local MySQL for Phase 2 manual checks, `gh` or the GitHub UI to dispatch the workflow.
**Estimated effort:** about 2 sessions across 4 phases, plus the cPanel gate and a 30-minute idle wait.

## Open Risks & Assumptions

- `DB_*` visibility in the SSH shell is unknown until Phase 1; the plan covers both outcomes.
- After-idle latency is unmeasured; a result above 2 s triggers a decision by the owner, not an automatic change.
- The folder id `f-01` differs from the roadmap Change ID `production-database-connection`, so the roadmap status is edited by hand in Phase 4.
- MySQL DDL is not transactional, so a failing multi-statement migration can be left half-applied; migrations are kept to one DDL statement each.

## Success Criteria (Summary)

- `https://quiz.demokratia.pl/api/health/db` returns 200 with `"db":"up"`, and the deploy smoke check covers it.
- A second deploy applies no migrations and records nothing new.
- The after-idle first-request time is recorded in `infrastructure.md`.
