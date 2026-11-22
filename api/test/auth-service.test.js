'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createAuthService } = require('../auth-service');
const { createPasswords, HashBusyError } = require('../passwords');
const { hashToken } = require('../tokens');
const config = require('../auth-config');
const { createFakeStore, createFakeMailer } = require('./support/fake-auth-store');

const FAST = { N: 1024, r: 8, p: 1, keylen: 32, saltBytes: 16, maxmem: 64 * 1024 * 1024 };
const PASSWORD = 'correct horse battery';
const IP = '203.0.113.7';

function setup(overrides = {}) {
  const store = createFakeStore();
  const mailer = createFakeMailer();
  const passwords = createPasswords({ params: FAST });
  let time = 1_700_000_000_000;
  const clock = { now: () => time, advance: (ms) => (time += ms) };
  const service = createAuthService({ store, mailer, passwords, now: clock.now, ...overrides });
  const ctx = (extra = {}) => ({ ip: IP, sessionToken: null, ...extra });
  // Runs the deferred mail job a response carries, like the route does after sending the response.
  const flush = async (result) => {
    if (result.after) await result.after();
    return result;
  };
  return { store, mailer, passwords, service, clock, ctx, flush };
}

async function registerAndVerify(env, email = 'jan@example.com', password = PASSWORD) {
  const result = await env.service.register({ email, password, acceptTerms: true }, env.ctx());
  await env.flush(result);
  const { token } = env.mailer.sent.at(-1);
  const verified = await env.service.verifyEmail({ token }, env.ctx());
  assert.equal(verified.status, 200);
  return env.store.userByEmail(email);
}

async function login(env, email = 'jan@example.com', password = PASSWORD, extra = {}) {
  return env.service.login({ email, password }, env.ctx(extra));
}

// ---------------------------------------------------------------- register

test('register: a new email creates an unverified account and mails a verification link', async () => {
  const env = setup();
  const result = await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { status: 'ok' });
  const user = env.store.userByEmail('jan@example.com');
  assert.equal(user.emailVerified, false);
  assert.equal(user.termsVersion, config.TERMS_VERSION);
  assert.ok(user.passwordHash.startsWith('scrypt$'));
  assert.ok(!user.passwordHash.includes(PASSWORD));
  assert.equal(env.mailer.sent.length, 1);
  assert.equal(env.mailer.sent[0].type, 'verification');
  assert.equal(env.mailer.sent[0].to, 'jan@example.com');
  // Only the hash of the token is stored.
  assert.ok(env.store.tokens.has(hashToken(env.mailer.sent[0].token)));
  assert.ok(!env.store.tokens.has(env.mailer.sent[0].token));
});

