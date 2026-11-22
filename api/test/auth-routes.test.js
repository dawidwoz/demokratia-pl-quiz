'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createHandler, MAX_BODY_BYTES } = require('../handler');
const { createAuthService } = require('../auth-service');
const { createAuthRoutes, isSameOriginRequest, clientIp } = require('../auth-routes');
const { createPasswords } = require('../passwords');
const { hashToken } = require('../tokens');
const config = require('../auth-config');
const { createFakeStore, createFakeMailer } = require('./support/fake-auth-store');

const FAST = { N: 1024, r: 8, p: 1, keylen: 32, saltBytes: 16, maxmem: 64 * 1024 * 1024 };
const PASSWORD = 'correct horse battery';

// Real HTTP server on port 0 with the real handler, auth routes and service, an in-memory store and a
// recording mailer. Requests default to what a browser sends from the same origin.
async function withAuth(fn, { env = { AUTH_INSECURE_COOKIES: '1' }, withAuthRoutes = true } = {}) {
  const store = createFakeStore();
  const mailer = createFakeMailer();
  const service = createAuthService({
    store,
    mailer,
    passwords: createPasswords({ params: FAST }),
  });
  const auth = withAuthRoutes ? createAuthRoutes({ service, env }) : undefined;
  const data = {
    async listQuizzes() {
      return [{ id: 1, title: 'Quiz', description: null, isSample: false, questionCount: 8 }];
    },
  };
  const server = http.createServer(createHandler({ data, ping: async () => {}, auth }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = {
    base,
    store,
    mailer,
    post(path, body, headers = {}) {
      return fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Sec-Fetch-Site': 'same-origin',
          ...headers,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
    },
    get(path, headers = {}) {
      return fetch(`${base}${path}`, { headers });
    },
  };
  try {
    await fn(api);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function captureConsole(fn) {
  const lines = [];
  const saved = { log: console.log, error: console.error, warn: console.warn };
  console.log = console.error = console.warn = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    Object.assign(console, saved);
  }
  return lines;
}

async function registerVerified(api, email = 'jan@example.com') {
  await api.post('/api/auth/register', { email, password: PASSWORD, acceptTerms: true });
  await settle();
  const { token } = api.mailer.sent.at(-1);
  const response = await api.post('/api/auth/verify-email', { token });
  assert.equal(response.status, 200);
}

function sessionCookie(response) {
  const header = response.headers.get('set-cookie');
  assert.ok(header, 'expected a Set-Cookie header');
  return header;
}

const cookieHeader = (setCookie) => setCookie.split(';')[0];

// ----------------------------------------------------------------- full flow

test('register -> verify -> login -> me -> logout works end to end over HTTP', async () => {
  await withAuth(async (api) => {
    const registered = await api.post('/api/auth/register', {
      email: 'jan@example.com',
      password: PASSWORD,
      acceptTerms: true,
    });
    assert.equal(registered.status, 202);
    assert.deepEqual(await registered.json(), { status: 'ok' });
    await settle();
    assert.equal(api.mailer.sent[0].type, 'verification');

    const early = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: PASSWORD,
    });
    assert.deepEqual([early.status, (await early.json()).code], [403, 'email_not_verified']);

    const verified = await api.post('/api/auth/verify-email', { token: api.mailer.sent[0].token });
    assert.equal(verified.status, 200);

    const loggedIn = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: PASSWORD,
    });
    assert.equal(loggedIn.status, 200);
    const body = await loggedIn.json();
    assert.equal(body.user.email, 'jan@example.com');
    const cookie = cookieHeader(sessionCookie(loggedIn));

    const me = await api.get('/api/auth/me', { Cookie: cookie });
    assert.deepEqual(await me.json(), { user: { id: body.user.id, email: 'jan@example.com' } });

    const loggedOut = await api.post('/api/auth/logout', {}, { Cookie: cookie });
    assert.equal(loggedOut.status, 200);
    assert.match(sessionCookie(loggedOut), /Max-Age=0/);

    const after = await api.get('/api/auth/me', { Cookie: cookie });
    assert.deepEqual(await after.json(), { user: null });
  });
});

