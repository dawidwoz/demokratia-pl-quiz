# Account Registration and Login (S-03) Implementation Plan

## Overview

Let a user register with email and password, verify the address by mail, log in and out, and reset a forgotten password (PRD FR-001), while the anonymous quiz keeps working exactly as today and never touches account code. Sessions are server-side, opaque-ID cookies; everything is built on the existing `node:http` API and the Angular 21 app. Registration shows Polityka Prywatności and Regulamin pages that the user must accept.

## Current State Analysis

- There is no auth code anywhere: no user table (migrations `0001`–`0008` are baseline, quiz, parties, questions, positions and seeds), no cookie/hash/session code in `api/`, no form, guard or auth state in `src/` (`research.md`, Summary).
- `api/handler.js` is a hand-written `if`-chain router (`api/handler.js:194-238`), injected via `createHandler({ data, ping })`; `sendJson`, `readJsonBody` and `MAX_BODY_BYTES = 16 KiB` are private to that file (`api/handler.js:13,22-28,59-92`). Dev-only CORS allows no credentials (`api/handler.js:34-46`).
- `api/db.js` exposes `query()` with a 5 s timeout and **retry-once on lost connection** (`api/db.js:85-96`), pool of 3, no transaction helper. All current SQL is read-only (`api/quiz-data.js`).
- Production is same-origin (`/api`, `src/environments/environment.ts`); dev calls `http://localhost:3000/api` cross-origin (`src/environments/environment.development.ts`). `angular.json` has no `proxyConfig`.
- Angular: standalone components with separate `.ts/.html/.scss`, signals, `inject()`, eager flat routes ending in a `'**'` redirect (`src/app/app.routes.ts:6-10`), shell is a brand link plus `<router-outlet />` (`src/app/app.html`), `@angular/forms ^21.2.0` installed but unused, no form styles in `src/styles.scss`. `QuizRun` is spec-guarded against any browser storage write (`src/app/quiz-run/quiz-run.spec.ts:77-79,284-292`).
- Host: vh.pl shared hosting, one Passenger Node process restarted on every deploy, MariaDB 11.4, `node:crypto` is the only evidenced hashing option (`infrastructure.md:134,227`), SMTP ports 587/465 and 250 mails/hour per the vh.pl pages (unconfirmed for Node).

## Desired End State

On `quiz.demokratia.pl`, a visitor can open "Załóż konto", enter email, password and accept Regulamin/Polityka Prywatności, receive a Polish verification mail, open its link, log in, see their email and a "Wyloguj" button in the header, log out, and recover a forgotten password by mail. Anonymous users still run quizzes with no account calls beyond one harmless `GET /api/auth/me`. Verify with: `npm test` green; the manual local flow in Phase 2/3; the go-live checklist in Phase 4 on the real host.

### Key Discoveries:

- Handler seam: new behavior plugs in as an injected dependency like `data`, and tests drive a real server on port 0 with fakes (`api/test/handler.test.js:64-76`).
- Privacy convention to extend: no bodies or personal data in logs, fixed public error codes, real code only in `console.error`, `no-store` on personal responses (`api/handler.js:6-8,54-57,125`).
- `db.query` retry-once is unsafe for writes (a retried `INSERT` could double-apply), so writes need a no-retry helper and a transaction helper (`api/db.js:85-96`).
- Migration rules: one DDL statement per file, add-only, `utf8mb4_unicode_ci`, named `uq_`/`fk_`/`chk_` constraints, cascading FKs, next number `0009` (`api/README.md:54-61`, `api/migrations/0005_create_questions.sql`).
- OWASP (read 2026-11-22): session ID ≥ 64 bits (we use 256), store only a hash, `Secure`/`HttpOnly`/`SameSite`/`__Host-`, regenerate at login, invalidate server-side at logout; CSRF: `SameSite` alone is not enough, use `Sec-Fetch-Site`/`Origin`; passwords min 15 without MFA (**deliberately relaxed to 10**, user decision), allow ≥ 64, no composition rules, block common passwords; generic login/registration/recovery responses (`research.md`, External Research).
- Node `scrypt` defaults (N=2^14, 32 MiB `maxmem`) are below OWASP's listed equivalents; N=2^15, r=8, p=3 is a listed equivalent and needs `maxmem` ≥ 32 MiB.
- `ng serve` needs a restart after `angular.json` edits (CLAUDE.md); `/api/**` is the right proxy pattern (`angular.dev` serve docs).
- Deploy: `deploy-vhpl.yml` already runs `npm run build`, `npm install --omit=dev`, `node migrate.js`, restart, then a GET-only smoke check (`.github/workflows/deploy-vhpl.yml:112-113,182,233-250`).

## What We're NOT Doing

