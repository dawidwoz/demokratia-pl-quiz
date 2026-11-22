---
date: 2026-11-22T14:45:00+01:00
researcher: Claude (Sonnet 5.5), for Dawid Wozniak
git_commit: cec13fd6d9d417ace199944caf9df8a970afca35
branch: main
repository: demokratia-pl-quiz
topic: "account-registration-login (roadmap S-03): what the codebase and prior decisions give an auth feature to build on"
tags: [research, codebase, auth, api, angular, vh.pl, rodo, S-03]
status: partial
last_updated: 2026-11-22
last_updated_by: Claude (Sonnet 5.5)
last_updated_note: "Added external research (OWASP, Node scrypt, Angular forms/proxy, vh.pl RODO/email). Status stays partial: RODO acceptance and host-side facts need the user / vh.pl support."
---

# Research: account-registration-login (S-03) — what exists, what constrains it

**Date**: 2026-11-22T14:45:00+01:00
**Researcher**: Claude (Sonnet 5.5), for Dawid Wozniak
**Git Commit**: cec13fd6d9d417ace199944caf9df8a970afca35 (working tree clean apart from the new change folder)
**Branch**: main
**Repository**: demokratia-pl-quiz

## Research Question

`/10x-new` left `change.md` without an intent, so the question is taken from the roadmap item S-03 (`context/foundation/roadmap.md`, "Użytkownik zakłada konto i się loguje", PRD FR-001): *what does the current codebase (API in `api/`, Angular app in `src/`) and the earlier documented decisions give a feature that lets a user register an account and log in, with the anonymous quiz still working? What must it integrate with, what does it constrain, and what is still undecided?* This is internal research only (no external library or web research was done); it does not choose a design.

## Summary

- **There is no auth code at all.** In `api/` a case-insensitive grep for user, session, cookie, password, token, auth, email, credential, crypto found only `DB_USER`/`DB_PASSWORD` plumbing and comments; the 8 migrations (`0001`–`0008`) create no user table; the Angular app has no auth, guard, interceptor, form or storage code (`src/` grep). Auth is greenfield on both sides.
- **The API is a hand-written `node:http` handler with an `if`-chain router** (`api/handler.js:194-238`), dependency-injected via `createHandler({ data, ping })`, one runtime dependency (`mysql2`), CommonJS, no framework, no cookie/crypto/JWT code. An auth feature adds routes to that chain and a new injected store; it can reuse `sendJson`, the 16 KB JSON body reader and the fixed-error-code convention.
- **Production is same-origin** (SPA at `quiz.demokratia.pl/`, API at `/api`; `src/environments/environment.ts`), so cookies would be simple there. **Development is cross-origin** (`:4200` → `:3000`), and the existing dev-only CORS allows only `GET, POST, OPTIONS`, only the `Content-Type` header, and sends no `Access-Control-Allow-Credentials` (`api/handler.js:34-41`), so either a CORS change or a dev proxy (none exists) is needed for credentialed or `Authorization`-header auth.
- **Password hashing: only `node:crypto` is evidenced.** `infrastructure.md` records a spike measurement of `scrypt` at 49–59 ms on the host and warns native modules (e.g. bcrypt) may not build on vh.pl (`context/foundation/infrastructure.md:134,227`).
- **Process model argues against in-memory sessions**: one long-lived Passenger-managed Node process that restarts on every deploy (`touch tmp/restart.txt`) and may be idle-stopped (`infrastructure.md:157,176,181`). This is an inference; no document states a session-store decision.
- **The change is formally blocked.** Roadmap S-03 has status `blocked` on an open RODO / vh.pl data-location confirmation (`roadmap.md` S-03 block; `infrastructure.md:240`: "OTWARTE"). No document records any confirmation. PRD Open Question 4 (how registration/login works, how the first admin is bootstrapped) is also open.
- **The PRD fixes the product shape but not the mechanism**: accounts optional for the quiz (FR-001 note), anonymous answers never persisted, account deletable with all results, saved results visible only to the owner (`prd.md:75,106-108`). Nothing in the repo decides: email verification, password reset, session mechanism (cookie vs bearer), CSRF, password policy, login rate-limiting, secret storage for signing keys.