test('register: the email is trimmed and lower-cased', async () => {
  const env = setup();
  await env.flush(
    await env.service.register(
      { email: '  Jan@Example.COM ', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  assert.notEqual(env.store.userByEmail('jan@example.com'), null);
  assert.equal(env.mailer.sent[0].to, 'jan@example.com');
});

test('register: validation errors', async () => {
  const env = setup();
  const attempt = (body) => env.service.register(body, env.ctx());
  const good = { email: 'jan@example.com', password: PASSWORD, acceptTerms: true };

  for (const body of [
    null,
    'x',
    [],
    {},
    { ...good, email: 5 },
    { ...good, password: 5 },
    { ...good, acceptTerms: 'true' },
  ]) {
    const result = await attempt(body);
    assert.deepEqual([result.status, result.body.code], [400, 'invalid_request']);
  }
  for (const email of [
    '',
    'no-at-sign',
    'a@b',
    'with space@example.com',
    `${'a'.repeat(250)}@example.com`,
  ]) {
    const result = await attempt({ ...good, email });
    assert.deepEqual([result.status, result.body.code], [422, 'invalid_email'], email);
  }
  const noTerms = await attempt({ ...good, acceptTerms: false });
  assert.deepEqual([noTerms.status, noTerms.body.code], [422, 'terms_required']);

  const short = await attempt({ ...good, password: 'short' });
  assert.deepEqual(short.body, { status: 'error', code: 'invalid_password', reason: 'too_short' });
  const common = await attempt({ ...good, password: '1234567890' });
  assert.equal(common.body.reason, 'too_common');
  const long = await attempt({ ...good, password: 'q'.repeat(129) });
  assert.equal(long.body.reason, 'too_long');
  assert.equal(env.store.users.size, 0);
  assert.equal(env.mailer.sent.length, 0);
});

test('register: a verified existing email gets an "already registered" mail and the same 202 body', async () => {
  const env = setup();
  await registerAndVerify(env);
  env.mailer.sent.length = 0;
  const fresh = await env.service.register(
    { email: 'nowy@example.com', password: PASSWORD, acceptTerms: true },
    env.ctx(),
  );
  const existing = await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: 'a different passphrase', acceptTerms: true },
      env.ctx(),
    ),
  );
  assert.deepEqual([existing.status, existing.body], [fresh.status, fresh.body]); // indistinguishable
  assert.deepEqual(env.mailer.sent, [{ type: 'already-registered', to: 'jan@example.com' }]);
  assert.equal(env.store.users.size, 2);
});

test('register: an unverified existing email gets a fresh link and keeps its original password', async () => {
  const env = setup();
  await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  const originalHash = env.store.userByEmail('jan@example.com').passwordHash;
  const firstToken = env.mailer.sent[0].token;
  await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: 'attacker chosen passphrase', acceptTerms: true },
      env.ctx(),
    ),
  );
  assert.equal(env.mailer.sent.length, 2);
  assert.equal(env.mailer.sent[1].type, 'verification');
  assert.notEqual(env.mailer.sent[1].token, firstToken);
  assert.equal(env.store.userByEmail('jan@example.com').passwordHash, originalHash);
  assert.ok(!env.store.tokens.has(hashToken(firstToken)), 'the old link is replaced');
});

test('register: losing a race to a parallel registration of the same email still answers 202', async () => {
  const env = setup();
  const realFind = env.store.findUserByEmail.bind(env.store);
  let first = true;
  env.store.findUserByEmail = async (email) => {
    if (first) {
      first = false;
      // A parallel request created the account after our first look.
      await env.store.createUser({ email, passwordHash: 'x', termsVersion: '1' });
      return null;
    }
    return realFind(email);
  };
  const result = await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  assert.equal(result.status, 202);
  assert.equal(env.store.users.size, 1);
});

test('register: rate limits per email, per IP and on the global mail budget answer 429', async () => {
  const env = setup();
  const attempt = (email, ip = IP) =>
    env.service.register({ email, password: PASSWORD, acceptTerms: true }, env.ctx({ ip }));

  const codes = [];
  for (let i = 0; i < 4; i += 1) codes.push((await attempt('jan@example.com')).status);
  assert.deepEqual(codes, [202, 202, 202, 429]); // 3 per email per hour

  const ipEnv = setup();
  const ipCodes = [];
  for (let i = 0; i < 11; i += 1) {
    ipCodes.push(
      (
        await ipEnv.service.register(
          { email: `user${i}@example.com`, password: PASSWORD, acceptTerms: true },
          ipEnv.ctx(),
        )
      ).status,
    );
  }
  assert.equal(ipCodes.filter((code) => code === 202).length, 10); // 10 per IP per hour
  assert.equal(ipCodes[10], 429);

  const budget = setup({
    config: { ...config, LIMITS: { ...config.LIMITS, mailGlobal: { max: 2, windowMs: 3600000 } } },
  });
  const sent = [];
  for (let i = 0; i < 3; i += 1) {
    const result = await budget.service.register(
      { email: `b${i}@example.com`, password: PASSWORD, acceptTerms: true },
      budget.ctx({ ip: `198.51.100.${i}` }),
    );
    await budget.flush(result);
    sent.push(result.status);
  }
  assert.deepEqual(sent, [202, 202, 429]); // global outbound budget of 2 mails per hour
});

