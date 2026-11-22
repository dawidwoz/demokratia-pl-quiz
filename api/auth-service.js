'use strict';

// Account logic: register, verify email, resend, login, logout, me, forgot/reset password. No HTTP
// here (see auth-routes.js) and no SQL (see auth-store.js): both are injected, so tests drive every
// branch with fakes. Every method takes (body, { ip, sessionToken }) and returns
//   { status, body, setSession?, clearSession?, after? }
// where `after` is work (sending mail) the caller runs once the response has been written, so response
// time does not reveal whether an account exists.
//
// Privacy and anti-enumeration rules, enforced here:
//  - register / resend / forgot answer the same 202 for known and unknown emails;
//  - login answers one 401 for an unknown email and for a wrong password, and burns a dummy hash for
//    unknown emails;
//  - nothing here logs an email, a password or a token (only short error codes).

const defaultConfig = require('./auth-config');
const { createLimiter } = require('./rate-limit');
const defaultTokens = require('./tokens');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_TOKEN_LENGTH = 200;
const MAX_LOGIN_PASSWORD_LENGTH = 1024;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : 'UNKNOWN';
}

const reply = (status, body, extra) => ({ status, body, ...extra });
const failure = (status, code, extra) => reply(status, { status: 'error', code, ...extra });
const ok = (extra) => reply(200, { status: 'ok' }, extra);
const accepted = (extra) => reply(202, { status: 'ok' }, extra);
const rateLimited = () => failure(429, 'rate_limited');
const invalidRequest = () => failure(400, 'invalid_request');