## Detailed Findings

### API request handling (`api/`)

- Server: `node:http` `createServer(createHandler({ data: quizData, ping }))` (`api/app.js:9,14`); `app.js` must always call `listen` (not gated on `require.main`) because of Passenger (`api/app.js:3-5`). Timeouts `requestTimeout=30000`, `headersTimeout=15000` (`api/app.js:17-18`).
- Routing: `pathname = String(req.url).split('?')[0]`; exact-string or regex matches on method + path; the inspected routes are `GET /api/health`, `GET /api/health/db`, `GET /api/quizzes`, `GET /api/quizzes/:id`, `POST /api/quizzes/:id/result`, else 404 `{status:'not_found'}` (`api/handler.js:194-238`). Auth routes would be further `if` branches before the 404.
- Body: the JSON reader is private to `handler.js` (`readJsonBody`, ~`api/handler.js:59-92`): requires `Content-Type: application/json`, caps at `MAX_BODY_BYTES = 16 * 1024` (`api/handler.js:13`), 400 on invalid JSON, 413 on overflow. It is not exported, so an auth module would need it exported or moved.
- Responses: `sendJson` sets `Content-Type: application/json; charset=utf-8` and `X-Content-Type-Options: nosniff` (`api/handler.js:22-28`). Error bodies are `{status:'error', code:'<short_code>'}` with codes seen: `invalid_request` (400), `payload_too_large` (413), `insufficient_answers` (422), `unavailable` (503), `internal_error` (500); 404 uses `{status:'not_found'}` without `code`. `POST /result` sets `Cache-Control: no-store` (`api/handler.js:125`) — the only precedent for a personal response.
- Validation is pure functions throwing `InvalidRequestError` mapped to a fixed 400 (`api/validate.js:7-14`); no per-field messages exist.
- Logging: only `console.error`/`console.log` with short codes; request bodies are never logged, and tests assert `logs` equals `[]` on the inspected 400/413/422/success paths of `/result` (`api/handler.js:6-8`, `api/test/handler.test.js`). An auth feature handling emails and passwords has to follow this convention to stay consistent.
- Protection: no application-level rate limiting (`api/db.js:13` comment; `context/archive/2026-11-11-s-01/reviews/impl-review.md:79`), no CSRF mechanism, no cookie handling, no security headers beyond `nosniff`.

### CORS and client transport

- Dev-only CORS, active only if `CORS_ORIGIN` is set; sets `Allow-Origin` to that single origin, `Vary: Origin`, `Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers: Content-Type` (`api/handler.js:34-41`); OPTIONS under `/api/` answered 204 only when CORS is on (`api/handler.js:200-203`). Tested in `api/test/handler.test.js:443-463`.
- Consequences (this inspected configuration): a cookie session in dev would need `Access-Control-Allow-Credentials: true` + `withCredentials` on the client; a bearer token would need `Authorization` in `Allow-Headers`; `PUT`/`PATCH`/`DELETE` (future account deletion, S-07) are not in the allowed methods. Alternative: an Angular dev proxy — `angular.json` has no `proxyConfig` and no `proxy.conf*` file exists; CLAUDE.md notes `ng serve` must be restarted after editing `angular.json`.

### Database layer and migrations

