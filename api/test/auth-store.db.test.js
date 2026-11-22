'use strict';

// Real-SQL checks for auth-store.js against a SCRATCH MariaDB/MySQL database. Opt-in: skipped unless
// AUTH_DB_TEST=1, and it refuses to run when DB_NAME does not look like a scratch database (it applies
// migrations and deletes every user). `npm test` and CI stay database-free.
//
// PowerShell:
//   cd api
//   $env:DB_HOST="localhost"; $env:DB_USER="<user>"; $env:DB_PASSWORD="<password>"
//   $env:DB_NAME="quiz_scratch"; $env:AUTH_DB_TEST="1"
//   node --test test/auth-store.db.test.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const ENABLED = process.env.AUTH_DB_TEST === '1';
const SCRATCH_NAME = /test|scratch/i;
const skip = ENABLED ? false : 'set AUTH_DB_TEST=1 and point DB_* at a scratch database to run';

const db = require('../db');
const store = require('../auth-store');
const config = require('../auth-config');
const { migrate } = require('../migrate');

const HASH = 'a'.repeat(64);
const HASH_2 = 'b'.repeat(64);

async function newUser(email = 'ktos@example.com', { verified = true } = {}) {
  const id = await store.createUser({
    email,
    passwordHash: 'scrypt$10$8$1$YQ==$YQ==',
    termsVersion: '1',
  });
  if (verified) await store.markEmailVerified(id);
  return id;
}

async function age(table, column, seconds, where, params) {
  await db.write(
    `UPDATE ${table} SET ${column} = DATE_SUB(NOW(), INTERVAL ? SECOND) WHERE ${where}`,
    [seconds, ...params],
  );
}

before(async () => {
  if (!ENABLED) return;
  const name = process.env.DB_NAME || '';
  if (!SCRATCH_NAME.test(name)) {
    throw new Error(
      'refusing to run: DB_NAME must contain "test" or "scratch" (this test deletes all users)',
    );
  }
  await migrate({ log: () => {}, warn: () => {} });
});

after(async () => {
  if (!ENABLED) return;
  await db.write('DELETE FROM users');
  await db.closePool();
});

async function clean() {
  await db.write('DELETE FROM users'); // sessions and tokens go with them (ON DELETE CASCADE)
}

test(
  'unique email: a duplicate, including a different letter case, is rejected',
  { skip },
  async () => {
    await clean();
    await newUser('Jan@Example.com');
    await assert.rejects(newUser('jan@example.com'), (e) => e instanceof store.DuplicateEmailError);
    await assert.rejects(newUser('JAN@EXAMPLE.COM'), (e) => e instanceof store.DuplicateEmailError);
  },
);

test('findUserByEmail() returns the account and its verified flag', { skip }, async () => {
  await clean();
  await newUser('v@example.com');
  await newUser('u@example.com', { verified: false });
  assert.equal((await store.findUserByEmail('v@example.com')).emailVerified, true);
  assert.equal((await store.findUserByEmail('u@example.com')).emailVerified, false);
  assert.equal(await store.findUserByEmail('nobody@example.com'), null);
});

test('deleting a user cascades to sessions and email tokens', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.createSession({ tokenHash: HASH, userId: id });
  await store.replaceEmailToken({
    userId: id,
    purpose: 'verify',
    tokenHash: HASH_2,
    ttlSeconds: 60,
  });
  await db.write('DELETE FROM users WHERE id = ?', [id]);
  const [sessions] = await db.query('SELECT COUNT(*) AS n FROM sessions');
  const [tokens] = await db.query('SELECT COUNT(*) AS n FROM email_tokens');
  assert.equal(Number(sessions[0].n), 0);
  assert.equal(Number(tokens[0].n), 0);
});

test('a fresh session resolves to its user; an unknown hash does not', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.createSession({ tokenHash: HASH, userId: id });
  assert.deepEqual(await store.getSession(HASH), { id, email: 'ktos@example.com' });
  assert.equal(await store.getSession(HASH_2), null);
});

test('a session past its absolute limit does not resolve', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.createSession({ tokenHash: HASH, userId: id });
  await db.write('UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND)');
  assert.equal(await store.getSession(HASH), null);
});

test('a session idle for longer than the idle limit does not resolve', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.createSession({ tokenHash: HASH, userId: id });
  await age('sessions', 'last_seen_at', config.SESSION_IDLE_SECONDS + 5, 'token_hash = ?', [HASH]);
  assert.equal(await store.getSession(HASH), null);
});

test(
  'touchSession() refreshes only an old last_seen_at and keeps the session alive',
  { skip },
  async () => {
    await clean();
    const id = await newUser();
    await store.createSession({ tokenHash: HASH, userId: id });
    await age('sessions', 'last_seen_at', config.SESSION_IDLE_SECONDS - 5, 'token_hash = ?', [
      HASH,
    ]);
    await store.touchSession(HASH);
    const [rows] = await db.query(
      'SELECT TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS idle FROM sessions WHERE token_hash = ?',
      [HASH],
    );
    assert.ok(Number(rows[0].idle) < 5, 'last_seen_at should be refreshed');
    // A fresh session is not rewritten: within the touch interval nothing changes.
    const [prior] = await db.query('SELECT last_seen_at FROM sessions WHERE token_hash = ?', [
      HASH,
    ]);
    await store.touchSession(HASH);
    const [later] = await db.query('SELECT last_seen_at FROM sessions WHERE token_hash = ?', [
      HASH,
    ]);
    assert.deepEqual(later, prior);
  },
);

