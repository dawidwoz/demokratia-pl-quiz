---
date: 2026-11-07T11:46:34+01:00
researcher: Claude Code (claude-sonnet-5-5)
git_commit: dda83d8
branch: main
repository: quiz (z-kim-mi-po-drodze)
topic: "F-01: what exists today for connecting the production API to a database and shipping schema changes, and what is still unknown"
tags: [research, codebase, api, mysql, vh.pl, deploy, migrations]
status: complete
last_updated: 2026-11-07
last_updated_by: Claude Code (claude-sonnet-5-5)
---

# Research: F-01 production database connection (grounding for /10x-plan)

**Date**: 2026-11-07T11:46:34+01:00
**Researcher**: Claude Code (claude-sonnet-5-5)
**Git Commit**: dda83d8 (working tree: `CLAUDE.md` modified, `context/changes/f-01/` new; both uncommitted)
**Branch**: main
**Repository**: quiz (z-kim-mi-po-drodze)

## Research Question

Roadmap item F-01 (`context/foundation/roadmap.md:80-93`): "the production API connects to the database, and a schema change can be shipped as part of a normal deploy; concrete feature schemas are created later by the slices that use them." What does the repo already contain for this, which constraints from the chosen host (vh.pl) apply, and which facts are still missing before planning?

Scope: local files only (code, workflow, `context/**`, git history of the spike). No external documentation was fetched and nothing was run on the host. The scope was small and single-area, so it was investigated directly without sub-agents.

## Summary

- **Code: no database layer exists.** On the inspected tree, `api/app.js` serves only `GET /api/health` and returns 404 JSON for everything else (`api/app.js:18-22`). `api/package.json` has `"dependencies": {}` (`api/package.json:10`). A repo-wide glob over `api/**`, `deploy/**`, `scripts/**`, `spike/**` and `src/**/*.ts` found no schema, migration, seed or DB-config file, and `spike/` no longer exists in the working tree.
- **Host: the DB chain was proven once, in the spike, but not in production.** MySQL write and read from the Node app worked on `spike.demokratia.pl` (`infrastructure.md:131`). The production app on `quiz.demokratia.pl` has no `DB_*` variables set yet, and the production database does not exist yet (`infrastructure.md:220`, `deploy-plan.md:9`, `deploy-plan.md:69`).
- **Deploy workflow: there is no migration step and no DB check.** The workflow syncs files, runs `npm install --omit=dev`, touches `tmp/restart.txt` and smoke-checks `/api/health` plus `/quiz/1` (`.github/workflows/deploy-vhpl.yml:140-184`). A green run therefore says nothing about DB connectivity.
- **The two roadmap unknowns are still open and nothing in the repo resolves them:** how to apply schema changes from the deploy workflow, and whether the first request after idle is under 2 s (`roadmap.md:89-91`).
- **Manual gate comes first:** creating the MySQL database and user and setting `DB_*` in cPanel needs a human (`roadmap.md:92`, `infrastructure.md:228-231`).

## Detailed Findings

### Current API code

- Single-file CommonJS server on `node:http`, no framework, no dependencies, no credentials in code; the header comment says DB settings "will come from environment variables set in cPanel" (`api/app.js:3-5`).
- Port is `process.env.PORT || 3000`; this works under Passenger (`api/app.js:25`, risk register `infrastructure.md:210`).
- `health()` returns `status`, `node`, `uptimeSeconds` and does not touch a database (`api/app.js:14-16`).
- `api/.gitignore` ignores only `node_modules/` (`api/.gitignore:1`).
- No test runner exists (`CLAUDE.md` "Commands"; F-02 `automated-test-baseline` is the parallel foundation, `roadmap.md:87`), so verification of F-01 code in this change is manual (e.g. `curl`) unless F-02 lands first.

### What the spike proved about MySQL

- Pattern used: `mysql2/promise`, config from `DB_HOST` (default `localhost`), `DB_USER`, `DB_PASSWORD`, `DB_NAME`; one connection opened and closed per request; `CREATE TABLE IF NOT EXISTS`, `INSERT` and `SELECT` with prepared `execute` (commit `30ade11:spike/api/app.js:10-15,28-42`; the code was removed from the tree in `ae47a1a`). The spike used no pool.
- Result recorded: write and read OK, row id=2, data from the previous test retained (`infrastructure.md:131`).
- The spike's package pinned `mysql2` `^3.11.0` (`30ade11:spike/api/package.json:11`). `mysql2` is pure JS; native modules are flagged as a build risk on this host (`infrastructure.md:105`, `infrastructure.md:208`).
- The MySQL vs MariaDB flavour and version were not verified (`infrastructure.md:216`).

### Deploy workflow constraints that any DB work must respect