- Saving results (S-04), account deletion (S-07), result export (S-08), admin role / first-admin bootstrap (S-05): `users` has **no role column**; S-05 adds it.
- A DPA with vh.pl: decided 2026-11-22 to inform users through Polityka Prywatności and Regulamin instead; recorded here as the user's decision, not legal advice.
- Change-password while logged in, change email, MFA, OAuth/social login, "remember me", session list UI, CAPTCHA, breached-password API lookups, DB-backed lockout counters, HSTS configuration (host-level), observability/metrics.
- Any change to the quiz endpoints or to the anonymity contract (quiz answers never stored, logged or put in storage).
- Reading client IP from anything but the socket or the last `X-Forwarded-For` entry; no IP addresses are stored or logged.

## Implementation Approach

Add a small auth layer in `api/`, kept out of `handler.js`:

- `http.js` (shared `sendJson`, `readJsonBody`, limits, extracted unchanged) → `auth-config.js` (all tunables in one place) → `passwords.js`, `tokens.js`, `rate-limit.js`, `mailer.js` → `auth-store.js` (SQL) → `auth-service.js` (logic, fake-able) → `auth-routes.js` (HTTP, cookies, CSRF guard). `createHandler({ data, ping, auth })` delegates `/api/auth/*` to `auth` when provided, so quiz tests need no changes.
- Sessions: random 256-bit ID in a `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` cookie (`__Host-sid`); only its SHA-256 is stored. Idle timeout 30 min, absolute 8 h, both enforced in SQL with `NOW()`. A new session is created at every login.
- One-time tokens (email verification 24 h, password reset 1 h) are 256-bit random, stored hashed, single-use, delivered in the URL **fragment** so they never reach server logs; the Angular page POSTs them and then scrubs the fragment.
- Anti-enumeration: register, resend and forgot always answer 202 with the same body; login answers one generic 401 for unknown email or wrong password, running a dummy hash for unknown emails; mail is sent after the response is written.
- Abuse limits in memory (user decision): login failures per email and per IP, registration/forgot/resend per email and per IP, plus a global outbound-mail budget under vh.pl's 250/hour.
- Front end: reactive forms, an `AuthState` signal service (no browser storage), header/footer, five form pages, dev proxy so dev is same-origin like production.

## Critical Implementation Details

- **Cookie in dev.** `__Host-` needs `Secure`. Local `http://localhost` dev uses the dev-only flag `AUTH_INSECURE_COOKIES=1` (plain name `sid`, no `Secure`); the README states never to set it in production.
- **Tokens in the fragment.** `/weryfikacja#token=…` and `/reset-hasla#token=…`; the page reads `ActivatedRoute.fragment`, POSTs, then navigates with `replaceUrl` and no fragment.
- **Mail links come from `PUBLIC_BASE_URL`**, never from the `Host` header (host-header injection); if unset the mailer fails closed with a logged short code.
- **Write path.** Auth SQL uses new no-retry `write()`/`transaction()` helpers in `db.js`, not `query()`.
- **Hash gate.** At most 2 concurrent scrypt hashes with a bounded queue (20); beyond that answer 503 `unavailable`, so a registration flood cannot exhaust the 2 GB host.
- **QuizRun spec.** `AuthState` must never call `Storage.setItem`; it is only injected by `App` and auth pages, never by `QuizRun`.

## Phase 1: Schema and security primitives

### Overview

Everything the auth service builds on, with no HTTP surface yet: tables, hashing and policy, tokens, limiter, DB write helpers, shared HTTP helpers, and the SQL tested for real.

### Changes Required:

#### 1. Migrations for users, sessions and email tokens

**File**: `api/migrations/0009_create_users.sql`, `0010_create_sessions.sql`, `0011_create_email_tokens.sql`

**Intent**: Three one-statement DDL files in the existing style. Never edit applied files.

**Contract**:
- `users(id INT UNSIGNED PK AI, email VARCHAR(254) NOT NULL, password_hash VARCHAR(255) NOT NULL, email_verified_at TIMESTAMP NULL DEFAULT NULL, terms_version VARCHAR(20) NOT NULL, terms_accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_users_email (email))`. No role column.
- `sessions(token_hash CHAR(64) PK, user_id INT UNSIGNED NOT NULL, created_at, last_seen_at, expires_at TIMESTAMP, KEY idx_sessions_user (user_id), KEY idx_sessions_expires (expires_at), CONSTRAINT fk_sessions_user … ON DELETE CASCADE)`.
- `email_tokens(token_hash CHAR(64) PK, user_id …, purpose ENUM('verify','reset') NOT NULL, expires_at TIMESTAMP NOT NULL, created_at, KEY idx_email_tokens_user (user_id), CONSTRAINT fk_email_tokens_user … ON DELETE CASCADE)`.
- All `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`.

#### 2. Shared HTTP helpers extracted