test('a session of an unverified account does not resolve', { skip }, async () => {
  await clean();
  const id = await newUser('u@example.com', { verified: false });
  await store.createSession({ tokenHash: HASH, userId: id });
  assert.equal(await store.getSession(HASH), null);
});

test('deleteSession() and deleteSessionsForUser() remove sessions', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.createSession({ tokenHash: HASH, userId: id });
  await store.createSession({ tokenHash: HASH_2, userId: id });
  await store.deleteSession(HASH);
  assert.equal(await store.getSession(HASH), null);
  assert.notEqual(await store.getSession(HASH_2), null);
  await store.deleteSessionsForUser(id);
  assert.equal(await store.getSession(HASH_2), null);
});

test('an email token is single use', { skip }, async () => {
  await clean();
  const id = await newUser('u@example.com', { verified: false });
  await store.replaceEmailToken({ userId: id, purpose: 'verify', tokenHash: HASH, ttlSeconds: 60 });
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'verify' }), id);
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'verify' }), null);
});

test('an email token only works for its own purpose', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.replaceEmailToken({ userId: id, purpose: 'reset', tokenHash: HASH, ttlSeconds: 60 });
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'verify' }), null);
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'reset' }), id);
});

test('an expired email token is not accepted', { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.replaceEmailToken({ userId: id, purpose: 'reset', tokenHash: HASH, ttlSeconds: 60 });
  await age('email_tokens', 'expires_at', 1, 'token_hash = ?', [HASH]);
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'reset' }), null);
});

test(
  'issuing a new token replaces the previous one for the same user and purpose',
  { skip },
  async () => {
    await clean();
    const id = await newUser();
    await store.replaceEmailToken({
      userId: id,
      purpose: 'reset',
      tokenHash: HASH,
      ttlSeconds: 60,
    });
    await store.replaceEmailToken({
      userId: id,
      purpose: 'reset',
      tokenHash: HASH_2,
      ttlSeconds: 60,
    });
    assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'reset' }), null);
    assert.equal(await store.consumeEmailToken({ tokenHash: HASH_2, purpose: 'reset' }), id);
  },
);

test("deleteEmailTokensForUser() removes all of a user's tokens", { skip }, async () => {
  await clean();
  const id = await newUser();
  await store.replaceEmailToken({ userId: id, purpose: 'reset', tokenHash: HASH, ttlSeconds: 60 });
  await store.replaceEmailToken({
    userId: id,
    purpose: 'verify',
    tokenHash: HASH_2,
    ttlSeconds: 60,
  });
  await store.deleteEmailTokensForUser(id);
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH, purpose: 'reset' }), null);
  assert.equal(await store.consumeEmailToken({ tokenHash: HASH_2, purpose: 'verify' }), null);
});

test('updatePassword() and markEmailVerified() change the stored account', { skip }, async () => {
  await clean();
  const id = await newUser('u@example.com', { verified: false });
  await store.markEmailVerified(id);
  await store.updatePassword(id, 'scrypt$10$8$1$Yg==$Yg==');
  const user = await store.findUserByEmail('u@example.com');
  assert.equal(user.emailVerified, true);
  assert.equal(user.passwordHash, 'scrypt$10$8$1$Yg==$Yg==');
});

test(
  'purgeExpired() removes expired sessions and tokens and stale unverified accounts only',
  { skip },
  async () => {
    await clean();
    const keep = await newUser('keep@example.com');
    const staleUnverified = await newUser('stale@example.com', { verified: false });
    const freshUnverified = await newUser('fresh@example.com', { verified: false });
    await age('users', 'created_at', (config.UNVERIFIED_PURGE_DAYS + 1) * 86400, 'id = ?', [
      staleUnverified,
    ]);

    await store.createSession({ tokenHash: HASH, userId: keep });
    await store.createSession({ tokenHash: HASH_2, userId: keep });
    await db.write(
      'UPDATE sessions SET expires_at = DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE token_hash = ?',
      [HASH],
    );
    await store.replaceEmailToken({
      userId: freshUnverified,
      purpose: 'verify',
      tokenHash: 'c'.repeat(64),
      ttlSeconds: 60,
    });
    await store.replaceEmailToken({
      userId: keep,
      purpose: 'reset',
      tokenHash: 'd'.repeat(64),
      ttlSeconds: 60,
    });
    await age('email_tokens', 'expires_at', 1, 'token_hash = ?', ['d'.repeat(64)]);

    const removed = await store.purgeExpired();
    assert.equal(removed.sessions, 1);
    assert.equal(removed.tokens, 1);
    assert.equal(removed.users, 1);
    assert.notEqual(await store.findUserByEmail('keep@example.com'), null);
    assert.notEqual(await store.findUserByEmail('fresh@example.com'), null);
    assert.equal(await store.findUserByEmail('stale@example.com'), null);
    assert.notEqual(await store.getSession(HASH_2), null);
  },
);
