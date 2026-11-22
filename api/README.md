# API (cPanel Node.js App)

CommonJS Node API started by Passenger via `app.js`. The database is MariaDB/MySQL; nothing connects at startup, so `/api/health` works without a database and `/api/health/db` reports connectivity.

## Environment variables

| Variable      | Required | Notes                                                                                                                           |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DB_HOST`     | no       | defaults to `localhost`                                                                                                         |
| `DB_USER`     | yes      |                                                                                                                                 |
| `DB_PASSWORD` | yes      | never commit this value                                                                                                         |
| `DB_NAME`     | yes      |                                                                                                                                 |
| `CORS_ORIGIN` | no       | development only: set to `http://localhost:4200` so `ng serve` can call the API; never set it in production (same origin there) |

Account mail and cookies (all optional at startup; the quiz works without them, mail sending fails closed with a logged code when they are missing):

| Variable                | Required for | Notes                                                                                                                                                                  |
| ----------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`             | sending mail | host SMTP server                                                                                                                                                       |
| `SMTP_PORT`             | sending mail | `465` = implicit TLS, anything else (e.g. `587`) = mandatory STARTTLS                                                                                                  |
| `SMTP_USER`             | sending mail | expected to be the sender mailbox's own login                                                                                                                          |
| `SMTP_PASSWORD`         | sending mail | never commit this value                                                                                                                                                |
| `MAIL_FROM`             | sending mail | sender address, `support@quiz.demokratia.pl`                                                                                                                           |
| `PUBLIC_BASE_URL`       | sending mail | origin used in mail links, e.g. `https://quiz.demokratia.pl`; must be `https` (never taken from the request's `Host` header)                                           |
| `AUTH_INSECURE_COOKIES` | no           | development only: set to `1` for plain-http localhost (cookie `sid` without `Secure`, and `http://localhost...` allowed in `PUBLIC_BASE_URL`); never set in production |
| `MAIL_TRANSPORT`        | no           | development only: `console` prints each mail (including its secret link) instead of sending it; never set in production                                                |

Missing variables are reported by name only, never by value.

## Endpoints

| Method and path                     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`, `/api/health/db` | liveness; database connectivity                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GET /api/quizzes`                  | list of quizzes (`id`, `title`, `description`, `isSample`, `questionCount`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /api/quizzes/:id`              | questions with their source, parties and `minAnswered`; no weights or party stances                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /api/quizzes/:id/result`      | body `{"answers":[{"questionId":1,"answer":"za"}]}` (`za`, `przeciw`, `wstrzymuje`; skipped questions are omitted); returns `answered`, `total`, agreement per party (`parties`) and, for every question of the quiz (skipped ones too), `questions: [{id, positions: [{partyId, stance, justification, source: {label, url, date}}]}]`: each party's stance, in quiz order and party-id order, never score order. A party without a stance is absent from `positions`; `justification` and `source.url` can be `null`. Stances appear only here, after answering. 400 `invalid_request`, 413 `payload_too_large`, 422 `insufficient_answers` (fewer than half answered), 503 with a short code |

Answers are scored statelessly: they are never written to the database or logged, and they only travel in the POST body, never in a URL.

## Accounts (`/api/auth/*`)

Optional accounts: register with email and password, verify the address by mail, log in, log out, reset a forgotten password. The quiz endpoints above never use accounts or sessions. All responses are `Cache-Control: no-store`; all request bodies are JSON (`Content-Type: application/json`, at most 16 KiB).

| Method and path                      | Body                                  | Result                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`            | `{email, password, acceptTerms:true}` | always `202 {"status":"ok"}` for a well-formed request (new, existing and pending emails look the same; the mail differs). 422 `invalid_email`, `terms_required`, `invalid_password` (+ `reason`: `too_short`, `too_long`, `too_common`) |
| `POST /api/auth/verify-email`        | `{token}`                             | `200`, or `400 invalid_token` (single use, 24 h)                                                                                                                                                                                         |
| `POST /api/auth/resend-verification` | `{email}`                             | always `202` for a well-formed request                                                                                                                                                                                                   |
| `POST /api/auth/login`               | `{email, password}`                   | `200 {"user":{id,email}}` + session cookie; `401 invalid_credentials` (unknown email and wrong password are identical); `403 email_not_verified` (only after a correct password)                                                         |
| `POST /api/auth/logout`              | `{}`                                  | `200`, session deleted, cookie cleared                                                                                                                                                                                                   |
| `GET /api/auth/me`                   | -                                     | `200 {"user":{id,email}}` or `200 {"user":null}` (anonymous is not an error)                                                                                                                                                             |
| `POST /api/auth/forgot-password`     | `{email}`                             | always `202`; a reset mail goes only to verified accounts                                                                                                                                                                                |
| `POST /api/auth/reset-password`      | `{token, password}`                   | `200` (all sessions of the user are ended), `400 invalid_token` (single use, 1 h), `422 invalid_password`                                                                                                                                |

Common errors: `400 invalid_request`, `403 csrf_rejected`, `413 payload_too_large`, `429 rate_limited`, `503 unavailable`. Anything else under `/api/auth/` is `404`.

- **Session:** an opaque random id in the cookie `__Host-sid` (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`); only its SHA-256 is stored in `sessions`. Idle timeout 30 min, absolute 8 h, a new session at every login. Tunables: `auth-config.js`.
- **CSRF:** every POST must be same-origin: `Sec-Fetch-Site: same-origin`, or (when the header is absent) an `Origin` naming this host. Otherwise `403 csrf_rejected` before the body is read.
- **Passwords:** 10 to 128 characters, no composition rules, a bundled list of common passwords is refused (`data/common-passwords.txt`), hashed with scrypt N=2^15, r=8, p=3 (`node scripts/measure-scrypt.js` times it on the machine at hand).
- **Privacy:** nothing logs an email, a password, a token or a request body; errors log a short code only (for example `auth request failed: ECONNREFUSED`); a missing or invalid mail setting logs `auth mail failed: MISSING_CONFIG: <NAMES>` (variable names only, never values). Mail links carry the token in the URL fragment (`/weryfikacja#token=...`, `/reset-hasla#token=...`), so it never reaches server logs. Client addresses are used only as in-memory rate-limit keys and are never stored.
- **Limits** (in memory, reset by a restart): 5 failed logins per email per 15 min, 30 logins per client address per 10 min, 3 mails per email and 10 per client address per hour, 200 mails per hour overall (the host allows 250).

