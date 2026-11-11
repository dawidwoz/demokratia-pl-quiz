# API (cPanel Node.js App)

CommonJS Node API started by Passenger via `app.js`. The database is MariaDB/MySQL; nothing connects at startup, so `/api/health` works without a database and `/api/health/db` reports connectivity.

## Environment variables

| Variable      | Required | Notes                      |
| ------------- | -------- | -------------------------- |
| `DB_HOST`     | no       | defaults to `localhost`    |
| `DB_USER`     | yes      |                            |
| `DB_PASSWORD` | yes      | never commit this value    |
| `DB_NAME`     | yes      |                            |

Missing variables are reported by name only, never by value.

## Running locally

Point the variables at any local MySQL/MariaDB you already have (this README does not prescribe how to install one), then:

```bash
cd api
npm install
export DB_HOST=localhost DB_USER=... DB_PASSWORD=... DB_NAME=...
node migrate.js      # applies pending migrations; prints "no pending migrations" when up to date
node app.js          # listens on PORT or 3000
curl http://localhost:3000/api/health/db
```

`npm run migrate` is the same as `node migrate.js`.

## Testing

```bash
cd api
npm test             # node --test: runs every file in api/test/
```

Tests use the Node.js built-in runner (`node:test` with `node:assert/strict`), so there are no test dependencies to install. They need no database and no `DB_*` variables. From the repository root, `npm run test:api` runs the same thing and `npm test` runs it after the app tests.

## Migrations

- Files live in `api/migrations/NNNN_name.sql` and are applied in ascending filename order. Applied names are stored in `schema_migrations`.
- To add one: take the next number (for example `0002_create_parties.sql`) and put exactly one DDL statement in it. MySQL DDL commits implicitly and the runner cannot roll it back, so a file with several statements can fail half-applied.
- A file is recorded only after it runs successfully. The first failure stops the run with a non-zero exit code and later files are not attempted.
- Migrations must be backward-compatible: the previous app version may still be running against the new schema during a deploy.
- Never commit the DB password or any other secret; set `DB_*` through the environment only.