test('forgot password -> reset works over HTTP and signs the old session out', async () => {
  await withAuth(async (api) => {
    await registerVerified(api);
    const loggedIn = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: PASSWORD,
    });
    const cookie = cookieHeader(sessionCookie(loggedIn));

    const forgot = await api.post('/api/auth/forgot-password', { email: 'jan@example.com' });
    assert.equal(forgot.status, 202);
    await settle();
    const mail = api.mailer.sent.at(-1);
    assert.equal(mail.type, 'reset');

    const reset = await api.post('/api/auth/reset-password', {
      token: mail.token,
      password: 'a brand new passphrase',
    });
    assert.equal(reset.status, 200);
    const stale = await api.get('/api/auth/me', { Cookie: cookie });
    assert.deepEqual(await stale.json(), { user: null });
    const relogin = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: 'a brand new passphrase',
    });
    assert.equal(relogin.status, 200);
  });
});

// ------------------------------------------------------------------- cookies

test('the session cookie is __Host-sid with Secure/HttpOnly/SameSite=Lax/Path=/ and no Domain', async () => {
  await withAuth(
    async (api) => {
      await registerVerified(api);
      const response = await api.post('/api/auth/login', {
        email: 'jan@example.com',
        password: PASSWORD,
      });
      const header = sessionCookie(response);
      assert.match(header, /^__Host-sid=[A-Za-z0-9_-]{43}; /);
      for (const attribute of [
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Secure',
        `Max-Age=${config.SESSION_ABSOLUTE_SECONDS}`,
      ]) {
        assert.ok(header.split('; ').includes(attribute), `missing ${attribute} in: ${header}`);
      }
      assert.ok(!/domain=/i.test(header));
    },
    { env: {} },
  );
});

test('AUTH_INSECURE_COOKIES=1 (dev only) uses the plain name and omits Secure', async () => {
  await withAuth(async (api) => {
    await registerVerified(api);
    const header = sessionCookie(
      await api.post('/api/auth/login', { email: 'jan@example.com', password: PASSWORD }),
    );
    assert.match(header, /^sid=[A-Za-z0-9_-]{43}; /);
    assert.ok(!header.includes('Secure'));
    assert.ok(header.includes('HttpOnly') && header.includes('SameSite=Lax'));
  });
});

test('me: no cookie, a malformed cookie and an unknown session are all {user:null}; a stale cookie is cleared', async () => {
  await withAuth(async (api) => {
    const anonymous = await api.get('/api/auth/me');
    assert.deepEqual(
      [anonymous.status, await anonymous.json(), anonymous.headers.get('set-cookie')],
      [200, { user: null }, null],
    );

    const malformed = await api.get('/api/auth/me', { Cookie: 'sid=not-a-valid-token' });
    assert.deepEqual(await malformed.json(), { user: null });
    assert.ok(!api.store.log.includes('getSession'), 'a malformed cookie never reaches the store');

    const unknown = await api.get('/api/auth/me', { Cookie: `other=1; sid=${'A'.repeat(43)}` });
    assert.deepEqual(await unknown.json(), { user: null });
    assert.match(sessionCookie(unknown), /^sid=; .*Max-Age=0/);
  });
});

test('only the named cookie is read when several cookies are sent', async () => {
  await withAuth(async (api) => {
    await registerVerified(api);
    const login = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: PASSWORD,
    });
    const value = cookieHeader(sessionCookie(login));
    const me = await api.get('/api/auth/me', { Cookie: `theme=dark; ${value}; lang=pl` });
    assert.equal((await me.json()).user.email, 'jan@example.com');
  });
});

// ---------------------------------------------------------------------- CSRF