Quiz content is generated, not hand-written: `migrations/0008_seed_real_quiz.sql` is built from `content/quizzes/sejm-x-kadencja.json` (format, validator and commands: `content/README.md`). It deletes the fictional sample quiz seeded by `migrations/0007_seed_sample_quiz.sql` (`is_sample = 1`) and inserts the real one. Never edit an applied migration: correct the JSON and generate a new migration.

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

Together with the Angular app (`npm start` in the repository root), the browser talks to `http://localhost:4200` only: `ng serve` forwards `/api/**` to this API on port 3000 (`src/proxy.conf.json`), so development is same-origin like production and `CORS_ORIGIN` is no longer needed. To try accounts locally, start the API with the dev-only variables (PowerShell):

```powershell
$env:AUTH_INSECURE_COOKIES = "1"; $env:MAIL_TRANSPORT = "console"; $env:PUBLIC_BASE_URL = "http://localhost:4200"; node app.js
```

Mails are then printed in this terminal, including their links (copy the link into the browser). Restart `ng serve` after changing `src/proxy.conf.json`.

## Testing

```bash
cd api
npm test             # node --test: runs every file in api/test/
```

Tests use the Node.js built-in runner (`node:test` with `node:assert/strict`), so there are no test dependencies to install. They need no database and no `DB_*` variables. From the repository root, `npm run test:api` runs the same thing and `npm test` runs it after the app tests.

One test file is opt-in because it runs the real auth SQL: `test/auth-store.db.test.js` is skipped unless `AUTH_DB_TEST=1`, and it refuses to run unless `DB_NAME` contains `test` or `scratch` (it applies the migrations and deletes every user). In PowerShell, with `DB_*` pointing at a scratch database:

```powershell
$env:AUTH_DB_TEST = "1"; node --test test/auth-store.db.test.js
```

## Migrations

- Files live in `api/migrations/NNNN_name.sql` and are applied in ascending filename order. Applied names are stored in `schema_migrations`.
- To add one: take the next number (for example `0008_create_something.sql`) and put exactly one DDL statement in it. MySQL DDL commits implicitly and the runner cannot roll it back, so a file with several statements can fail half-applied.
- Seed files contain data statements only (plain `INSERT`s inside one transaction, so an error aborts the file and closing the connection rolls it back), so several statements per file are fine there; DDL files keep exactly one.
- A file is recorded only after it runs successfully. The first failure stops the run with a non-zero exit code and later files are not attempted.
- Migrations must be backward-compatible: the previous app version may still be running against the new schema during a deploy.
- Never commit the DB password or any other secret; set `DB_*` through the environment only.