**File**: `api/http.js` (new), `api/handler.js`

**Intent**: Move `sendJson`, `readJsonBody`, `PayloadTooLargeError`, `MAX_BODY_BYTES` into `http.js` unchanged so the auth routes reuse them; `handler.js` imports them and keeps exporting `MAX_BODY_BYTES`.

**Contract**: Behavior identical; the existing `api/test/handler.test.js` passes without edits.

#### 3. Auth configuration and token helpers

**File**: `api/auth-config.js`, `api/tokens.js` (new)

**Intent**: One module holds every tunable; `tokens.js` creates and hashes secrets.

**Contract**: `auth-config.js` exports: `SESSION_IDLE_SECONDS=1800`, `SESSION_ABSOLUTE_SECONDS=28800`, `VERIFY_TOKEN_SECONDS=86400`, `RESET_TOKEN_SECONDS=3600`, `UNVERIFIED_PURGE_DAYS=7`, `PASSWORD_MIN=10`, `PASSWORD_MAX=128`, `TERMS_VERSION='1'`, scrypt `{N:32768,r:8,p:3,maxmem:64 MiB}`, hash gate `{concurrency:2,queue:20}`, limiter budgets (login 5 failures/15 min per email, 30 attempts/10 min per IP; register/forgot/resend 3/hour per email and 10/hour per IP; global mail 200/hour), cookie names. `tokens.js`: `newToken()` → `{ token, hash }` (32 random bytes base64url, SHA-256 hex via `crypto`); `hashToken(token)`; constant-time compare helper.

#### 4. Password module, policy, common-password list, measurement script

**File**: `api/passwords.js`, `api/data/common-passwords.txt`, `api/scripts/measure-scrypt.js` (new)

**Intent**: Hash/verify with `node:crypto` scrypt behind the concurrency gate; enforce the agreed policy; let the user time the parameters on any machine.

**Contract**: `hashPassword(pw)` → `scrypt$<log2N>$<r>$<p>$<saltB64>$<hashB64>` (16-byte salt, 32-byte key, NFKC-normalized input, async scrypt, `maxmem` set); `verifyPassword(pw, stored)` parses parameters from the string and compares with `timingSafeEqual` after a length check; `verifyDummy()` runs a hash against a fixed dummy for unknown emails. `checkPolicy(pw, email)` → `null | 'too_short' | 'too_long' | 'too_common'` (length in Unicode code points, 10–128, no composition rules, case-insensitive match against the list, also rejects the email or its local part). The list file holds only entries of ≥ 10 characters; its header records source and licence. Gate exhaustion throws an error mapped to 503. `measure-scrypt.js` prints elapsed ms for N hashes with the configured parameters.

#### 5. In-memory rate limiter

**File**: `api/rate-limit.js` (new)

**Intent**: Fixed-window counters keyed by string, with bounded memory.

**Contract**: `createLimiter({ max, windowMs, maxKeys=10000 })` → `{ hit(key): boolean /* allowed */, peek(key), reset(key) }`; expired keys pruned on access; oldest evicted at `maxKeys`; clock injectable for tests. Counters are lost on restart (accepted by the user).

#### 6. DB write and transaction helpers

**File**: `api/db.js`

**Intent**: Safe write primitives next to `query()`.

**Contract**: `write(sql, params)` — same pool/timeout as `query`, **no retry**, returns the mysql2 result; `transaction(fn)` — takes a pooled connection, `BEGIN`, runs `fn(conn)` where `conn.query` honors the timeout, `COMMIT`/`ROLLBACK`, always releases. Existing exports unchanged; existing db tests stay green and new tests assert no-retry and rollback-on-throw using the fake-pool approach in `api/test/db-query.test.js`.

#### 7. Auth store (SQL)

**File**: `api/auth-store.js` (new)

**Intent**: The only module with auth SQL; all expiry math uses DB `NOW()`.

**Contract** (all async): `createUser({email,passwordHash,termsVersion})` → id, throws an error with `code==='DUPLICATE_EMAIL'` on `ER_DUP_ENTRY`; `findUserByEmail(email)`; `markEmailVerified(userId)`; `updatePassword(userId,hash)`; `createSession({tokenHash,userId})`; `getSession(tokenHash)` → user row only if `expires_at > NOW()` and `last_seen_at > NOW() - idle`; `touchSession(tokenHash)` (writes at most once a minute); `deleteSession`, `deleteSessionsForUser`; `replaceEmailToken({userId,purpose,tokenHash,ttlSeconds})` (delete old + insert, in a transaction); `consumeEmailToken({tokenHash,purpose})` → userId or null (select-for-update + delete in one transaction, expired rows never match); `purgeExpired()` (expired sessions/tokens, unverified accounts older than `UNVERIFIED_PURGE_DAYS`). Emails are lower-cased and trimmed by the caller.