test('POSTs that are not same-origin are refused with 403 before anything happens', async () => {
  await withAuth(async (api) => {
    const body = { email: 'jan@example.com', password: PASSWORD, acceptTerms: true };
    const cases = [
      { 'Sec-Fetch-Site': 'cross-site' },
      { 'Sec-Fetch-Site': 'same-site' },
      { 'Sec-Fetch-Site': 'none' },
      { 'Sec-Fetch-Site': '', Origin: 'https://evil.example' },
    ];
    for (const headers of cases) {
      const response = await api.post('/api/auth/register', body, headers);
      assert.deepEqual(
        [response.status, (await response.json()).code],
        [403, 'csrf_rejected'],
        JSON.stringify(headers),
      );
    }
    assert.equal(api.store.users.size, 0);
    assert.equal(api.mailer.sent.length, 0);
  });
});

test('without Sec-Fetch-Site the Origin must name this host; a missing or null Origin is refused', async () => {
  await withAuth(async (api) => {
    const host = api.base.replace('http://', '');
    const body = { email: 'jan@example.com', password: PASSWORD };
    const send = (origin) => {
      const headers = { 'Content-Type': 'application/json' };
      if (origin !== undefined) headers.Origin = origin;
      return fetch(`${api.base}/api/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    };
    assert.equal((await send(undefined)).status, 403);
    assert.equal((await send('null')).status, 403);
    assert.equal((await send('https://evil.example')).status, 403);
    assert.equal((await send(`http://${host}.evil.example`)).status, 403);
    assert.equal((await send(`http://${host}`)).status, 401); // same origin: passes the guard, wrong credentials
  });
});

test('logout is guarded too, and the CSRF guard does not apply to GET /api/auth/me', async () => {
  await withAuth(async (api) => {
    await registerVerified(api);
    const login = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: PASSWORD,
    });
    const cookie = cookieHeader(sessionCookie(login));
    const forged = await api.post(
      '/api/auth/logout',
      {},
      { Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' },
    );
    assert.equal(forged.status, 403);
    const stillIn = await api.get('/api/auth/me', {
      Cookie: cookie,
      'Sec-Fetch-Site': 'cross-site',
    });
    assert.equal((await stillIn.json()).user.email, 'jan@example.com');
  });
});

test('isSameOriginRequest() and clientIp() unit cases', () => {
  const req = (headers, remoteAddress) => ({ headers, socket: { remoteAddress } });
  assert.equal(isSameOriginRequest(req({ 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(
    isSameOriginRequest(req({ 'sec-fetch-site': 'cross-site', origin: 'http://h', host: 'h' })),
    false,
  );
  assert.equal(
    isSameOriginRequest(req({ origin: 'https://quiz.demokratia.pl', host: 'quiz.demokratia.pl' })),
    true,
  );
  assert.equal(
    isSameOriginRequest(
      req({ origin: 'https://quiz.demokratia.pl:8443', host: 'quiz.demokratia.pl' }),
    ),
    false,
  );
  assert.equal(isSameOriginRequest(req({})), false);
  assert.equal(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, '10.0.0.1')), '2.2.2.2');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' ' }, '10.0.0.1')), '10.0.0.1');
  assert.equal(clientIp(req({}, '10.0.0.1')), '10.0.0.1');
  assert.equal(clientIp({ headers: {} }), 'unknown');
});

// ------------------------------------------------------ headers, bodies, 404

