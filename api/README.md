# API (cPanel Node.js App)

CommonJS Node API started by Passenger via `app.js`. The database is MariaDB/MySQL; nothing connects at startup, so `/api/health` works without a database and `/api/health/db` reports connectivity.

## Environment variables

| Variable      | Required | Notes                      |
| ------------- | -------- | -------------------------- |
| `DB_HOST`     | no       | defaults to `localhost`    |
| `DB_USER`     | yes      |                            |
| `DB_PASSWORD` | yes      | never commit this value    |
| `DB_NAME`     | yes      |                            |
| `CORS_ORIGIN` | no       | development only: set to `http://localhost:4200` so `ng serve` can call the API; never set it in production (same origin there) |

Missing variables are reported by name only, never by value.

## Endpoints

| Method and path                | Purpose |
| ------------------------------ | ------- |
| `GET /api/health`, `/api/health/db` | liveness; database connectivity |
| `GET /api/quizzes`             | list of quizzes (`id`, `title`, `description`, `isSample`, `questionCount`) |
| `GET /api/quizzes/:id`         | questions with their source, parties and `minAnswered`; no weights or party stances |
| `POST /api/quizzes/:id/result` | body `{"answers":[{"questionId":1,"answer":"za"}]}` (`za`, `przeciw`, `wstrzymuje`; skipped questions are omitted); returns agreement per party. 400 `invalid_request`, 413 `payload_too_large`, 422 `insufficient_answers` (fewer than half answered), 503 with a short code |

Answers are scored statelessly: they are never written to the database or logged, and they only travel in the POST body, never in a URL.

The sample quiz seeded by `migrations/0007_seed_sample_quiz.sql` has fictional parties and invented stances (`is_sample = 1`). Replace it with real, sourced content before launch.

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
- Seed files contain data statements only (`INSERT IGNORE` inside a transaction), so several statements per file are fine there; DDL files keep exactly one.
- A file is recorded only after it runs successfully. The first failure stops the run with a non-zero exit code and later files are not attempted.
- Migrations must be backward-compatible: the previous app version may still be running against the new schema during a deploy.
- Never commit the DB password or any other secret; set `DB_*` through the environment only.