- `api/db.js`: lazy `mysql2/promise` pool, `connectionLimit: 3`, `queueLimit: 50`, per-query `timeout: 5000`; `query()` retries once on a lost-connection error and never on timeout (`api/db.js:85-96` region). There is no transaction helper; `getPool().getConnection()` is reachable but unused. The retry-once is acceptable for reads; for an `INSERT` it could in principle re-apply a write that did reach the server (inference, not tested).
- Everything in `api/quiz-data.js` is read-only ("Nothing here writes"); auth would be the first writer.
- Migration runner `api/migrate.js`: own connection with `multipleStatements`, `GET_LOCK`, table `schema_migrations`, files `^\d{4}_.+\.sql$` in filename order, forward-only, non-atomic per file. Next free number is `0009`. Rules in `api/README.md` (~lines 54-61): DDL migrations hold exactly one statement; migrations must be backward-compatible (old app may run during deploy); never edit an applied migration.
- Schema style (`0002`–`0006`): `CREATE TABLE IF NOT EXISTS`, `INT UNSIGNED … AUTO_INCREMENT PRIMARY KEY`, `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, named `uq_<table>_<col>`, `fk_<table>_<ref>` (`ON DELETE CASCADE`), `chk_<table>_<col>`, `created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` (only on `quizzes`; no `updated_at` anywhere). Cascading FKs fit later account deletion (S-07).
- Database is MariaDB 11.4.13 on the same host (`infrastructure.md:171,235`); `wait_timeout` 600 s.
- Lesson (`context/foundation/lessons.md:5-10`): whenever a migration is added or changed, remind the user how to test it locally in PowerShell against a scratch DB (`node migrate.js` with `DB_*`). Applies to `/10x-implement`.
- Gap: no CI database; SQL in `quiz-data.js` has no automated test (`context/archive/2026-11-11-s-01/plan.md:317`), so auth SQL would have the same gap unless a DB test approach is added.

### Dependencies, secrets and crypto

- `api/package.json` has one dependency (`mysql2 ^3.11.0`); no `engines`; Node on host 24.21.0 (22.23.3 also available), local shell v25.9.0, CI Node 24 for tests.
- `node:crypto` is not imported anywhere in `api/` yet; `scrypt`/`randomBytes`/`timingSafeEqual`/`createHmac` are available on the host's Node versions. Async `crypto.scrypt` uses the libuv threadpool; the sync variant would block the event loop (host has 2 cores / 2 GB, `infrastructure.md:69`).
- Env vars today: `DB_HOST` (optional), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `CORS_ORIGIN` (dev-only), `PORT`. No signing/session secret exists. Production env vars are set by hand in the cPanel Node app, stored in plain text in `<docroot>/api/.htaccess` outside the repo, and are not visible in the non-interactive SSH session; any new secret is another manual cPanel gate plus an app restart (`infrastructure.md:141,162,172,189`). Only migrations get `VHPL_DB_*` GitHub secrets (`.github/workflows/deploy-vhpl.yml`, `infrastructure.md:258`). The doc already anticipates a "klucz JWT" cPanel variable (`infrastructure.md:103`) but records no decision.

### Hosting and runtime constraints (vh.pl)

- Host: vh.pl "Wizytówka" shared hosting, cPanel, LiteSpeed; Node API under Passenger ("Setup Node.js App"), registered at `quiz.demokratia.pl/api` (`infrastructure.md:69,250`). Decision closed by the user 2026-10-18; Cloudflare is plan B (`infrastructure.md:13`).
- Process: observed `uptimeSeconds` 20223 (~5.6 h) without Passenger stopping it; each deploy restarts it; a cold idle-stop has not been observed (`infrastructure.md:157,176,181`). Whether Passenger can run several processes is not documented.
- HTTPS: AutoSSL on the subdomain (`context/deployment/deploy-plan.md:13`); `/api/health` works over HTTPS. Not documented: whether HTTP is redirected to HTTPS, whether `X-Forwarded-Proto`/`X-Forwarded-For` reach the app (relevant for `Secure` cookies and for IP-based rate limiting).
- A host-level "429 rate limited" appeared after ~25 rapid requests from one address; its source is unknown (`infrastructure.md:145`).
- Deploy: manual `workflow_dispatch` only; API and SPA ship in the same deploy; migrations run before the restart; a failed migration fails the deploy; smoke check is GET-only and "never posts answers" (`deploy-vhpl.yml`, `infrastructure.md:241,258`).

### RODO / data-location blocker

- Roadmap S-03 lists the blocker "potwierdzenie warunków RODO i lokalizacji danych vh.pl" with `Block: yes` and status `blocked`; it is "the first slice that stores personal data" (`context/foundation/roadmap.md`, S-03 block and At-a-glance row).
- Plan-B trigger no. 4: "warunki RODO lub lokalizacja danych vh.pl okażą się nie do przyjęcia" (`infrastructure.md:27`). Status: `OTWARTE` (`infrastructure.md:240`); the data-centre location rests on a single "third source" (Gdańsk/Gdynia), and no data-processing-agreement text or confirmation is recorded anywhere inspected (`infrastructure.md:69,117,230`). Earlier changes explicitly excluded it (`spike-plan.md:106`; `context/archive/2026-11-07-f-01/plan.md:45`).
- Plan B (Cloudflare) is documented but never executed: no hosted MySQL, D1 or Hyperdrive instead, a Free-plan 10 ms CPU limit likely conflicting with password hashing, and D1 region is also unverified for RODO (`infrastructure.md:74-94,208-218`). Switching would mean rewriting `mysql2` queries and the migration approach.
- Not covered by any document inspected: acceptance criteria for "acceptable", data-retention policy, whether backups (2×/day, kept 31 days, `infrastructure.md:69`) matter for account deletion (inference: deleted accounts would persist in backups up to 31 days).

### Angular front end (`src/`)

- All components standalone, separate `.ts/.html/.scss`, class names without suffix (`QuizList`, `QuizRun`), selector prefix `app`; zoneless (no `zone.js` in `package.json`; this is inferred from absence, not from an explicit provider); signals for state, RxJS only for `HttpClient` observables consumed with `.subscribe({next, error})`; `inject()`; `@if/@for` control flow (`src/app/quiz-run/quiz-run.ts:36-60,98-105`).
- Routes: flat eager array, last entry `'**'` → redirect to `''`, titles `'<Page> | Z kim mi po drodze'`, `withComponentInputBinding()` on (`src/app/app.routes.ts:6-10`, `src/app/app.config.ts:10`). A new route must be added before the catch-all. No guards or resolvers exist.
- HTTP: `provideHttpClient(withFetch())`, no interceptors (`src/app/app.config.ts:11`); one service `QuizApi` with `GET /quizzes`, `GET /quizzes/:id`, `POST /quizzes/:id/result` using `environment.apiBaseUrl` (`/api` in production; `http://localhost:3000/api` in development via `fileReplacements`, `angular.json:77-82`); no `withCredentials`, no auth header. Error handling is per component (`describeSubmitError`, `quiz-run.ts:185-190`).
- Shell: `app.html` is only a brand link plus `<router-outlet />` (`src/app/app.html:1-6`); `App` is an empty class — no nav slot, no user state. `app.spec.ts` provides only `provideRouter([])`, so an `App` that injects an HttpClient-based auth service needs `provideHttpClient()` + `provideHttpClientTesting()` in that spec.
- Forms: `@angular/forms ^21.2.0` is installed but imported nowhere; there is no form precedent, no input/label styling (global tokens and utilities are in `src/styles.scss:1-30,188-275`; no form styles). Whether Angular 21 signal forms are stable in the installed version was not checked.
- Anonymity contract: `quiz-run.ts:19-23` documents that answers never reach URL, router state or storage; `quiz-run.spec.ts:77-79,284-292` spies on `Storage.prototype.setItem` and would fail on any `setItem` call during a `QuizRun` fixture, including one made by an auth service injected into it. Copy in `quiz-list.html:4-5` ("Konto nie jest potrzebne, a Twoje odpowiedzi nie są nigdzie zapisywane.") stays true for accounts but will need re-checking when S-04 saves results.
- Tests: Vitest + jsdom via `ng test --no-watch`; specs are `src/**/*.spec.ts`; service spec pattern `provideHttpClient()` + `provideHttpClientTesting()` + `expectOne`/`flush` + `afterEach(http.verify)` (`src/app/quiz-api.spec.ts`); component spec pattern with `provideRouter([])`, `fixture.detectChanges()`, `data-*` selectors (`quiz-run.spec.ts`). Node 25's built-in `localStorage` shadows jsdom's (comment in `quiz-run.spec.ts:77-79`).
- Constraints: strict TypeScript including `noPropertyAccessFromIndexSignature` and `strictTemplates` (`tsconfig.json:5-22`); component style budget warn 4 kB / error 8 kB (`angular.json:59-70`).