function createAuthService({
  store,
  mailer,
  passwords,
  tokens = defaultTokens,
  config = defaultConfig,
  now = Date.now,
}) {
  const limits = config.LIMITS;
  const limiters = {
    loginFailuresPerEmail: createLimiter({ ...limits.loginFailuresPerEmail, now }),
    loginPerIp: createLimiter({ ...limits.loginPerIp, now }),
    mailPerEmail: createLimiter({ ...limits.mailPerEmail, now }),
    mailPerIp: createLimiter({ ...limits.mailPerIp, now }),
    mailGlobal: createLimiter({ ...limits.mailGlobal, now }),
  };

  let lastPurge = 0;
  // Housekeeping at most once an hour, triggered by register/login and never awaited by the caller.
  function maybePurge() {
    if (now() - lastPurge < PURGE_INTERVAL_MS) return;
    lastPurge = now();
    store.purgeExpired().catch((error) => {
      console.error(`auth housekeeping failed: ${errorCode(error)}`);
    });
  }

  async function issueToken(userId, purpose, ttlSeconds) {
    const { token, hash } = tokens.newToken();
    await store.replaceEmailToken({ userId, purpose, tokenHash: hash, ttlSeconds });
    return token;
  }

  // The deferred mail job: spends one unit of the global mail budget, then sends.
  function deliver(send) {
    return async () => {
      limiters.mailGlobal.hit('global');
      await send();
    };
  }

  const mailBudgetLeft = () => limiters.mailGlobal.peek('global');

  async function register(body, { ip }) {
    if (
      !isObject(body) ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      typeof body.acceptTerms !== 'boolean'
    ) {
      return invalidRequest();
    }
    if (!limiters.mailPerIp.hit(ip)) return rateLimited();
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return failure(422, 'invalid_email');
    if (body.acceptTerms !== true) return failure(422, 'terms_required');
    const reason = passwords.checkPolicy(body.password, email);
    if (reason) return failure(422, 'invalid_password', { reason });
    if (!limiters.mailPerEmail.hit(email) || !mailBudgetLeft()) return rateLimited();
    maybePurge();

    // The same hashing work for every branch, so timing does not reveal an existing account.
    const passwordHash = await passwords.hashPassword(body.password);

    let existing = await store.findUserByEmail(email);
    if (!existing) {
      try {
        const userId = await store.createUser({
          email,
          passwordHash,
          termsVersion: config.TERMS_VERSION,
        });
        const token = await issueToken(userId, 'verify', config.VERIFY_TOKEN_SECONDS);
        return accepted({ after: deliver(() => mailer.sendVerification(email, token)) });
      } catch (error) {
        if (errorCode(error) !== 'DUPLICATE_EMAIL') throw error;
        // Lost a race with a parallel registration of the same email: treat it as existing.
        existing = await store.findUserByEmail(email);
        if (!existing) throw error;
      }
    }
    if (existing.emailVerified) {
      return accepted({ after: deliver(() => mailer.sendAlreadyRegistered(email)) });
    }
    // Existing but unverified: send a fresh link, never touch the stored password (otherwise anyone
    // could overwrite a pending account's password).
    const token = await issueToken(existing.id, 'verify', config.VERIFY_TOKEN_SECONDS);
    return accepted({ after: deliver(() => mailer.sendVerification(email, token)) });
  }

  async function verifyEmail(body) {
    if (!isObject(body) || typeof body.token !== 'string' || body.token.length > MAX_TOKEN_LENGTH) {
      return invalidRequest();
    }
    const userId = await store.consumeEmailToken({
      tokenHash: tokens.hashToken(body.token),
      purpose: 'verify',
    });
    if (userId === null) return failure(400, 'invalid_token');
    await store.markEmailVerified(userId);
    return ok();
  }

  // Shared by resend and forgot: always 202 for a well-formed request, mail only when `eligible`.
  async function mailOnRequest(body, { ip }, { eligible, purpose, ttlSeconds, send }) {
    if (!isObject(body) || typeof body.email !== 'string') return invalidRequest();
    if (!limiters.mailPerIp.hit(ip)) return rateLimited();
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return accepted(); // generic: do not reveal what is wrong
    if (!limiters.mailPerEmail.hit(email) || !mailBudgetLeft()) return rateLimited();
    const user = await store.findUserByEmail(email);
    if (!user || !eligible(user)) return accepted();
    const token = await issueToken(user.id, purpose, ttlSeconds);
    return accepted({ after: deliver(() => send(email, token)) });
  }

  function resendVerification(body, context) {
    return mailOnRequest(body, context, {
      eligible: (user) => !user.emailVerified,
      purpose: 'verify',
      ttlSeconds: config.VERIFY_TOKEN_SECONDS,
      send: (email, token) => mailer.sendVerification(email, token),
    });
  }

  function forgotPassword(body, context) {
    return mailOnRequest(body, context, {
      eligible: (user) => user.emailVerified,
      purpose: 'reset',
      ttlSeconds: config.RESET_TOKEN_SECONDS,
      send: (email, token) => mailer.sendReset(email, token),
    });
  }

  async function login(body, { ip, sessionToken }) {
    if (
      !isObject(body) ||
      typeof body.email !== 'string' ||
      typeof body.password !== 'string' ||
      body.password.length > MAX_LOGIN_PASSWORD_LENGTH
    ) {
      return invalidRequest();
    }
    if (!limiters.loginPerIp.hit(ip)) return rateLimited();
    const email = normalizeEmail(body.email);
    if (!limiters.loginFailuresPerEmail.peek(email)) return rateLimited();
    maybePurge();

    const user = isValidEmail(email) ? await store.findUserByEmail(email) : null;
    let correct = false;
    if (user) correct = await passwords.verifyPassword(body.password, user.passwordHash);
    else await passwords.verifyDummy();
    if (!correct) {
      limiters.loginFailuresPerEmail.hit(email);
      return failure(401, 'invalid_credentials');
    }
    // Only someone who knows the password learns that the address is unverified.
    if (!user.emailVerified) return failure(403, 'email_not_verified');

    limiters.loginFailuresPerEmail.reset(email);
    // A new session at every login; a session presented with this request is dropped (no fixation).
    if (sessionToken) await store.deleteSession(tokens.hashToken(sessionToken));
    const { token, hash } = tokens.newToken();
    await store.createSession({ tokenHash: hash, userId: user.id });
    return reply(200, { user: { id: user.id, email: user.email } }, { setSession: token });
  }

  async function logout(_body, { sessionToken }) {
    if (sessionToken) await store.deleteSession(tokens.hashToken(sessionToken));
    return ok({ clearSession: true });
  }

  async function me(_body, { sessionToken }) {
    if (!sessionToken) return reply(200, { user: null });
    const hash = tokens.hashToken(sessionToken);
    const user = await store.getSession(hash);
    if (!user) return reply(200, { user: null }, { clearSession: true });
    try {
      await store.touchSession(hash);
    } catch (error) {
      // Refreshing the idle timer is best effort; the visitor is still logged in.
      console.error(`auth session refresh failed: ${errorCode(error)}`);
    }
    return reply(200, { user: { id: user.id, email: user.email } });
  }

  async function resetPassword(body, { ip }) {
    if (
      !isObject(body) ||
      typeof body.token !== 'string' ||
      body.token.length > MAX_TOKEN_LENGTH ||
      typeof body.password !== 'string'
    ) {
      return invalidRequest();
    }
    if (!limiters.loginPerIp.hit(ip)) return rateLimited();
    // Policy first, so a too-weak password does not burn the one-time token.
    const reason = passwords.checkPolicy(body.password);
    if (reason) return failure(422, 'invalid_password', { reason });
    const passwordHash = await passwords.hashPassword(body.password);
    const userId = await store.consumeEmailToken({
      tokenHash: tokens.hashToken(body.token),
      purpose: 'reset',
    });
    if (userId === null) return failure(400, 'invalid_token');
    await store.updatePassword(userId, passwordHash);
    // Receiving the reset mail proves control of the address.
    await store.markEmailVerified(userId);
    await store.deleteSessionsForUser(userId);
    await store.deleteEmailTokensForUser(userId);
    return ok();
  }

  return {
    register,
    verifyEmail,
    resendVerification,
    forgotPassword,
    login,
    logout,
    me,
    resetPassword,
  };
}

module.exports = { createAuthService, normalizeEmail, isValidEmail };