test('register: a limit window passing restores the budget', async () => {
  const env = setup();
  for (let i = 0; i < 3; i += 1) {
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    );
  }
  const blocked = await env.service.register(
    { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
    env.ctx(),
  );
  assert.equal(blocked.status, 429);
  env.clock.advance(60 * 60 * 1000);
  const again = await env.service.register(
    { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
    env.ctx(),
  );
  assert.equal(again.status, 202);
});

test('register: a busy hasher surfaces as an error for the route to map to 503', async () => {
  const env = setup();
  env.passwords.hashPassword = async () => {
    throw new HashBusyError();
  };
  await assert.rejects(
    env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
    { code: 'HASH_BUSY' },
  );
  assert.equal(env.store.users.size, 0);
});

test('housekeeping runs at most once an hour and does not block or fail the request', async () => {
  const env = setup();
  const register = (n) =>
    env.service.register(
      { email: `h${n}@example.com`, password: PASSWORD, acceptTerms: true },
      env.ctx({ ip: `10.0.0.${n}` }),
    );
  await register(1);
  await register(2);
  assert.equal(env.store.log.filter((name) => name === 'purgeExpired').length, 1);
  env.clock.advance(60 * 60 * 1000);
  await register(3);
  assert.equal(env.store.log.filter((name) => name === 'purgeExpired').length, 2);

  const failing = setup();
  failing.store.purgeExpired = async () => {
    throw Object.assign(new Error('secret-host'), { code: 'ECONNREFUSED' });
  };
  const result = await failing.service.register(
    { email: 'x@example.com', password: PASSWORD, acceptTerms: true },
    failing.ctx(),
  );
  assert.equal(result.status, 202);
});

// ------------------------------------------------------------ verify email

test('verifyEmail: a valid link verifies the account once', async () => {
  const env = setup();
  await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  const { token } = env.mailer.sent[0];
  const first = await env.service.verifyEmail({ token }, env.ctx());
  assert.deepEqual([first.status, first.body], [200, { status: 'ok' }]);
  assert.equal(env.store.userByEmail('jan@example.com').emailVerified, true);
  const second = await env.service.verifyEmail({ token }, env.ctx());
  assert.deepEqual([second.status, second.body.code], [400, 'invalid_token']);
});

test('verifyEmail: unknown, expired, wrong-purpose and malformed tokens are refused', async () => {
  const env = setup();
  await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  const { token } = env.mailer.sent[0];
  assert.equal(
    (await env.service.verifyEmail({ token: 'nope' }, env.ctx())).body.code,
    'invalid_token',
  );
  env.store.expireToken(hashToken(token));
  assert.equal((await env.service.verifyEmail({ token }, env.ctx())).body.code, 'invalid_token');
  assert.equal(env.store.userByEmail('jan@example.com').emailVerified, false);

  const other = setup();
  const user = await registerAndVerify(other);
  await other.flush(await other.service.forgotPassword({ email: user.email }, other.ctx()));
  const resetToken = other.mailer.sent.at(-1).token;
  assert.equal(
    (await other.service.verifyEmail({ token: resetToken }, other.ctx())).body.code,
    'invalid_token',
  );

  for (const body of [null, {}, { token: 5 }, { token: 'x'.repeat(201) }]) {
    assert.equal((await env.service.verifyEmail(body, env.ctx())).body.code, 'invalid_request');
  }
});

// --------------------------------------------- resend and forgot password

test('resendVerification: mails only unverified accounts, answers 202 for everyone else', async () => {
  const env = setup();
  await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  env.mailer.sent.length = 0;
  const bodies = [];
  for (const email of ['jan@example.com', 'nobody@example.com', 'not-an-email']) {
    const result = await env.flush(await env.service.resendVerification({ email }, env.ctx()));
    bodies.push([result.status, result.body]);
  }
  assert.deepEqual(bodies, [
    [202, { status: 'ok' }],
    [202, { status: 'ok' }],
    [202, { status: 'ok' }],
  ]);
  assert.deepEqual(
    env.mailer.sent.map((m) => [m.type, m.to]),
    [['verification', 'jan@example.com']],
  );

  await env.service.verifyEmail({ token: env.mailer.sent[0].token }, env.ctx());
  env.mailer.sent.length = 0;
  await env.flush(await env.service.resendVerification({ email: 'jan@example.com' }, env.ctx()));
  assert.equal(env.mailer.sent.length, 0, 'a verified account gets no verification mail');
  assert.equal((await env.service.resendVerification({}, env.ctx())).status, 400);
});

test('forgotPassword: mails only verified accounts and answers the same 202 for everyone', async () => {
  const env = setup();
  await registerAndVerify(env, 'jan@example.com');
  await env.flush(
    await env.service.register(
      { email: 'pending@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  env.mailer.sent.length = 0;
  const results = [];
  for (const email of ['jan@example.com', 'pending@example.com', 'nobody@example.com']) {
    const result = await env.flush(await env.service.forgotPassword({ email }, env.ctx()));
    results.push([result.status, result.body]);
  }
  assert.deepEqual(results, Array(3).fill([202, { status: 'ok' }]));
  assert.deepEqual(
    env.mailer.sent.map((m) => [m.type, m.to]),
    [['reset', 'jan@example.com']],
  );
});

test('resend/forgot are rate limited per email, per IP and by the global mail budget', async () => {
  const env = setup();
  const statuses = [];
  for (let i = 0; i < 4; i += 1) {
    statuses.push(
      (await env.service.forgotPassword({ email: 'jan@example.com' }, env.ctx())).status,
    );
  }
  assert.deepEqual(statuses, [202, 202, 202, 429]);
  assert.equal(
    (await env.service.resendVerification({ email: 'jan@example.com' }, env.ctx())).status,
    429,
  );
});

// ------------------------------------------------------------------- login

test('login: success returns the user and a new session whose only stored form is a hash', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  const result = await login(env);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { user: { id: user.id, email: 'jan@example.com' } });
  assert.match(result.setSession, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(env.store.sessions.has(hashToken(result.setSession)));
  assert.ok(!env.store.sessions.has(result.setSession));
  assert.ok(!JSON.stringify(result.body).includes('passwordHash'));
});

test('login: unknown email and wrong password give the same 401, and unknown emails burn a dummy hash', async () => {
  const env = setup();
  await registerAndVerify(env);
  let dummyRuns = 0;
  const realDummy = env.passwords.verifyDummy;
  env.passwords.verifyDummy = async () => {
    dummyRuns += 1;
    return realDummy();
  };
  const wrong = await login(env, 'jan@example.com', 'wrong password!!');
  const unknown = await login(env, 'nobody@example.com', PASSWORD);
  const malformed = await login(env, 'not-an-email', PASSWORD);
  assert.deepEqual(
    [wrong.status, wrong.body],
    [401, { status: 'error', code: 'invalid_credentials' }],
  );
  assert.deepEqual([unknown.status, unknown.body], [wrong.status, wrong.body]);
  assert.deepEqual([malformed.status, malformed.body], [wrong.status, wrong.body]);
  assert.equal(dummyRuns, 2);
});

test('login: the right password on an unverified account is 403, a wrong one stays 401', async () => {
  const env = setup();
  await env.flush(
    await env.service.register(
      { email: 'jan@example.com', password: PASSWORD, acceptTerms: true },
      env.ctx(),
    ),
  );
  assert.deepEqual((await login(env)).body, { status: 'error', code: 'email_not_verified' });
  assert.equal((await login(env, 'jan@example.com', 'wrong password!!')).status, 401);
  assert.equal(env.store.sessions.size, 0);
});

test('login: five failures lock the email for the window, even for the right password', async () => {
  const env = setup();
  await registerAndVerify(env);
  for (let i = 0; i < 5; i += 1)
    assert.equal((await login(env, 'jan@example.com', 'wrong password!!')).status, 401);
  const locked = await login(env);
  assert.deepEqual([locked.status, locked.body.code], [429, 'rate_limited']);
  env.clock.advance(15 * 60 * 1000);
  assert.equal((await login(env)).status, 200);
});

test('login: a success resets the failure counter', async () => {
  const env = setup();
  await registerAndVerify(env);
  for (let i = 0; i < 4; i += 1) await login(env, 'jan@example.com', 'wrong password!!');
  assert.equal((await login(env)).status, 200);
  for (let i = 0; i < 4; i += 1)
    assert.equal((await login(env, 'jan@example.com', 'wrong password!!')).status, 401);
  assert.equal((await login(env)).status, 200);
});

test('login: per-IP attempts are limited', async () => {
  const env = setup();
  const statuses = [];
  for (let i = 0; i < 31; i += 1)
    statuses.push((await login(env, `u${i}@example.com`, 'x'.repeat(12))).status);
  assert.equal(statuses.filter((status) => status === 401).length, 30);
  assert.equal(statuses[30], 429);
  assert.equal(
    (
      await env.service.login(
        { email: 'u@example.com', password: 'x' },
        env.ctx({ ip: '198.51.100.1' }),
      )
    ).status,
    401,
  );
});

test('login: a session presented with the request is replaced (no session fixation)', async () => {
  const env = setup();
  await registerAndVerify(env);
  const first = await login(env);
  const second = await login(env, 'jan@example.com', PASSWORD, { sessionToken: first.setSession });
  assert.notEqual(second.setSession, first.setSession);
  assert.ok(!env.store.sessions.has(hashToken(first.setSession)));
  assert.ok(env.store.sessions.has(hashToken(second.setSession)));
});

test('login: malformed bodies and oversized passwords are 400', async () => {
  const env = setup();
  for (const body of [
    null,
    {},
    { email: 'a@b.co' },
    { email: 1, password: 'x' },
    { email: 'a@b.co', password: 'x'.repeat(1025) },
  ]) {
    assert.equal((await env.service.login(body, env.ctx())).status, 400);
  }
});

// ----------------------------------------------------------- logout and me

test('me: no session, a valid session, an expired session and an unknown cookie', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  assert.deepEqual(await env.service.me(null, env.ctx()), { status: 200, body: { user: null } });

  const { setSession } = await login(env);
  const valid = await env.service.me(null, env.ctx({ sessionToken: setSession }));
  assert.deepEqual(valid, {
    status: 200,
    body: { user: { id: user.id, email: 'jan@example.com' } },
  });
  assert.ok(env.store.log.includes('touchSession'));

  env.store.expireSession(hashToken(setSession));
  const expired = await env.service.me(null, env.ctx({ sessionToken: setSession }));
  assert.deepEqual([expired.body, expired.clearSession], [{ user: null }, true]);

  const unknown = await env.service.me(null, env.ctx({ sessionToken: 'A'.repeat(43) }));
  assert.deepEqual([unknown.body, unknown.clearSession], [{ user: null }, true]);
});

test('me: a failing idle-timer refresh does not log the visitor out', async () => {
  const env = setup();
  await registerAndVerify(env);
  const { setSession } = await login(env);
  env.store.touchSession = async () => {
    throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' });
  };
  const result = await env.service.me(null, env.ctx({ sessionToken: setSession }));
  assert.equal(result.body.user.email, 'jan@example.com');
});

test('logout: deletes the session and asks for the cookie to be cleared; works without a session', async () => {
  const env = setup();
  await registerAndVerify(env);
  const { setSession } = await login(env);
  const result = await env.service.logout(null, env.ctx({ sessionToken: setSession }));
  assert.deepEqual(
    [result.status, result.body, result.clearSession],
    [200, { status: 'ok' }, true],
  );
  assert.equal(env.store.sessions.size, 0);
  assert.equal((await env.service.logout(null, env.ctx())).status, 200);
});

// ---------------------------------------------------------- reset password

test('resetPassword: sets the new password, signs everyone out and consumes all tokens', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  const session = await login(env);
  await env.flush(await env.service.forgotPassword({ email: user.email }, env.ctx()));
  const { token } = env.mailer.sent.at(-1);

  const result = await env.service.resetPassword(
    { token, password: 'a brand new passphrase' },
    env.ctx(),
  );
  assert.deepEqual([result.status, result.body], [200, { status: 'ok' }]);
  assert.equal(env.store.sessions.size, 0, 'the earlier session is gone');
  assert.ok(!env.store.sessions.has(hashToken(session.setSession)));
  assert.equal(env.store.tokens.size, 0);
  assert.equal(
    await env.passwords.verifyPassword(
      'a brand new passphrase',
      env.store.userByEmail(user.email).passwordHash,
    ),
    true,
  );
  assert.equal((await login(env)).status, 401, 'the old password no longer works');
  assert.equal((await login(env, user.email, 'a brand new passphrase')).status, 200);
});

test('resetPassword: the token is single use, and unknown or expired tokens are refused', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  await env.flush(await env.service.forgotPassword({ email: user.email }, env.ctx()));
  const { token } = env.mailer.sent.at(-1);
  assert.equal(
    (await env.service.resetPassword({ token, password: 'a brand new passphrase' }, env.ctx()))
      .status,
    200,
  );
  const again = await env.service.resetPassword(
    { token, password: 'yet another passphrase' },
    env.ctx(),
  );
  assert.deepEqual([again.status, again.body.code], [400, 'invalid_token']);
  assert.equal(
    (
      await env.service.resetPassword(
        { token: 'nope', password: 'a brand new passphrase' },
        env.ctx(),
      )
    ).body.code,
    'invalid_token',
  );
});