## Code References

- `api/handler.js:194-238` — router if-chain and catch-all 500/404
- `api/handler.js:34-46, 200-203` — dev-only CORS and preflight
- `api/handler.js:22-28, 59-92, 13` — `sendJson`, `readJsonBody`, `MAX_BODY_BYTES`
- `api/db.js:85-96` — `query()` with timeout and retry-once
- `api/migrate.js` — migration runner (lock, `schema_migrations`, forward-only)
- `api/migrations/0005_create_questions.sql` — schema style reference (checks, FKs, cascade)
- `api/test/handler.test.js:64-76, 443-463` — real-server test harness, CORS tests
- `src/app/app.routes.ts:6-10` — routes and catch-all
- `src/app/app.config.ts:10-11` — router input binding, `provideHttpClient(withFetch())`
- `src/app/quiz-api.ts` — the only API client
- `src/app/app.html:1-6` — shell with no nav slot
- `src/app/quiz-run/quiz-run.ts:19-23` and `quiz-run.spec.ts:77-79,284-292` — no-storage contract and its enforcement
- `context/foundation/infrastructure.md:27,69,103,134,141,157,162,176,181,189,227,240,258` — trigger, host, secrets, scrypt, process, RODO status, migration deploy
- `context/foundation/roadmap.md` — S-03 block (blocker, unknowns, `blocked`)
- `context/foundation/prd.md:75,104-108,126-134,148` — FR-001, NFR privacy, Access Control, Open Question 4
- `context/foundation/lessons.md:5-10` — migration-testing reminder