#### 8. Opt-in database test

**File**: `api/test/auth-store.db.test.js` (new)

**Intent**: Real-SQL checks for the riskiest queries without needing CI DB.

**Contract**: Skipped unless `AUTH_DB_TEST=1`; refuses to run if `DB_NAME` does not match `/test|scratch/i`; applies migrations to that database, then covers unique email (case-insensitive), cascade delete, session idle/absolute expiry, token single-use and expiry, purge.

### Success Criteria:

#### Automated Verification:

- API tests pass, including new `passwords`, `tokens`, `rate-limit`, `db` write/transaction tests and the unchanged existing handler/db tests: `npm run test:api`
- Scrypt measurement script runs and prints timings: `node api/scripts/measure-scrypt.js`
- Formatting on changed files passes: `npx prettier --check api`

#### Manual Verification:

- Migrations `0009`–`0011` apply on a scratch MariaDB database using the PowerShell recipe from `context/foundation/lessons.md`, and `schema_migrations` lists them
- The opt-in DB test passes with `AUTH_DB_TEST=1` against the scratch database and refuses to run when `DB_NAME` does not look like a scratch database
- `common-passwords.txt` source and licence are recorded in its header and a few well-known weak 10+ character passwords are rejected

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Auth API

### Overview

Eight endpoints, the CSRF/Origin guard, cookie handling and mail, wired into the handler and `app.js`, fully tested with fakes.

### Changes Required:

#### 1. Mailer and Polish templates

**File**: `api/mailer.js`, `api/mail-templates.js` (new), `api/package.json`

**Intent**: Send verification, reset and "account already exists" mail through vh.pl SMTP with `nodemailer` (pure JS; no native build).

**Contract**: dependency `nodemailer` added; `createMailer(env, { transport? })` → `{ sendVerification(to, token), sendReset(to, token), sendAlreadyRegistered(to) }`. Env: `SMTP_HOST`, `SMTP_PORT` (465 → implicit TLS, otherwise STARTTLS required), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` (agreed sender: `support@quiz.demokratia.pl`; `SMTP_USER` is expected to be that mailbox's own login, a cPanel convention not yet verified), `PUBLIC_BASE_URL` (must be `https://…`, or `http://localhost…` when `AUTH_INSECURE_COOKIES=1`). Links: `${PUBLIC_BASE_URL}/weryfikacja#token=…` and `/reset-hasla#token=…`. Connection/socket timeouts 10/15 s. Missing config → send rejects with `code 'MISSING_CONFIG'` (name only, no values). `MAIL_TRANSPORT=console` (dev only) prints the message instead of sending; in every other mode nothing about the recipient or token is logged. Text-only Polish bodies; no tracking.

#### 2. Auth service

**File**: `api/auth-service.js` (new)

**Intent**: All account logic as pure-ish functions over injected `{ store, mailer, passwords, limiters }`, returning `{ status, body, setSession?, clearSession? }`.

**Contract** (bodies are fixed public shapes):
- `register({email,password,acceptTerms})`: validates email shape (≤254, one `@`), `acceptTerms===true`, policy; limiter per email and IP; existing verified email → `sendAlreadyRegistered`, existing unverified → new verification token + mail, new email → hash (gated), `createUser`, token + mail. Always **202 `{status:'ok'}`** after validation; mail is dispatched after the response is written and failures are logged by short code only. Validation errors: 400 `invalid_request`, 422 `invalid_email` | `terms_required` | `invalid_password` with `reason`.
- `verifyEmail({token})` → 200 or 400 `invalid_token` (single use; marks verified; does not log in).
- `resendVerification({email})` → always 202; sends only for existing unverified users, within limits.
- `login({email,password})` → 200 `{user:{id,email}}` + new session; unknown email runs `verifyDummy`; wrong password or unknown email → 401 `invalid_credentials`; correct password but unverified → 403 `email_not_verified`; limiter exhausted → 429 `rate_limited`; failures count per email and per IP, success resets the email counter; any session presented in the cookie is deleted first (no fixation).
- `logout(sessionToken)` → deletes the session, 200, clears cookie.
- `me(sessionToken)` → 200 `{user:{id,email}|null}`; touches the session.
- `forgotPassword({email})` → always 202; mail only for verified users.
- `resetPassword({token,password})` → 200; 400 `invalid_token`; 422 `invalid_password`; sets the new hash, marks the email verified, deletes all of the user's sessions and tokens.
- Housekeeping: `store.purgeExpired()` runs at most once per hour, triggered lazily by register/login.

#### 3. Routes, cookies and CSRF guard

**File**: `api/auth-routes.js` (new)

**Intent**: HTTP layer for `/api/auth/*`.