- Trigger: manual `workflow_dispatch` only, environment `production`; auto-deploy after merge is deferred (`deploy-vhpl.yml:28-34`, `infrastructure.md:222`).
- API sync is `rsync` without `--delete`, excluding `/node_modules`, `/tmp`, `/stderr.log` (`deploy-vhpl.yml:140-145`). A new top-level folder in `api/` (for example for migrations) would be synced by this rule.
- Dependencies are installed on the host with `npm install --omit=dev` inside the app's activated Node environment, deliberately not `npm ci`, because cPanel links `node_modules` to the Node virtualenv (`deploy-vhpl.yml:147-159`).
- The SSH session is non-interactive and has `node`/`npm` only after `source "$VHPL_NODE_ACTIVATE"` (`deploy-vhpl.yml:152-157`, `infrastructure.md:143`). The workflow therefore already can run Node commands on the host over SSH.
- `DB_*` are not in GitHub Secrets. They are set by a human in the cPanel Node app and cPanel stores them in plain text in `<docroot>/api/.htaccess`, outside the repo, which `rsync --delete` skips (`infrastructure.md:141`, `infrastructure.md:170`, `deploy-vhpl.yml:137`). Do not print or copy that file.
- CI builds with Node 22 while the host runs Node 24.21.0 (`deploy-vhpl.yml:90-93`, `infrastructure.md:226`).
- Rollback is a rebuild of an earlier commit and does not undo schema changes (`infrastructure.md:171`, `infrastructure.md:198`); the target commit must contain `deploy/vhpl/` and `api/` (`deploy-vhpl.yml:98-99`).
- The smoke check covers `/api/health` (`"status":"ok"`) and `/quiz/1` (HTTP 200) only (`deploy-vhpl.yml:172-184`).
- After any change to the cPanel app registration (Save, Destroy and re-register), the workflow had to be run again before `/api/health` returned 200 (`infrastructure.md:162`). Setting `DB_*` is a registration change, so expect a redeploy or restart afterwards (inference; not observed for `DB_*` specifically).

### Latency target

- PRD: result appears in under 2 s after the last answer; quiz and result must work without the Sejm API (`prd.md:110-111`).
- Roadmap names a verification path for F-01: measure latency after idle (`roadmap.md:85`). Plan B (Cloudflare) triggers if the first request after idle is consistently above 2 s with no workaround (`infrastructure.md:24`, `infrastructure.md:207`).
- Only one data point exists: first request after app start 0.7 s, subsequent 0.1-0.4 s; nothing measured after 30 min idle (`infrastructure.md:133`).
- `scripts/measure-latency.sh` hard-codes the URL `<base>/api/health` and defaults to 20 sequential requests (`scripts/measure-latency.sh:7-8`). Because `/api/health` has no DB access today, this script as written cannot show the cost of the first DB connection after idle (inference from `api/app.js:14-16`).
- Rate-limiting: HTTP 429 appeared after about 25 rapid requests from one address; the source of the limit was not established (`infrastructure.md:145`). A 20-request run is close to that number.

### Schema changes from the workflow: what is known

- The roadmap marks this as an open unknown owned by the user: an SSH tunnel to the DB from GitHub Actions was not confirmed (`roadmap.md:90`). Remote MySQL access from GitHub IPs is also unconfirmed (`infrastructure.md:116`).
- Observed facts that bound the options (no option has been tried in this repo):
  - The workflow can already run Node on the host over SSH (above). Whether `DB_*` are visible in that SSH shell after `source activate` is not documented anywhere in the repo. They are described as stored in `<docroot>/api/.htaccess` (`infrastructure.md:141`).
  - The app process itself does receive `DB_*` (spike criterion 4, `infrastructure.md:131`).
  - The host and the database are on the same machine, so the app connects locally (`infrastructure.md:116`).
- Candidate mechanisms to evaluate in the plan, with the evidence gap for each:
  1. Migration run from the workflow via SSH on the host: needs `DB_*` reachable in that shell, or a way to pass them; unverified.
  2. Migration run by the app at startup: uses the env that is proven to work, but its time adds to cold start (the latency risk above) and a manual cPanel restart or a second instance could run it concurrently; unverified.
  3. Migration run by an explicit admin-only endpoint or one-off script: not discussed in any foundation document.
  4. DB tunnel from the runner: marked unconfirmed in the roadmap.

## Code References

- `api/app.js:3-5` - header: no credentials in code; DB settings from cPanel env.
- `api/app.js:14-22` - health payload and request router (only `GET /api/health`).
- `api/app.js:25-26` - `PORT` fallback and `listen`.
- `api/package.json:10` - empty `dependencies`.
- `.github/workflows/deploy-vhpl.yml:90-102` - Node 22 build of the SPA, preconditions for rollback commits.
- `.github/workflows/deploy-vhpl.yml:140-170` - API rsync, host `npm install`, restart via `tmp/restart.txt`.
- `.github/workflows/deploy-vhpl.yml:172-184` - smoke check (health and deep link, no DB).
- `scripts/measure-latency.sh:7-8` - request count and the `/api/health` URL.
- `context/foundation/roadmap.md:72-73,80-93` - baseline (API without DB access; `DB_*` unset in production) and the F-01 entry.
- `context/foundation/infrastructure.md:131,141,170,216,220` - spike DB result, `.htaccess` secrets, MySQL version unknown, DB not yet connected in production.
- `context/deployment/deploy-plan.md:9,24,69` - DB deliberately out of scope for the first deploy; new random password to be set when the backend is built.
- `30ade11:spike/api/app.js:10-42` - the only DB code that ever existed in the repo (spike, removed).