## Architecture Insights

- The existing API is built for statelessness and privacy: no writes, no body logging, `no-store` on personal responses, fixed public error codes with the real code only in `console.error`. Auth is the first feature that must break "no writes" and so should carry the same discipline (no emails/passwords/tokens in logs, fixed error codes, `no-store`).
- Dependency injection through `createHandler(deps)` is the established seam for testing without a database; a new store should be injected the same way, with a pure-function split for hashing/validation (as `assembleScoringData` in `quiz-data.js`).
- Production same-origin and dev cross-origin diverge; whichever transport is chosen, dev needs explicit handling (CORS change or proxy) and the CORS tests need extending.
- One-DDL-statement-per-migration and add-only rules imply separate files per table (next number `0009`).
- The anonymous quiz routes are stateless and must stay account-free; the S-04 save must be a separate explicit call (`context/archive/2026-11-11-s-01/plan.md:33,49`).

## Historical Context (from prior changes)

- `context/archive/2026-11-07-f-01/plan.md:45` — GDPR/data-location work explicitly excluded and noted as gating S-03; same plan sets the DB/migration approach reused here.
- `context/archive/2026-11-11-s-01/plan.md:32,33,47-49` — no rate limiting, stateless scoring, `app.js` always listens, CORS dev-only; `reviews/impl-review.md` F6/F7 (fixed public codes, console-spy privacy tests), F9 (migration-test reminder missed once), `:79` (only host-level 429 protects against abuse).
- `context/archive/2026-11-21-result-position-justification/reviews/impl-review.md` — API and SPA ship together; an API-only rollback can break a newer SPA (accepted).
- `context/changes/vhpl-deploy-spike/spike-plan.md:77,106` — scrypt guidance; RODO excluded from the spike.
- Stale items to be aware of (not corrected here): PRD/shape-notes still say `podrodze.demokratia.pl` (production is `quiz.demokratia.pl`, `infrastructure.md:240`); roadmap Open Question 4 says "Niepodane" although the PRD marks it partly resolved (admin role granted by other admins, `prd.md:133,148`); `tech-stack.md` and `infrastructure.md:19` still mention the 2026-11-04 target (current MVP target 2026-12-06, `prd.md:13`).

## External Research (added 2026-11-22)

Scope: generic public sources only (OWASP, Node, Angular, vh.pl); no project details were put in queries. Reliability is marked per item: **V** = read verbatim from the primary page; **S** = only through a model-extracted summary of the page (treat wording as unverified); **O/I/T** for vh.pl = official statement / inference / third party. "Answers *what should we do*" — these are inputs to `/10x-plan`, not decisions.

### Password hashing (OWASP + Node `crypto.scrypt`)