**Contract**: `createAuthRoutes({ service, env })` → `handle(req,res,pathname)`. Endpoints (all JSON, all `Cache-Control: no-store`): `POST /api/auth/register|verify-email|resend-verification|login|logout|forgot-password|reset-password`, `GET /api/auth/me`; other paths/methods under `/api/auth/` → 404 `{status:'not_found'}`. Guard on every POST: if `Sec-Fetch-Site` is present it must be `same-origin`; otherwise `Origin` must be present and its host must equal the request `Host`; else 403 `csrf_rejected` (before any body is read). Cookie: `__Host-sid=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=<absolute>`; with `AUTH_INSECURE_COOKIES=1` the name is `sid` and `Secure` is omitted. Client IP = last `X-Forwarded-For` entry else socket address, used only as a limiter key (never logged/stored). Errors use the existing `{status:'error', code}` shape; unexpected store errors → 503 `unavailable` with only the short code logged.

#### 4. Handler and entry point wiring

**File**: `api/handler.js`, `api/app.js`

**Intent**: Delegate auth paths without touching quiz behavior.

**Contract**: `createHandler({ data, ping, auth })`; before the 404 fallback, `if (auth && pathname.startsWith('/api/auth/')) return await auth.handle(req, res, pathname)`. `app.js` builds the real service (store, mailer from `process.env`, limiters) and passes it. Without `auth` (all existing tests) `/api/auth/*` is a 404 as today.

#### 5. API documentation

**File**: `api/README.md`

**Intent**: Document the new environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `PUBLIC_BASE_URL`, `AUTH_INSECURE_COOKIES`, `MAIL_TRANSPORT`), the endpoint table, the auth privacy rules and the opt-in DB test.

**Contract**: dev-only flags carry a "never set in production" note, same style as `CORS_ORIGIN`.

### Success Criteria:

#### Automated Verification:

- API tests pass, including new `mailer`, `auth-service` (fake store), `auth-routes` (real server on port 0, in-memory fake store) tests: `npm run test:api`
- Tests prove anti-enumeration (identical 202 bodies for new/existing/unknown emails; same 401 for unknown and wrong-password), the CSRF guard (cross-origin, missing headers, `same-site` rejected), single-use and expired tokens, session regeneration at login, password-reset session invalidation, limiter 429s, 413 on oversized bodies, and that `console` output during these flows contains no email, password or token
- Existing quiz endpoint tests pass unchanged: `npm run test:api`
- Formatting passes: `npx prettier --check api`

#### Manual Verification:

- With a scratch database, `MAIL_TRANSPORT=console` and `AUTH_INSECURE_COOKIES=1`, a PowerShell/curl run of register → verify (token from console) → login → `me` → logout works and `me` is `{user:null}` afterwards
- A POST with `Origin: https://evil.example` (and without `Sec-Fetch-Site`) to `/api/auth/login` returns 403 `csrf_rejected`
- Password reset invalidates a second logged-in session and the old password no longer works

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Angular auth UI and dev proxy

### Overview

Auth state, shell changes and the five form pages, with dev made same-origin through a proxy.

### Changes Required:

#### 1. Dev proxy

**File**: `src/proxy.conf.json` (new), `angular.json`, `src/environments/environment.development.ts`

**Intent**: Make `ng serve` same-origin with the API so cookies and the Origin check behave as in production.

**Contract**: `{"/api/**": {"target":"http://localhost:3000","secure":false}}`; `proxyConfig` set under the `serve` target `options`; development `apiBaseUrl` becomes `/api`. Restart `ng serve` after the change.

#### 2. Auth API client and state

**File**: `src/app/auth/auth.models.ts`, `auth-api.ts`, `auth-state.ts` (+ specs)

**Intent**: Typed wrapper over the eight endpoints and a signal-based session state.

**Contract**: `AuthApi` (`register`, `verifyEmail`, `resendVerification`, `login`, `logout`, `forgotPassword`, `resetPassword`, `me`) mirroring `QuizApi` style; `AuthState` exposes `user: Signal<User|null>` and `ready: Signal<boolean>`, `refresh()`, `login()`, `logout()`; started with `provideAppInitializer` **without awaiting** so the quiz never waits on it. `AuthState` makes no storage calls; its spec asserts `Storage.prototype.setItem` is never called.

#### 3. Shell: header, footer, routes

**File**: `src/app/app.ts`, `app.html`, `app.scss`, `app.routes.ts`, `app.spec.ts`

**Intent**: Header shows "Zaloguj się" / "Załóż konto" for anonymous users, and the email plus "Wyloguj" when logged in (rendered only once `ready`); footer links to Regulamin and Polityka Prywatności (pages land in Phase 4, routes added there).

