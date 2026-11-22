# Account Registration and Login (S-03) — Plan Brief

> Full plan: `context/changes/account-registration-login/plan.md`
> Research: `context/changes/account-registration-login/research.md`

## What & Why

Let a user register with email and password, verify the address by mail, log in and out, and reset a forgotten password (PRD FR-001, roadmap S-03). Accounts stay optional: the anonymous quiz is unchanged. This is the first slice that stores personal data, and it unblocks saving results, admin and export (S-04, S-05, S-08).

## Starting Point

There is no auth code in `api/` or `src/` and no user table. The API is a hand-written `node:http` router with an injected data layer; production is same-origin, dev is cross-origin; Angular has no form, guard or auth-state code. The host is vh.pl shared hosting with one Passenger Node process that restarts on every deploy.

## Desired End State

On `quiz.demokratia.pl` a visitor can "Załóż konto", accept the Regulamin and Polityka Prywatności, verify by Polish email, log in (header shows their email and "Wyloguj"), log out, and recover a forgotten password. Anonymous quiz-taking still works with no account calls beyond one harmless `GET /api/auth/me`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Identity | Email + password, email verified | Standard flow; verification needs working SMTP, made a go-live gate | Plan (user) |
| Email scope | Verification, resend and password reset all included | Complete lifecycle, no stranded users | Plan (user) |
| Session | Opaque random ID in cookie, only SHA-256 stored in DB | Survives Passenger restarts, revocable at logout, no signing secret | Plan (user) / Research |
| CSRF | `SameSite=Lax` cookie + `Sec-Fetch-Site`/`Origin` check on POST | Stateless, fits same-origin production and the browser baseline | Plan (user) / Research |
| Password policy | Min 10, max 128, no composition rules, bundled common-password list | User chose usability over OWASP's 15 (deviation recorded) | Plan (user) |
| Hashing | `node:crypto` scrypt N=2^15, r=8, p=3, 2-slot gate | OWASP-listed equivalent, no native module on vh.pl, bounded host load | Research / Plan |
| Rate limiting | In-memory only (per email, per IP, global mail budget) | No schema, accepted that counters reset on restart | Plan (user) |
| Admin role | Deferred to S-05 | Keeps this slice minimal; bootstrap question still open | Plan (user) |
| RODO | Location accepted, no DPA, users informed via Polityka Prywatności and Regulamin | Owner's decision 2026-11-22 (not legal advice) | Plan (user) |
| Legal text | I draft Polish pages, owner reviews; contact set before go-live, deploy guard enforces it | Pages exist now without publishing a fake contact | Plan (user) |
| Mail | vh.pl SMTP via `nodemailer`, sender `support@quiz.demokratia.pl`, verified at go-live | No extra data processor; path unverified so it is a gate | Plan (user) |
| Dev transport | Angular dev proxy for `/api/**` | Dev matches production, so cookies and Origin check behave the same | Plan (user) |
| Tests | Fake-store tests + opt-in real-SQL test against a scratch DB | Auth SQL is the riskiest and gets automated checks locally | Plan (user) |

## Scope

**In scope:** users/sessions/email-token tables; 8 `/api/auth/*` endpoints; scrypt hashing and policy; in-memory limits; Polish mail; Angular register/login/verify/forgot/reset pages, header and footer; dev proxy; Polityka Prywatności and Regulamin drafts with acceptance; deploy guard and smoke check; doc updates.

**Out of scope:** saving results (S-04), account deletion (S-07), export (S-08), admin role and bootstrap (S-05), vh.pl DPA, change-password/email, MFA, OAuth, CAPTCHA, remember-me, observability.

## Architecture / Approach

A small auth layer in `api/` (shared HTTP helpers → hashing, tokens, limiter, mailer → SQL store → service → routes) plugged into `createHandler` as an injected `auth` dependency, so quiz routes and tests are untouched. One-time tokens travel in the URL fragment so they never reach server logs. Angular adds an `AuthState` signal service (no browser storage, to keep the quiz anonymity contract) and reactive-form pages.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and security primitives | Migrations 0009–0011, scrypt + policy, tokens, limiter, DB write/transaction helpers, real-SQL test | scrypt cost and memory on the 2 GB shared host |
| 2. Auth API | 8 endpoints, CSRF guard, cookies, nodemailer mail, wiring and tests | Anti-enumeration and CSRF subtleties; mail path unverified |
| 3. Angular auth UI and dev proxy | Auth state, header/footer, 5 form pages, proxy, specs | Not breaking the anonymous no-storage guarantee |
| 4. Legal pages and go-live readiness | Draft legal pages, deploy guard, smoke check, docs, go-live checklist | Owner-side gates: contact address, mailbox, SMTP, legal review |

**Prerequisites:** F-01 done (database, migrations, deploy); a scratch MariaDB for local checks; before go-live the sender mailbox `support@quiz.demokratia.pl` on vh.pl (with working SPF/DKIM) and the owner's privacy contact and controller details.
**Estimated effort:** about 4 sessions, one per phase, plus a go-live session on the host; accounts remain the main schedule risk against 2026-12-06.

## Open Risks & Assumptions

- Outbound SMTP from Node on vh.pl is not documented; if blocked, mail features need a follow-up and registrations cannot be verified.
- Client IP behind LiteSpeed/Passenger is unverified; the per-IP limit may collapse to one proxy address, so the per-email limit is the real guard and budgets are generous.
- The common-password list's source and licence must be confirmed when it is added.
- The legal pages are drafts, not legal review; the owner owns the final wording.
- Password minimum of 10 is a deliberate deviation from OWASP's 15 for accounts without MFA.

## Success Criteria (Summary)

- A new user can register, verify by email, log in, log out and reset their password on `quiz.demokratia.pl`, and the header reflects their state.
- The anonymous quiz still works with no stored answers and no account calls that fail.
- `npm test` passes, the deploy guard blocks a placeholder contact, and the deploy smoke check passes.
