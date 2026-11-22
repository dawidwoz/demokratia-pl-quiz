'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Mapping and call-shape tests for auth-store.js with db.query/db.write/db.transaction stubbed: no
// database needed. The real SQL is exercised by auth-store.db.test.js (opt-in, scratch database).

const db = require('../db');
const store = require('../auth-store');
const config = require('../auth-config');

let saved;
let calls;

beforeEach(() => {
  saved = { query: db.query, write: db.write, transaction: db.transaction };
  calls = [];
});

afterEach(() => {
  Object.assign(db, saved);
});

function stub({ query, write, transaction } = {}) {
  if (query)
    db.query = async (sql, params) => (calls.push({ query: sql, params }), query(sql, params));
  if (write)
    db.write = async (sql, params) => (calls.push({ write: sql, params }), write(sql, params));
  if (transaction) db.transaction = transaction;
}

test('createUser() inserts and returns the new id', async () => {
  stub({ write: async () => [{ insertId: 42 }] });
  const id = await store.createUser({ email: 'a@b.pl', passwordHash: 'h', termsVersion: '1' });
  assert.equal(id, 42);
  assert.deepEqual(calls[0].params, ['a@b.pl', 'h', '1']);
});

test('createUser() maps a duplicate-key error to DuplicateEmailError', async () => {
  stub({
    write: async () => {
      throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    },
  });
  await assert.rejects(
    store.createUser({ email: 'a@b.pl', passwordHash: 'h', termsVersion: '1' }),
    (error) => error instanceof store.DuplicateEmailError && error.code === 'DUPLICATE_EMAIL',
  );
});

test('createUser() lets other database errors through unchanged', async () => {
  const failure = Object.assign(new Error('down'), { code: 'ECONNREFUSED' });
  stub({
    write: async () => {
      throw failure;
    },
  });
  await assert.rejects(
    store.createUser({ email: 'a@b.pl', passwordHash: 'h', termsVersion: '1' }),
    (error) => error === failure,
  );
});

test('findUserByEmail() maps the row and the verified flag to booleans, or returns null', async () => {
  stub({
    query: async () => [[{ id: 3, email: 'a@b.pl', password_hash: 'h', email_verified: 1n }]],
  });
  assert.deepEqual(await store.findUserByEmail('a@b.pl'), {
    id: 3,
    email: 'a@b.pl',
    passwordHash: 'h',
    emailVerified: true,
  });
  stub({
    query: async () => [[{ id: 3, email: 'a@b.pl', password_hash: 'h', email_verified: 0 }]],
  });
  assert.equal((await store.findUserByEmail('a@b.pl')).emailVerified, false);
  stub({ query: async () => [[]] });
  assert.equal(await store.findUserByEmail('nobody@b.pl'), null);
});

test('createSession() uses the absolute lifetime and the database clock', async () => {
  stub({ write: async () => [{}] });
  await store.createSession({ tokenHash: 'x'.repeat(64), userId: 3 });
  assert.match(calls[0].write, /DATE_ADD\(NOW\(\), INTERVAL \? SECOND\)/);
  assert.deepEqual(calls[0].params, ['x'.repeat(64), 3, config.SESSION_ABSOLUTE_SECONDS]);
});

test('getSession() checks absolute expiry, idle expiry and a verified account', async () => {
  stub({ query: async () => [[{ id: 3, email: 'a@b.pl' }]] });
  assert.deepEqual(await store.getSession('h'), { id: 3, email: 'a@b.pl' });
  assert.match(calls[0].query, /s\.expires_at > NOW\(\)/);
  assert.match(calls[0].query, /s\.last_seen_at > DATE_SUB\(NOW\(\), INTERVAL \? SECOND\)/);
  assert.match(calls[0].query, /u\.email_verified_at IS NOT NULL/);
  assert.deepEqual(calls[0].params, ['h', config.SESSION_IDLE_SECONDS]);
  stub({ query: async () => [[]] });
  assert.equal(await store.getSession('h'), null);
});

test('touchSession() only writes when the last refresh is old enough', async () => {
  stub({ write: async () => [{}] });
  await store.touchSession('h');
  assert.match(calls[0].write, /last_seen_at < DATE_SUB\(NOW\(\), INTERVAL \? SECOND\)/);
  assert.deepEqual(calls[0].params, ['h', config.SESSION_TOUCH_SECONDS]);
});

test('replaceEmailToken() deletes the old token and inserts the new one in one transaction', async () => {
  const statements = [];
  stub({
    transaction: async (fn) =>
      fn({ query: async (sql, params) => (statements.push({ sql, params }), [{}]) }),
  });
  await store.replaceEmailToken({ userId: 3, purpose: 'verify', tokenHash: 'h', ttlSeconds: 60 });
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /^DELETE FROM email_tokens/);
  assert.deepEqual(statements[0].params, [3, 'verify']);
  assert.match(statements[1].sql, /^INSERT INTO email_tokens/);
  assert.deepEqual(statements[1].params, ['h', 3, 'verify', 60]);
});

test('consumeEmailToken() returns the user id and deletes the token; null when nothing matches', async () => {
  const statements = [];
  stub({
    transaction: async (fn) =>
      fn({
        query: async (sql, params) => {
          statements.push({ sql, params });
          return sql.startsWith('SELECT') ? [[{ user_id: 9 }]] : [{}];
        },
      }),
  });
  assert.equal(await store.consumeEmailToken({ tokenHash: 'h', purpose: 'reset' }), 9);
  assert.match(statements[0].sql, /expires_at > NOW\(\) FOR UPDATE/);
  assert.deepEqual(statements[0].params, ['h', 'reset']);
  assert.match(statements[1].sql, /^DELETE FROM email_tokens WHERE token_hash = \?/);

  statements.length = 0;
  stub({
    transaction: async (fn) =>
      fn({
        query: async (sql, params) => {
          statements.push({ sql, params });
          return [[]];
        },
      }),
  });
  assert.equal(await store.consumeEmailToken({ tokenHash: 'h', purpose: 'reset' }), null);
  assert.equal(statements.length, 1); // nothing deleted
});

test('purgeExpired() reports how many rows each cleanup removed', async () => {
  const results = [[{ affectedRows: 2 }], [{ affectedRows: 1 }], [{ affectedRows: 5 }]];
  stub({ write: async () => results.shift() });
  assert.deepEqual(await store.purgeExpired(), { sessions: 2, tokens: 1, users: 5 });
  assert.deepEqual(calls[2].params, [config.UNVERIFIED_PURGE_DAYS]);
});
