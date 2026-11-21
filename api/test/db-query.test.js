'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// query() must retry exactly once on a lost connection (a stale pooled connection after a long idle)
// and must not retry other errors. A fake pool replaces mysql2's createPool; no database is needed.

const mysql = require('mysql2/promise');
const db = require('../db');

const ENV_NAMES = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
let savedEnv;
let savedCreatePool;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  process.env.DB_USER = 'test-user';
  process.env.DB_PASSWORD = 'test-password';
  process.env.DB_NAME = 'test-db';
  savedCreatePool = mysql.createPool;
});

afterEach(async () => {
  mysql.createPool = savedCreatePool;
  await db.closePool();
  for (const name of ENV_NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

function fakePool(outcomes) {
  const calls = [];
  const pool = {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const outcome = outcomes[calls.length - 1];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async end() {},
  };
  mysql.createPool = () => pool;
  return pool;
}

function lostConnection(code = 'ECONNRESET') {
  return Object.assign(new Error('connection lost'), { code });
}

test('query() retries once after a lost connection and returns the second result', async () => {
  const pool = fakePool([lostConnection(), [[{ id: 1 }], []]]);
  const [rows] = await db.query('SELECT ?', [1]);
  assert.deepEqual(rows, [{ id: 1 }]);
  assert.equal(pool.calls.length, 2);
  assert.deepEqual(pool.calls[1].sql, { sql: 'SELECT ?', values: [1], timeout: 5000 });
});

test('query() gives up after one retry when the connection is lost again', async () => {
  const pool = fakePool([lostConnection(), lostConnection('EPIPE'), [[{ id: 1 }], []]]);
  await assert.rejects(db.query('SELECT 1'), { code: 'EPIPE' });
  assert.equal(pool.calls.length, 2);
});

test('query() does not retry other errors', async () => {
  const pool = fakePool([Object.assign(new Error('syntax'), { code: 'ER_PARSE_ERROR' })]);
  await assert.rejects(db.query('SELEC 1'), { code: 'ER_PARSE_ERROR' });
  assert.equal(pool.calls.length, 1);
});