## Architecture Insights

- The back end is deliberately minimal: CommonJS, built-in `http`, zero dependencies, startup file `app.js` (comment at `api/app.js:3-4`). Adding a driver would be the first runtime dependency and the first real use of the host-side `npm install` step.
- Secrets live outside the repo and outside GitHub for the DB (cPanel-managed `.htaccess`), whereas SSH and path settings live in GitHub environment `production` (`deploy-vhpl.yml:4-12`). A migration mechanism that needs `DB_*` outside the app process crosses that boundary.
- Operations on the host are in place and non-atomic: fixed docroot and app root, no `releases/` symlink layout (`deploy-vhpl.yml:14-16`). Schema changes therefore have no atomic switch either; the register says migrations must be backward-compatible and a backup taken before a migration (`infrastructure.md:198`).

## Historical Context (from prior changes)

Each statement below is scored against the current tree.

- `context/changes/vhpl-deploy-spike/spike-plan.md` - spike plan with MySQL as criterion 4 (`spike-plan.md:38`). Supported: criterion 4 passed (`infrastructure.md:131`). Partial: step 4 (`releases/` + symlink) was superseded by in-place deploy (`spike-plan.md:4`).
- `context/foundation/infrastructure.md:220` - "DB_* not yet set in the production app; the DB will be connected with the back end." Supported by `api/app.js` (no DB code) and the baseline (`roadmap.md:73`).
- `context/deployment/deploy-plan.md:9` - DB "will be created with a new random password at back-end time, closing open decision no. 6". Supported; decision 6 is marked resolved because the old spike DB password was changed (`infrastructure.md:220`).
- `context/changes/bootstrap-verification/verification.md` - not relevant to F-01 beyond the known `npm audit` note in `CLAUDE.md`; not read in detail.
- No `context/archive/` change folders exist (only `context/archive/README.md`), so there is no archived prior art.

## Related Research

None under `context/changes/**/research.md` or `context/archive/**/research.md` (not applicable; `context/changes/vhpl-deploy-spike/` and `bootstrap-verification/` contain a plan and a verification log respectively).

## Open Questions

Blocking or plan-shaping, in the order the plan will need them:

1. **Change ID mismatch.** The roadmap names this item `production-database-connection` (`roadmap.md:83`); this folder is `f-01`. Decide whether to keep `f-01` or recreate under the roadmap's ID before `/10x-plan`, since tooling that looks changes up by roadmap Change ID would not find this folder (not checked against the skills' code).
2. **How are schema changes applied from the deploy workflow?** (`roadmap.md:90`, owner: user.) The mechanisms listed above are untested. One cheap experiment would settle options 1 and 2: whether `DB_*` are present in the SSH shell after `source "$VHPL_NODE_ACTIVATE"` (check variable names only, never values).
3. **Does the first request after 30 min idle meet 2 s, including the first DB connection?** (`roadmap.md:91`, owner: user.) Needs a DB-touching endpoint, then a measurement that stays under the ~25 rapid-request 429 threshold.
4. **Migration tool vs plain SQL files.** No evidence in the repo prefers one; the host constraint is "no native modules" (`infrastructure.md:105`) and "`npm install`, not `npm ci`" (`deploy-vhpl.yml:150`).
5. **Should `/api/health` include a DB ping?** It would let the existing smoke check (`deploy-vhpl.yml:179-181`) catch a broken connection but would also make health fail when only the DB is down. A separate readiness path is the alternative.
6. **Local development database.** No local DB configuration, Docker file or seed exists, and Docker is outside the evaluated infrastructure scope (`infrastructure.md:245`). How API code that needs MySQL is run and tested locally is undecided; F-02 (test baseline) interacts with this.
7. **Human gate, not yet done:** create the MySQL database and user with a new random password, set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in the cPanel Node app, then redeploy (`roadmap.md:92`, `infrastructure.md:228-231`). The password must not enter the repo or chat.
8. **MySQL vs MariaDB and version** on the host (`infrastructure.md:216`); matters for SQL features (e.g. JSON columns, `CHECK` constraints) used by later slices.
9. **Not an F-01 blocker but gates S-03:** GDPR terms and data location at vh.pl are unverified before storing personal data (`infrastructure.md:221`).