- OWASP Password Storage Cheat Sheet (V, [page](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)): Argon2id is the first choice; "scrypt should be used when the former is not available". scrypt minimum is N=2^17 (128 MiB), r=8, p=1; listed as equivalent alternatives: N=2^16/r=8/p=2, N=2^15/r=8/p=3, N=2^14/r=8/p=5, N=2^13/r=8/p=10. A unique salt per password is required; a pepper is optional defence in depth and must not be stored with the hash. No length limit is stated for scrypt (only bcrypt's 72 bytes).
- Node `crypto.scrypt`/`scryptSync` (V, [docs JSON](https://nodejs.org/api/crypto.json)): defaults `cost`=16384 (2^14), `blockSize`=8, `parallelization`=1, `maxmem`=32 MiB; "It is an error when (approximately) 128 * N * r > maxmem". So Node's defaults are N=2^14, r=8, p=1, which is **not** one of OWASP's listed equivalent settings (the N=2^14 row needs p=5); and the OWASP minimum N=2^17 needs 128 MiB per hash and therefore an explicit `maxmem` above Node's 32 MiB default. The docs do not name the error class/code and do not state that the async `scrypt` uses the libuv threadpool (that is stated for `pbkdf2`/`randomBytes`, not scrypt).
- `crypto.timingSafeEqual` (S): inputs must have the same byte length, otherwise it throws — check lengths first.
- Consequence for this repo: the spike's "scrypt 49–59 ms" (`infrastructure.md:134`) does not record which N/r/p were used, so it does not show that the OWASP parameters fit the host. With a 2 GB host shared with PHP/SSH (`infrastructure.md:69`) and a 3-connection DB pool, N=2^17 means 128 MiB per concurrent hash. Whether to take the 128 MiB/p=1 or a lower-memory/higher-p equivalent is an open sizing choice that should be measured on the host (also unmeasured: hash cost under concurrent registrations).

### Sessions, cookies, CSRF

- Session cheat sheet ([page](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)): session ID from a CSPRNG, ≥64 bits entropy (V); if self-generated, ≥128 bits and preferably ≥160 (V); accept IDs only from cookies, not URLs (V); HTTPS for the whole session + HSTS (V); `Secure` required (V). Server-side storage of raw IDs "can be acceptable in a tightly controlled session store", but an identifier + secret verifier stored as a SHA-256 hash, compared in constant time, is the recommended design when read-only store disclosure matters (V). `HttpOnly`, `SameSite=Strict` (or Lax), `__Host-` prefix (needs `Secure`, no `Domain`, `Path=/`), idle timeout (15–30 min for low-risk apps), absolute timeout, server-side enforcement of both, regenerate the ID on login, server-side invalidation on logout (S).
- CSRF cheat sheet ([page](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)): use framework protection first, else synchronizer or **signed** double-submit tokens; naive double-submit is "DISCOURAGED"/insecure (V). Fetch Metadata (`Sec-Fetch-Site`) is a primary signal for modern browsers; reject cross-site non-safe methods, with an `Origin`/`Referer` fallback when the header is absent (V). `SameSite` alone is defence in depth, not a replacement (S); custom request header for JSON APIs relies on CORS preflight and an explicit origin allow-list (S); login forms themselves can be CSRF-attacked, so recreate the session after authentication (S).
- Fit with this repo (inference): production is same-origin, so `SameSite` cookies + `Origin`/`Sec-Fetch-Site` checks on state-changing requests are feasible without CORS; the PRD's "last two major browser versions" baseline (`prd.md:109`) matches the Fetch-Metadata assumption. Dev cross-origin would need either the CORS change or the proxy below. Current `api/handler.js` has no cookie parsing or `Set-Cookie`, so all of this is new code or a new dependency (no cookie/session library is in `api/package.json`).

### Authentication rules (OWASP Authentication Cheat Sheet, [page](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html))

- Password length: minimum 15 characters without MFA (8 with MFA); allow at least 64; no composition rules; allow Unicode/spaces; do not silently truncate; block common/breached passwords (Pwned Passwords suggested); avoid forced periodic rotation (all V). Note the minimum is stricter than a typical 8-character default.
- Generic responses for login, registration and recovery so existence of an account is not revealed (example "Invalid user ID or password."), ideally with equal timing and equal status codes (V). For registration this implies the "activation link sent" style of message, which in turn presupposes outbound email (S).
- Rate limiting: cap attempts, track failures per account rather than only per IP, consider exponential backoff, keep password recovery reachable for locked users, log failures (S; the Login Throttling/Lockout sections were not read verbatim). Third-party advice also recommends IP-based limits with safeguards against spoofed IPs (T, search snippet only).
- Fit with this repo: the app has no outbound-email path and no rate limiter; the host has an opaque 429 (`infrastructure.md:145`). Per-account failure counting would need a DB table or in-process counters; in-process counters are lost on every deploy restart (`infrastructure.md:157`).

### Angular front end

- Signal Forms are labelled experimental in the v21 docs: "Signal Forms are experimental. The API may change… Avoid using experimental APIs in production" and "if you need production stability guarantees, reactive forms remain a solid choice" (V, [v21 docs](https://v21.angular.dev/guide/forms/signals/overview)). Search results claim they became stable in Angular 22 (T, secondary articles; the current Signal Forms page was not read). The repo uses `@angular/forms ^21.2.0`, so reactive forms are the documented production-stable option here. This closes Open Question 9's "signal forms stability" part for v21.
- Reactive forms minimal pattern (V for the pattern on [angular.dev](https://angular.dev/guide/forms/reactive-forms), read at v22; the login form itself is composed from it): `inject(FormBuilder)`, `group({ email: ['', [Validators.required, Validators.email]], password: [...] })`, `ReactiveFormsModule` in `imports`, `[formGroup]`/`formControlName`/`(ngSubmit)`. `Validators.minLength` is skipped for empty values, so pair it with `required`. Fits the repo's standalone/`inject()` conventions; no form precedent exists in `src/`. `NonNullableFormBuilder` was not verified.
- Dev proxy (V, [angular.dev serve docs](https://angular.dev/tools/cli/serve), v22 page): create `src/proxy.conf.json` with `{"/api/**": {"target": "http://localhost:3000", "secure": false}}` and set `"proxyConfig": "src/proxy.conf.json"` in the `serve` target options of `angular.json`; `ng serve` must be restarted after edits. `/api/**` matches `/api` and deeper paths but not `/api-docs`. With a proxy, development could use the relative `/api` base URL as production does (today `environment.development.ts` uses `http://localhost:3000/api`), removing the dev-only CORS question for cookies. The v21 copies of these pages were not read; the angular.json key and file format are long-standing, but this was only confirmed on the v22 page.

### vh.pl: RODO, data location, email, Node (Prociv Sp. z o.o., Wrocław)

- **DPA (O)**: [regulaminy-uslug](https://vh.pl/regulaminy-uslug), section "RODO", says a RODO-compliant "umowa powierzenia przetwarzania danych osobowych" can be requested at `bok@vh.pl` (vh.pl template or the customer's own). No public DPA download and no dedicated RODO page (`vh.pl/rodo` → 404). The general and hosting regulamin PDFs contain no processing-agreement or sub-processor clauses beyond the subscriber's own data. Where the signed DPA is delivered (customer panel?) is not stated. The [privacy policy](https://vh.pl/o-firmie/polityka-prywatnosci) covers vh.pl's own customer data, not hosted data.
- **Location (O)**: [serwerownia](https://vh.pl/serwerownia): data centre "w 2 miastach" (Gdańsk, Gdynia), operated by a third party (Artnet); the [information clause](https://vh.pl/pliki-i-regulaminy/vh-rodo-klauzula-informacyjna.pdf) says servers are located "w całości" in the EU (that clause is for another vh.pl customer group and still mentions Privacy Shield, i.e. partly outdated). Not stated: which plan sits in which city. This upgrades `infrastructure.md:240`'s "third source" to an **official vh.pl statement** for Poland/EU location; it does not resolve the DPA/acceptability question.
- **Sub-processors / backups (O)**: no published sub-processor list. Backups 2×/day, up to 31 days back, "2 niezależnych lokalizacji" (not named) on [hosting-www](https://vh.pl/hosting-www); restoring a backup may be charged (hosting regulamin).
- **Email (O)**: Wizytówka hourly limit of 250 messages per account (500 on M/L) on [hosting-www](https://vh.pl/hosting-www); SMTP ports 587/465 listed on [help](https://vh.pl/pomoc/jakie-porty-uzywane-sa-w-hostingu). Not found: official statement on sending from scripts (PHP `mail()`/Node SMTP) or on outbound connections to an external SMTP provider. Inference (I): 250/hour would suffice for small-volume confirmation emails if sending via the host's SMTP is allowed.
- **Node/Passenger (nothing official)**: no vh.pl public page mentions Node.js, Passenger or "Setup Node.js App" (the user confirmed the cPanel option on 2026-10-18, `infrastructure.md:69`); multi-process and idle-stop behaviour is not answerable from public sources. The existing spike evidence (long-lived process) stands as the only data.
- Suggested questions for `bok@vh.pl` (from the worker): is Node via Passenger supported on Wizytówka and with what memory/process/idle limits; can a DPA be signed and where is it stored; is outbound SMTP / an external SMTP provider allowed from scripts; which sub-processors are used.
- Legal sufficiency of any of this for the user's RODO obligations was **not** assessed; that remains the user's decision (roadmap S-03 blocker).

## Related Research

- `context/archive/2026-11-07-f-01/research.md` — API runtime, DB connection on vh.pl
- `context/archive/2026-11-11-s-01/research.md` — API/Angular structure at the time of the quiz slice, dev-proxy alternative at line ~61

## Open Questions

Blocking:
1. **RODO / vh.pl data location and processing terms** — roadmap S-03 is `blocked` on it and a "no" triggers plan B (Cloudflare), which would change the DB and hashing options. External research (see above) found an official EU/Gdańsk–Gdynia location statement and that a DPA is available on request via `bok@vh.pl`; nothing records that the user requested or accepted one. Owner: user.

Undecided design (no evidence in repo; for `/10x-plan` or `/10x-frame`):
2. Registration identifier and flow (PRD OQ4): email + password? Is email verified and is any email sending available (cPanel SMTP not documented anywhere)? Password reset?
3. Session mechanism: cookie session in DB vs signed stateless token vs bearer; CSRF handling; where a signing secret lives (manual cPanel gate); behaviour on deploy restarts.
4. Dev transport: extend CORS for credentials/`Authorization` vs add an Angular dev proxy.
5. Abuse protection for register/login (application rate limit; whether `X-Forwarded-For` reaches the app; unknown source of the host's 429).
6. First-admin bootstrap and whether S-03 must introduce a role column now (S-05 depends on it; "admin role granted by other admins" per `prd.md:133`).
7. Whether this change includes any "who am I" UI state (header link, logged-in indicator) and logout, and how `app.spec.ts` should adapt.

Not verified in this research:
8. HTTP→HTTPS redirect and `Secure`/`SameSite` cookie behaviour through the LiteSpeed/Passenger proxy; whether Passenger can run multiple processes; the MariaDB connection charset/timezone defaults of the `mysql2` pool.
9. Actual production bundle size. (Signal forms: experimental in v21 per the docs — resolved above.)
10. External research (2026-11-22) covered OWASP password/session/CSRF/authentication guidance, Node scrypt options, Angular forms/proxy docs and vh.pl public statements, using WebSearch and page fetches. Not done: a comparison of Node auth/session libraries, Context7/exa.ai lookups (those tools were not available in this session), the verbatim text of the OWASP login-throttling section, and any v21-specific copy of the Angular reactive-forms/serve pages.

New questions from external research:
11. scrypt parameters: OWASP-minimum N=2^17 (128 MiB, needs `maxmem` raised above Node's 32 MiB default) vs a lower-memory/higher-p equivalent; which N/r/p the spike's 49–59 ms measurement used; behaviour under concurrent hashes on the 2 GB shared host. Needs a measurement on the host.
12. Password policy: OWASP's 15-character minimum without MFA, ≥64 maximum, breached-password check — adopt, relax, or defer (a breached-password check needs an external API call or a local list).
13. Is outbound email possible from the Node app on vh.pl (host SMTP on 587/465, 250 messages/hour) or does the change skip email verification and password reset? Ask `bok@vh.pl`; official docs do not say.
14. Does `Sec-Fetch-Site`/`Origin` checking plus `SameSite` cookies satisfy the intended CSRF protection, or is a token wanted; and a dev proxy vs CORS change for development.