test('every auth response is Cache-Control: no-store', async () => {
  await withAuth(async (api) => {
    const responses = [
      await api.get('/api/auth/me'),
      await api.get('/api/auth/nope'),
      await api.post('/api/auth/login', { email: 'a@b.co', password: 'x' }),
      await api.post(
        '/api/auth/login',
        { email: 'a@b.co', password: 'x' },
        { 'Sec-Fetch-Site': 'cross-site' },
      ),
      await api.post('/api/auth/login', '{not json'),
    ];
    for (const response of responses)
      assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});

test('unknown auth paths and wrong methods are 404', async () => {
  await withAuth(async (api) => {
    for (const response of [
      await api.get('/api/auth/nope'),
      await api.get('/api/auth/login'),
      await api.post('/api/auth/me', {}),
      await api.post('/api/auth/', {}),
    ]) {
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { status: 'not_found' });
    }
  });
});

test('invalid JSON, a wrong content type and an oversized body get the existing 400/413 codes', async () => {
  await withAuth(async (api) => {
    const badJson = await api.post('/api/auth/register', '{oops');
    assert.deepEqual([badJson.status, (await badJson.json()).code], [400, 'invalid_request']);

    const wrongType = await api.post('/api/auth/register', 'a=b', {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    assert.deepEqual([wrongType.status, (await wrongType.json()).code], [400, 'invalid_request']);

    const huge = await api.post(
      '/api/auth/register',
      JSON.stringify({ email: 'x'.repeat(MAX_BODY_BYTES + 1) }),
    );
    assert.deepEqual([huge.status, (await huge.json()).code], [413, 'payload_too_large']);
    assert.equal(api.store.users.size, 0);
  });
});

test('without auth wired in, /api/auth/* is a plain 404 and the quiz routes are untouched', async () => {
  await withAuth(
    async (api) => {
      assert.equal((await api.get('/api/auth/me')).status, 404);
      assert.equal((await api.get('/api/quizzes')).status, 200);
    },
    { withAuthRoutes: false },
  );
});

test('with auth wired in, the anonymous quiz routes work with no cookie and no session lookup', async () => {
  await withAuth(async (api) => {
    const response = await api.get('/api/quizzes');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual(api.store.log, []);
  });
});

// ------------------------------------------------------ anti-enumeration, errors

test('register answers identically for a new and an existing email (status, body, headers)', async () => {
  await withAuth(async (api) => {
    const attempt = (email) =>
      api.post('/api/auth/register', { email, password: PASSWORD, acceptTerms: true });
    const fresh = await attempt('nowy@example.com');
    await registerVerified(api, 'jan@example.com');
    const existing = await attempt('jan@example.com');
    assert.equal(existing.status, fresh.status);
    assert.deepEqual(await existing.json(), await fresh.json());
    assert.equal(existing.headers.get('content-length'), fresh.headers.get('content-length'));
  });
});

test('login answers identically for an unknown email and a wrong password', async () => {
  await withAuth(async (api) => {
    await registerVerified(api);
    const wrong = await api.post('/api/auth/login', {
      email: 'jan@example.com',
      password: 'wrong password!!',
    });
    const unknown = await api.post('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'wrong password!!',
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await unknown.json(), await wrong.json());
  });
});

test('per-IP limits use the last X-Forwarded-For entry, so another client is unaffected', async () => {
  await withAuth(async (api) => {
    let n = 0; // a different email each time, so the per-email lockout does not interfere
    const login = (ip) =>
      api.post(
        '/api/auth/login',
        { email: `u${n++}@b.co`, password: 'x'.repeat(12) },
        { 'X-Forwarded-For': `9.9.9.9, ${ip}` },
      );
    for (let i = 0; i < 30; i += 1) assert.equal((await login('198.51.100.1')).status, 401);
    assert.equal((await login('198.51.100.1')).status, 429);
    assert.equal((await login('198.51.100.2')).status, 401);
  });
});

test('a store failure is a 503 with a fixed code; only the short code is logged', async () => {
  await withAuth(async (api) => {
    api.store.failWith = Object.assign(
      new Error('connect ECONNREFUSED secret-host:3306 user=root'),
      { code: 'ECONNREFUSED' },
    );
    let response;
    const lines = await captureConsole(async () => {
      response = await api.post('/api/auth/login', {
        email: 'jan@example.com',
        password: PASSWORD,
      });
    });
    assert.deepEqual(
      [response.status, await response.json()],
      [503, { status: 'error', code: 'unavailable' }],
    );
    assert.deepEqual(lines, ['auth request failed: ECONNREFUSED']);
  });
});

test('a busy password hasher is a 503, not a crash', async () => {
  const store = createFakeStore();
  const passwords = createPasswords({ params: FAST });
  passwords.hashPassword = async () => {
    throw Object.assign(new Error('busy'), { code: 'HASH_BUSY' });
  };
  const service = createAuthService({ store, mailer: createFakeMailer(), passwords });
  const auth = createAuthRoutes({ service, env: { AUTH_INSECURE_COOKIES: '1' } });
  const server = http.createServer(createHandler({ data: {}, ping: async () => {}, auth }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    let response;
    const lines = await captureConsole(async () => {
      response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
        body: JSON.stringify({ email: 'jan@example.com', password: PASSWORD, acceptTerms: true }),
      });
    });
    assert.deepEqual([response.status, (await response.json()).code], [503, 'unavailable']);
    assert.deepEqual(lines, ['auth request failed: HASH_BUSY']);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a failing mail send does not change the response; only a short code is logged', async () => {
  await withAuth(async (api) => {
    api.mailer.failWith = Object.assign(new Error('550 jan@example.com mailbox unavailable'), {
      code: 'EENVELOPE',
    });
    let response;
    const lines = await captureConsole(async () => {
      response = await api.post('/api/auth/register', {
        email: 'jan@example.com',
        password: PASSWORD,
        acceptTerms: true,
      });
      await settle();
    });
    assert.equal(response.status, 202);
    assert.deepEqual(lines, ['auth mail failed: EENVELOPE']);
  });
});

test('across a whole flow nothing is logged, and no email, password or token ever appears in a log line', async () => {
  await withAuth(async (api) => {
    const secrets = [];
    const lines = await captureConsole(async () => {
      await api.post('/api/auth/register', {
        email: 'jan@example.com',
        password: PASSWORD,
        acceptTerms: true,
      });
      await settle();
      const { token } = api.mailer.sent[0];
      secrets.push(token);
      await api.post('/api/auth/verify-email', { token });
      await api.post('/api/auth/login', { email: 'jan@example.com', password: 'wrong password!!' });
      const login = await api.post('/api/auth/login', {
        email: 'jan@example.com',
        password: PASSWORD,
      });
      const cookie = cookieHeader(sessionCookie(login));
      secrets.push(cookie.split('=')[1]);
      await api.get('/api/auth/me', { Cookie: cookie });
      await api.post('/api/auth/forgot-password', { email: 'jan@example.com' });
      await settle();
      const reset = api.mailer.sent.at(-1).token;
      secrets.push(reset);
      await api.post('/api/auth/reset-password', {
        token: reset,
        password: 'a brand new passphrase',
      });
      await api.post('/api/auth/logout', {}, { Cookie: cookie });
    });
    assert.deepEqual(lines, []);
    for (const secret of [...secrets, 'jan@example.com', PASSWORD, 'a brand new passphrase']) {
      assert.ok(!lines.join('\n').includes(secret));
    }
    // and the database only ever received hashes of the secrets
    for (const secret of secrets)
      assert.ok(!api.store.sessions.has(secret) && !api.store.tokens.has(secret));
    assert.ok(
      [...api.store.tokens.keys(), ...api.store.sessions.keys()].every(
        (key) => key === hashToken(key) || key.length === 64,
      ),
    );
  });
});

test('a mail failure caused by missing settings logs the setting NAMES only, never their values', async () => {
  await withAuth(async (api) => {
    const { MailConfigError } = require('../mailer');
    api.mailer.failWith = new MailConfigError(['PUBLIC_BASE_URL', 'SMTP_HOST']);
    const lines = await captureConsole(async () => {
      const response = await api.post('/api/auth/register', {
        email: 'jan@example.com',
        password: PASSWORD,
        acceptTerms: true,
      });
      assert.equal(response.status, 202);
      await settle();
    });
    assert.deepEqual(lines, ['auth mail failed: MISSING_CONFIG: PUBLIC_BASE_URL, SMTP_HOST']);
  });
});

test('only upper-case setting names are ever logged from a MISSING_CONFIG error', async () => {
  await withAuth(async (api) => {
    api.mailer.failWith = Object.assign(new Error('x'), {
      code: 'MISSING_CONFIG',
      missing: ['smtp-secret-password', 'secret host.example', 'SMTP_USER'],
    });
    const lines = await captureConsole(async () => {
      await api.post('/api/auth/register', {
        email: 'jan@example.com',
        password: PASSWORD,
        acceptTerms: true,
      });
      await settle();
    });
    assert.deepEqual(lines, ['auth mail failed: MISSING_CONFIG: SMTP_USER']);
  });
});