**Contract**: routes added before the `'**'` redirect: `rejestracja`, `logowanie`, `weryfikacja`, `zapomniane-haslo`, `reset-hasla`, each titled `'<Strona> | Z kim mi po drodze'`. `app.spec.ts` gains `provideHttpClient()` + `provideHttpClientTesting()`.

#### 4. Form pages

**File**: `src/app/auth/register/`, `login/`, `verify-email/`, `forgot-password/`, `reset-password/` (`.ts/.html/.scss`, specs), `src/app/auth/auth-messages.ts`

**Intent**: Reactive-form pages in Polish with `role="alert"` errors, one place mapping API codes to copy.

**Contract**: register has email, password (hint: min 10 znaków), and an "Akceptuję Regulamin i Politykę Prywatności" checkbox (links to the Phase 4 pages), then shows "Sprawdź skrzynkę"; login shows a "Wyślij link ponownie" button on `email_not_verified` and navigates to `/` on success; verify and reset pages read the token from `ActivatedRoute.fragment`, POST it, then scrub the fragment with `replaceUrl`; forgot shows the same neutral message regardless of the email. A logged-in user opening login/register sees "Jesteś zalogowany".

#### 5. Shared form styles

**File**: `src/styles.scss`

**Intent**: Global `.field`, `label`, input, hint and form-layout classes using existing tokens, focus ring `3px solid var(--accent)`, min tap height 2.75rem, dark-mode safe; component SCSS stays under the 4 kB budget.

**Contract**: no new design tokens; reuses `.button`, `.notice.error`, `.card`.

### Success Criteria:

#### Automated Verification:

- App tests pass (new `AuthApi`, `AuthState`, page specs and the updated `App` spec): `npm run test:app`
- Production build stays within budgets: `npm run build`
- Full suite passes: `npm test`
- Formatting passes: `npx prettier --check src`

#### Manual Verification:

- With `npm start` (proxy) and the API on `:3000` using `MAIL_TRANSPORT=console`, the full browser flow works: register → verification link → login (header shows email) → logout → forgot/reset
- The anonymous quiz still works end to end, with no failing network calls or console errors (`GET /api/auth/me` returns 200 `{user:null}`)
- Forms are usable at phone width and in dark mode, with visible focus and screen-reader error announcements

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Legal pages and go-live readiness

### Overview

The Polityka Prywatności and Regulamin pages, the go-live guard and smoke check, documentation, and the manual checklist that turns the feature on in production.

### Changes Required:

#### 1. Legal pages and config

**File**: `src/app/legal/legal.config.ts`, `privacy-policy/`, `terms/` (components + specs), `src/app/app.routes.ts`

**Intent**: Polish **draft** pages at `/polityka-prywatnosci` and `/regulamin`, marked as drafts for the owner's review, describing: controller (quiz.demokratia.pl) and contact, data stored (email, password hash, verification state, session records, acceptance version/time), purposes, hosting at vh.pl with data centres in Gdańsk/Gdynia (EU), 31-day backups, no IP storage, user rights, that the account can be deleted once the deletion feature ships, and that quiz answers are not stored.

**Contract**: `legal.config.ts` exports `TERMS_VERSION='1'`, `PRIVACY_CONTACT` and `CONTROLLER_NAME`, both initialised to the placeholder `DO_UZUPELNIENIA`, and `EFFECTIVE_DATE`. An API test asserts `TERMS_VERSION` equals `api/auth-config.js`.

#### 2. Go-live guard

**File**: `scripts/check-go-live.mjs` (new), `.github/workflows/deploy-vhpl.yml`

**Intent**: A deploy cannot publish pages with a placeholder contact.

**Contract**: the script exits non-zero if `legal.config.ts` still contains `DO_UZUPELNIENIA`; the deploy workflow runs it before `npm run build`.

#### 3. Deploy smoke check

**File**: `.github/workflows/deploy-vhpl.yml`

**Intent**: After deploy, `GET /api/auth/me` must return 200 with `"user":null`; GET-only, never registers or logs in.

**Contract**: tolerate commits from before the endpoint existed (rollback targets) the same way the `/api/health/db` check does (`deploy-vhpl.yml:236-240`).

#### 4. Documentation

**File**: `CLAUDE.md`, `context/foundation/prd.md`, `context/foundation/roadmap.md`, `context/foundation/infrastructure.md`

**Intent**: Keep foundation docs true, edited in place (Polish): `CLAUDE.md` project state (S-03 exists, dev uses the proxy, new env vars); PRD Access Control and Open Question 4 (email + password with verification and reset; admin bootstrap still open); roadmap S-03 unknowns/blocker and Open Roadmap Question 4; `infrastructure.md` RODO line (decision 2026-11-22: location accepted, no DPA, users informed via Polityka Prywatności and Regulamin, trigger no. 4 not fired).

**Contract**: no dated copies; wording records the decision and its date.