test('resetPassword: a too-weak password is rejected without burning the token', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  await env.flush(await env.service.forgotPassword({ email: user.email }, env.ctx()));
  const { token } = env.mailer.sent.at(-1);
  const weak = await env.service.resetPassword({ token, password: '1234567890' }, env.ctx());
  assert.deepEqual(
    [weak.status, weak.body.code, weak.body.reason],
    [422, 'invalid_password', 'too_common'],
  );
  assert.equal(
    (await env.service.resetPassword({ token, password: 'a brand new passphrase' }, env.ctx()))
      .status,
    200,
  );
});

test('resetPassword: an expired token is refused and malformed bodies are 400', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  await env.flush(await env.service.forgotPassword({ email: user.email }, env.ctx()));
  const { token } = env.mailer.sent.at(-1);
  env.store.expireToken(hashToken(token));
  assert.equal(
    (await env.service.resetPassword({ token, password: 'a brand new passphrase' }, env.ctx())).body
      .code,
    'invalid_token',
  );
  for (const body of [
    null,
    {},
    { token: 'x' },
    { password: 'x' },
    { token: 'x'.repeat(201), password: 'long enough password' },
  ]) {
    assert.equal((await env.service.resetPassword(body, env.ctx())).status, 400);
  }
});

test('resetPassword: completing a reset marks a never-verified address as verified', async () => {
  const env = setup();
  const user = await registerAndVerify(env);
  env.store.users.get(user.id).emailVerified = true;
  await env.flush(await env.service.forgotPassword({ email: user.email }, env.ctx()));
  env.store.users.get(user.id).emailVerified = false; // pretend it was not verified
  const { token } = env.mailer.sent.at(-1);
  await env.service.resetPassword({ token, password: 'a brand new passphrase' }, env.ctx());
  assert.equal(env.store.users.get(user.id).emailVerified, true);
});
