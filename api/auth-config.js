'use strict';

// Every auth tunable in one place. Values come from the agreed plan (account-registration-login);
// change them here, not at call sites. No secrets live in this file.

const MINUTE = 60;
const HOUR = 60 * MINUTE;

module.exports = {
  // Sessions: an opaque random id in a cookie; only its SHA-256 is stored. Both limits are enforced
  // in SQL against the database clock.
  SESSION_IDLE_SECONDS: 30 * MINUTE,
  SESSION_ABSOLUTE_SECONDS: 8 * HOUR,
  // last_seen_at is refreshed at most this often, so reading "me" does not write on every request.
  SESSION_TOUCH_SECONDS: MINUTE,

  // One-time email tokens (single use, stored hashed).
  VERIFY_TOKEN_SECONDS: 24 * HOUR,
  RESET_TOKEN_SECONDS: HOUR,

  // Accounts that never verified their email are removed after this many days (data minimisation).
  UNVERIFIED_PURGE_DAYS: 7,

  // Password policy (PRD/OWASP: no composition rules). OWASP asks for 15 without MFA; 10 is a
  // deliberate, owner-approved deviation.
  PASSWORD_MIN: 10,
  PASSWORD_MAX: 128,

  // Version of the Regulamin / Polityka Prywatności the user accepted at registration. Keep equal to
  // TERMS_VERSION in src/app/legal/legal.config.ts.
  TERMS_VERSION: '1',

  // scrypt: N=2^15, r=8, p=3 is one of OWASP's listed equivalents of the N=2^17 minimum (about 32 MiB
  // per hash). maxmem must exceed Node's 32 MiB default check of 128 * N * r.
  SCRYPT: { N: 32768, r: 8, p: 3, keylen: 32, saltBytes: 16, maxmem: 64 * 1024 * 1024 },
  // At most this many hashes run at once and this many may wait; more are refused (-> 503). Protects
  // the small shared host from a registration flood.
  HASH_GATE: { concurrency: 2, queue: 20 },

  // In-memory limiter budgets (counters are lost on restart; accepted by the owner).
  LIMITS: {
    // failed logins per email, and login attempts per client address
    loginFailuresPerEmail: { max: 5, windowMs: 15 * MINUTE * 1000 },
    loginPerIp: { max: 30, windowMs: 10 * MINUTE * 1000 },
    // register / forgot-password / resend-verification
    mailPerEmail: { max: 3, windowMs: HOUR * 1000 },
    mailPerIp: { max: 10, windowMs: HOUR * 1000 },
    // outbound mail overall, kept under vh.pl's 250 messages per hour
    mailGlobal: { max: 200, windowMs: HOUR * 1000 },
  },

  // The __Host- prefix needs Secure, so it is dropped only in the dev-only AUTH_INSECURE_COOKIES mode.
  COOKIE_NAME_SECURE: '__Host-sid',
  COOKIE_NAME_INSECURE: 'sid',
};