### Success Criteria:

#### Automated Verification:

- Full suite passes, including the `TERMS_VERSION` consistency test and legal page specs: `npm test`
- Go-live guard fails while the placeholder is present: `node scripts/check-go-live.mjs` exits non-zero
- Production build succeeds: `npm run build`
- Formatting passes on changed files: `npx prettier --check src api scripts`

#### Manual Verification:

- The owner reads and approves (or edits) the draft Polityka Prywatności and Regulamin, and sets `CONTROLLER_NAME`, `PRIVACY_CONTACT` and `EFFECTIVE_DATE`; the guard then passes
- Go-live gates done: a sender mailbox exists for `MAIL_FROM`; `SMTP_*`, `MAIL_FROM` and `PUBLIC_BASE_URL` are set in the cPanel Node app, which is re-saved
- On the host, `node api/scripts/measure-scrypt.js` shows an acceptable hash time (target under 500 ms) and no memory errors; otherwise adjust the scrypt constants to another OWASP-listed equivalent
- After the manual deploy workflow, the smoke check passes, and a real registration, verification mail, login, logout, and password-reset mail work on `quiz.demokratia.pl`
- In browser dev tools the production session cookie shows `__Host-sid`, `Secure`, `HttpOnly`, `SameSite=Lax`
- Docs updates in `CLAUDE.md`, `prd.md`, `roadmap.md` and `infrastructure.md` are reviewed

**Go-live mail details** (owner-agreed 2026-11-22): the sender is `support@quiz.demokratia.pl`. Create that mailbox in cPanel (it also receives replies), and confirm cPanel's Email Deliverability check for `quiz.demokratia.pl` shows valid SPF and DKIM; if the records must be added where `demokratia.pl` DNS is managed, do that before the first real send, otherwise verification mail may land in spam. This address is the mail sender only; the privacy contact in `legal.config.ts` is a separate value the owner still sets.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. This is the last phase; the change is not done until the go-live checks pass.

---

## Testing Strategy

### Unit Tests:

- `passwords`: policy boundaries (9/10/128/129 code points, Unicode, common list case-insensitive, email-equal), hash/verify round trip, parameter parsing, dummy verify, gate saturation
- `tokens`, `rate-limit` (window expiry, key eviction, injected clock), `mailer` (links built from `PUBLIC_BASE_URL`, fail-closed config, no logging of recipient/token), `auth-service` with a fake store (each branch of every endpoint)

### Integration Tests:

- `auth-routes` against a real in-process server with an in-memory fake store: complete register → verify → login → me → logout, reset flow, CSRF guard cases, cookie attributes in both modes, `no-store`, 404 for unknown `/api/auth/*`
- Opt-in real-SQL test (`AUTH_DB_TEST=1`) for uniqueness, cascade, expiry and single-use tokens

### Manual Testing Steps:

1. Run the Phase 2 curl/PowerShell flow with the console mail transport
2. Run the Phase 3 browser flow through the dev proxy, then the anonymous quiz
3. Run the Phase 4 go-live checklist on the host, including real mail delivery

## Performance Considerations

scrypt (N=2^15, r=8, p=3, ~32 MiB) runs through a 2-slot gate with a bounded queue; the 3-connection DB pool is never held during hashing. `touchSession` writes at most once per minute. The in-memory limiter is bounded at 10 000 keys per limiter. Quiz latency is unaffected because quiz routes do not touch auth.

## Migration Notes

Migrations are add-only and backward-compatible with the previous app version (new tables only). Deploy applies them before the restart (`deploy-vhpl.yml`); rollback does not undo them. New environment variables are manual cPanel steps and the app must be re-saved; a missing variable only disables mail sending (fails closed with a logged code), not the quiz. Unverified accounts older than 7 days are purged opportunistically.

## References

- Related research: `context/changes/account-registration-login/research.md`
- Roadmap item: `context/foundation/roadmap.md` (S-03, `Change ID: account-registration-login`)
- PRD: `context/foundation/prd.md:75,104-108,126-134,148`
- Handler/test pattern: `api/handler.js:194-238`, `api/test/handler.test.js:64-76`
- DB helpers: `api/db.js:85-96`
- Migration style: `api/migrations/0005_create_questions.sql`, `api/README.md:54-61`
- Lessons: `context/foundation/lessons.md:5-10` (migration testing recipe)
- OWASP Password Storage, Session Management, CSRF Prevention and Authentication cheat sheets (read 2026-11-22)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and security primitives

#### Automated

- [x] 1.1 API tests pass, including new `passwords`, `tokens`, `rate-limit`, `db` write/transaction tests and the unchanged existing handler/db tests: `npm run test:api` — a85821b
- [x] 1.2 Scrypt measurement script runs and prints timings: `node api/scripts/measure-scrypt.js` — a85821b
- [x] 1.3 Formatting on changed files passes: `npx prettier --check api` — a85821b

