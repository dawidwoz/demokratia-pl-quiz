# vh.pl deploy spike (throwaway)

Plan and success criteria: `context/changes/vhpl-deploy-spike/spike-plan.md`.
This directory and `.github/workflows/spike-vhpl-deploy.yml` are scaffolding only. Nothing here has been deployed, and no secrets are stored in the repo.

| Path | Purpose |
|---|---|
| `api/app.js` | Minimal Node API: `GET /api/health`, `/api/db-check` (MySQL write + read), `/api/scrypt-check` (hash timing) |
| `htaccess/.htaccess` | Angular SPA fallback, copied into the build output by the workflow |
| `scripts/measure-latency.sh` | Criterion 6: response time after idle |
| `../.github/workflows/spike-vhpl-deploy.yml` | Manual (`workflow_dispatch`) deploy and rollback over SSH/rsync |

## API environment variables

Set in the cPanel app, never committed: `DB_HOST` (default `localhost`), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, optional `PORT`.

## Run the API locally

```bash
cd spike/api
npm ci
DB_USER=... DB_PASSWORD=... DB_NAME=... node app.js   # needs a local MySQL for /api/db-check
curl http://localhost:3000/api/health
```

## Before the first workflow run (human steps)

1. In cPanel create the test subdomain with a fixed document root (e.g. `spike-site/live`), a MySQL database/user, and register the Node.js App with a fixed app root (e.g. `spike-api/app`), URL `<subdomain>/api`, startup file `app.js`, plus the `DB_*` variables. Fixed paths are required: with `releases/` + a `current` symlink, cPanel pinned the app to the resolved release path (observed 2026-10-18).
2. Create a dedicated deploy SSH key and add the public part in cPanel.
3. Create the GitHub secrets named in the workflow header (`VHPL_SPA_DIR` = the docroot, `VHPL_API_DIR` = the app root, `VHPL_NODE_ACTIVATE` = that app's `bin/activate`). Optionally set the repository variable `VHPL_SITE_URL` to enable the end-of-run smoke check. `VHPL_KNOWN_HOSTS` is the pinned host key line (get it from `ssh-keyscan` run on a trusted machine and compare with the host's published fingerprint).
4. Run the workflow manually (Use workflow from: `spike/vhpl-deploy`). It deploys in place. To roll back, run it again with `rollback_to` set to an earlier commit SHA; that commit is rebuilt and deployed (minutes, not atomic).

## Not verified yet (this is what the spike measures)

`npm install` in the cPanel Node environment with a fixed app root, restart by `tmp/restart.txt` (does the app really restart, check `uptimeSeconds` in `/api/health`), that `rsync --delete` leaves the cPanel-managed `/api/` in the docroot intact, and latency after idle.
