'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createMailer, MailConfigError } = require('../mailer');

const ENV = {
  SMTP_HOST: 'mail.example.net',
  SMTP_PORT: '587',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'smtp-secret-password',
  MAIL_FROM: 'support@quiz.demokratia.pl',
  PUBLIC_BASE_URL: 'https://quiz.demokratia.pl',
};

function fakeTransport() {
  const sent = [];
  return {
    sent,
    async sendMail(message) {
      sent.push(message);
    },
  };
}

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

test('sendVerification() sends a Polish mail whose link carries the token in the URL fragment', async () => {
  const transport = fakeTransport();
  await createMailer(ENV, { transport }).sendVerification('jan@example.com', 'tok_en-1');
  assert.equal(transport.sent.length, 1);
  const [message] = transport.sent;
  assert.equal(message.from, 'support@quiz.demokratia.pl');
  assert.equal(message.to, 'jan@example.com');
  assert.match(message.subject, /Potwierdź adres e-mail/);
  assert.ok(message.text.includes('https://quiz.demokratia.pl/weryfikacja#token=tok_en-1'));
  assert.ok(!message.text.includes('?token='), 'the token must not be a query parameter');
  assert.equal(message.html, undefined, 'text only');
});

test('sendReset() links to the reset page; sendAlreadyRegistered() links to login and forgot-password', async () => {
  const transport = fakeTransport();
  const mailer = createMailer(ENV, { transport });
  await mailer.sendReset('jan@example.com', 'abc');
  await mailer.sendAlreadyRegistered('jan@example.com');
  assert.ok(transport.sent[0].text.includes('https://quiz.demokratia.pl/reset-hasla#token=abc'));
  assert.match(transport.sent[0].subject, /nowe hasło/);
  assert.ok(transport.sent[1].text.includes('https://quiz.demokratia.pl/logowanie'));
  assert.ok(transport.sent[1].text.includes('https://quiz.demokratia.pl/zapomniane-haslo'));
  assert.ok(!transport.sent[1].text.includes('#token='));
});

test('links use only the origin of PUBLIC_BASE_URL (no stray path)', async () => {
  const transport = fakeTransport();
  await createMailer(
    { ...ENV, PUBLIC_BASE_URL: 'https://quiz.demokratia.pl/some/path/?x=1' },
    { transport },
  ).sendReset('a@b.pl', 't');
  assert.ok(transport.sent[0].text.includes('https://quiz.demokratia.pl/reset-hasla#token=t'));
});

test('PUBLIC_BASE_URL must be https; http://localhost only in the dev-only insecure-cookie mode', async () => {
  const transport = fakeTransport();
  const attempt = (env) => createMailer(env, { transport }).sendVerification('a@b.pl', 't');
  await assert.rejects(attempt({ ...ENV, PUBLIC_BASE_URL: 'http://quiz.demokratia.pl' }), {
    code: 'MISSING_CONFIG',
  });
  await assert.rejects(attempt({ ...ENV, PUBLIC_BASE_URL: 'http://localhost:4200' }), {
    code: 'MISSING_CONFIG',
  });
  await assert.rejects(
    attempt({ ...ENV, PUBLIC_BASE_URL: 'http://evil.example', AUTH_INSECURE_COOKIES: '1' }),
    { code: 'MISSING_CONFIG' },
  );
  await assert.rejects(attempt({ ...ENV, PUBLIC_BASE_URL: 'not a url' }), {
    code: 'MISSING_CONFIG',
  });
  await assert.rejects(attempt({ ...ENV, PUBLIC_BASE_URL: undefined }), { code: 'MISSING_CONFIG' });
  await attempt({ ...ENV, PUBLIC_BASE_URL: 'http://localhost:4200', AUTH_INSECURE_COOKIES: '1' });
  assert.ok(transport.sent[0].text.includes('http://localhost:4200/weryfikacja#token=t'));
});

test('a missing MAIL_FROM is reported by name', async () => {
  const transport = fakeTransport();
  await assert.rejects(
    createMailer({ ...ENV, MAIL_FROM: undefined }, { transport }).sendVerification('a@b.pl', 't'),
    (error) => error instanceof MailConfigError && error.missing.join() === 'MAIL_FROM',
  );
  assert.equal(transport.sent.length, 0);
});

test('SMTP transport: STARTTLS is mandatory on 587 and implicit TLS is used on 465', async () => {
  const created = [];
  const createTransport = (options) => {
    created.push(options);
    return fakeTransport();
  };
  await createMailer(ENV, { createTransport }).sendVerification('a@b.pl', 't');
  await createMailer({ ...ENV, SMTP_PORT: '465' }, { createTransport }).sendVerification(
    'a@b.pl',
    't',
  );
  assert.deepEqual(
    created.map((o) => [o.host, o.port, o.secure, o.requireTLS]),
    [
      ['mail.example.net', 587, false, true],
      ['mail.example.net', 465, true, false],
    ],
  );
  assert.deepEqual(created[0].auth, { user: 'smtp-user', pass: 'smtp-secret-password' });
  assert.ok(created[0].connectionTimeout <= 10000 && created[0].socketTimeout <= 15000);
});

test('the SMTP transport is created lazily, once, and reused', async () => {
  let creations = 0;
  const transport = fakeTransport();
  const mailer = createMailer(ENV, { createTransport: () => ((creations += 1), transport) });
  assert.equal(creations, 0);
  await mailer.sendVerification('a@b.pl', 't');
  await mailer.sendReset('a@b.pl', 't');
  assert.equal(creations, 1);
  assert.equal(transport.sent.length, 2);
});

test('missing or invalid SMTP settings are reported by variable name only, never by value', async () => {
  const mailer = createMailer({
    ...ENV,
    SMTP_HOST: '',
    SMTP_PASSWORD: undefined,
    SMTP_PORT: '99999',
  });
  await assert.rejects(mailer.sendVerification('a@b.pl', 't'), (error) => {
    assert.equal(error.code, 'MISSING_CONFIG');
    assert.deepEqual(error.missing.sort(), ['SMTP_HOST', 'SMTP_PASSWORD', 'SMTP_PORT']);
    assert.ok(!error.message.includes('smtp-secret-password'));
    assert.ok(!error.message.includes('mail.example.net'));
    return true;
  });
});

test('a transport failure propagates unchanged and nothing is logged', async () => {
  const failure = Object.assign(new Error('550 jan@example.com rejected'), { code: 'EENVELOPE' });
  const transport = {
    async sendMail() {
      throw failure;
    },
  };
  const lines = await captureConsole(async () => {
    await assert.rejects(
      createMailer(ENV, { transport }).sendVerification('jan@example.com', 'secret-token'),
      (e) => e === failure,
    );
  });
  assert.deepEqual(lines, []);
});

test('sending through the transport never logs the recipient or the token', async () => {
  const transport = fakeTransport();
  const lines = await captureConsole(async () => {
    const mailer = createMailer(ENV, { transport });
    await mailer.sendVerification('jan@example.com', 'secret-token');
    await mailer.sendReset('jan@example.com', 'secret-token');
    await mailer.sendAlreadyRegistered('jan@example.com');
  });
  assert.deepEqual(lines, []);
});

test('MAIL_TRANSPORT=console prints the message instead of sending (dev only)', async () => {
  const transport = fakeTransport();
  const lines = await captureConsole(async () => {
    await createMailer({ ...ENV, MAIL_TRANSPORT: 'console' }, { transport }).sendVerification(
      'jan@example.com',
      'tok',
    );
  });
  assert.equal(transport.sent.length, 0);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('weryfikacja#token=tok'));
});
