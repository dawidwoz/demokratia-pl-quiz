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

1. Create the test subdomain, MySQL database/user and the Node.js App in cPanel (point the docroot at `<spa dir>/current` if the panel accepts a symlink).
2. Create a dedicated deploy SSH key and add the public part in cPanel.
3. Create the GitHub secrets named in the workflow header. `VHPL_KNOWN_HOSTS` is the pinned host key line (get it from `ssh-keyscan` run on a trusted machine and compare with the host's published fingerprint).
4. Run the workflow manually. To roll back, run it again with `rollback_to` set to an earlier release SHA.

## Not verified yet (this is what the spike measures)

Docroot via symlink, `npm ci` in the cPanel Node environment, restart by `tmp/restart.txt`, port handling under Passenger, `.htaccess` coexistence with the Node app rules, SSH key login from a GitHub runner.