#### Manual

- [x] 1.4 Migrations `0009`–`0011` apply on a scratch MariaDB database using the PowerShell recipe from `context/foundation/lessons.md`, and `schema_migrations` lists them — a85821b
- [x] 1.5 The opt-in DB test passes with `AUTH_DB_TEST=1` against the scratch database and refuses to run when `DB_NAME` does not look like a scratch database — a85821b
- [x] 1.6 `common-passwords.txt` source and licence are recorded in its header and a few well-known weak 10+ character passwords are rejected — a85821b

### Phase 2: Auth API

#### Automated

- [x] 2.1 API tests pass, including new `mailer`, `auth-service` (fake store), `auth-routes` (real server on port 0, in-memory fake store) tests: `npm run test:api` — 5f77d21
- [x] 2.2 Tests prove anti-enumeration (identical 202 bodies for new/existing/unknown emails; same 401 for unknown and wrong-password), the CSRF guard (cross-origin, missing headers, `same-site` rejected), single-use and expired tokens, session regeneration at login, password-reset session invalidation, limiter 429s, 413 on oversized bodies, and that `console` output during these flows contains no email, password or token — 5f77d21
- [x] 2.3 Existing quiz endpoint tests pass unchanged: `npm run test:api` — 5f77d21
- [x] 2.4 Formatting passes: `npx prettier --check api` — 5f77d21

#### Manual

- [x] 2.5 With a scratch database, `MAIL_TRANSPORT=console` and `AUTH_INSECURE_COOKIES=1`, a PowerShell/curl run of register → verify (token from console) → login → `me` → logout works and `me` is `{user:null}` afterwards — 5f77d21
- [x] 2.6 A POST with `Origin: https://evil.example` (and without `Sec-Fetch-Site`) to `/api/auth/login` returns 403 `csrf_rejected` — 5f77d21
- [x] 2.7 Password reset invalidates a second logged-in session and the old password no longer works — 5f77d21

### Phase 3: Angular auth UI and dev proxy

#### Automated

- [x] 3.1 App tests pass (new `AuthApi`, `AuthState`, page specs and the updated `App` spec): `npm run test:app` — 84a382d
- [x] 3.2 Production build stays within budgets: `npm run build` — 84a382d
- [x] 3.3 Full suite passes: `npm test` — 84a382d
- [x] 3.4 Formatting passes: `npx prettier --check src` — 84a382d

#### Manual

- [x] 3.5 With `npm start` (proxy) and the API on `:3000` using `MAIL_TRANSPORT=console`, the full browser flow works: register → verification link → login (header shows email) → logout → forgot/reset — 84a382d
- [x] 3.6 The anonymous quiz still works end to end, with no failing network calls or console errors (`GET /api/auth/me` returns 200 `{user:null}`) — 84a382d
- [x] 3.7 Forms are usable at phone width and in dark mode, with visible focus and screen-reader error announcements — 84a382d

### Phase 4: Legal pages and go-live readiness

#### Automated

- [x] 4.1 Full suite passes, including the `TERMS_VERSION` consistency test and legal page specs: `npm test` — 356f716
- [x] 4.2 Go-live guard fails while the placeholder is present: `node scripts/check-go-live.mjs` exits non-zero — 356f716
- [x] 4.3 Production build succeeds: `npm run build` — 356f716
- [x] 4.4 Formatting passes on changed files: `npx prettier --check src api scripts` — 356f716

#### Manual

- [x] 4.5 The owner reads and approves (or edits) the draft Polityka Prywatności and Regulamin, and sets `CONTROLLER_NAME`, `PRIVACY_CONTACT` and `EFFECTIVE_DATE`; the guard then passes — 356f716
- [x] 4.6 Go-live gates done: a sender mailbox exists for `MAIL_FROM`; `SMTP_*`, `MAIL_FROM` and `PUBLIC_BASE_URL` are set in the cPanel Node app, which is re-saved — 356f716
- [x] 4.7 On the host, `node api/scripts/measure-scrypt.js` shows an acceptable hash time (target under 500 ms) and no memory errors; otherwise adjust the scrypt constants to another OWASP-listed equivalent — 356f716
- [x] 4.8 After the manual deploy workflow, the smoke check passes, and a real registration, verification mail, login, logout, and password-reset mail work on `quiz.demokratia.pl` — 356f716
- [x] 4.9 In browser dev tools the production session cookie shows `__Host-sid`, `Secure`, `HttpOnly`, `SameSite=Lax` — 356f716
- [x] 4.10 Docs updates in `CLAUDE.md`, `prd.md`, `roadmap.md` and `infrastructure.md` are reviewed — 356f716
