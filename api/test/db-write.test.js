'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// write() must never retry (a retried INSERT could apply twice) and transaction() must commit on
// success, roll back and rethrow the ORIGINAL error on failure, and always release the connection.
// A fake pool replaces mysql2's createPool; no database is needed (same approach as db-query.test.js).

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

function lostConnection(code = 'ECONNRESET') {
  return Object.assign(new Error('connection lost'), { code });
}

// outcomes: results (or Errors to throw) for pool.query / conn.query, in call order.
function fakePool({
  poolOutcomes = [],
  connOutcomes = [],
  beginError = null,
  rollbackError = null,
} = {}) {
  const log = [];
  const conn = {
    async beginTransaction() {
      log.push('begin');
      if (beginError) throw beginError;
    },
    async query(options) {
      log.push({ conn: options });
      const outcome = connOutcomes[log.filter((entry) => entry.conn).length - 1];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async commit() {
      log.push('commit');
    },
    async rollback() {
      log.push('rollback');
      if (rollbackError) throw rollbackError;
    },
    release() {
      log.push('release');
    },
  };
  const pool = {
    log,
    async query(options) {
      log.push({ pool: options });
      const outcome = poolOutcomes[log.filter((entry) => entry.pool).length - 1];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async getConnection() {
      return conn;
    },
    async end() {},
  };
  mysql.createPool = () => pool;
  return pool;
}

test('write() runs the statement once with the query timeout', async () => {
  const pool = fakePool({ poolOutcomes: [[{ insertId: 7 }, undefined]] });
  const [result] = await db.write('INSERT INTO t (a) VALUES (?)', [1]);
  assert.equal(result.insertId, 7);
  assert.deepEqual(pool.log, [
    { pool: { sql: 'INSERT INTO t (a) VALUES (?)', values: [1], timeout: 5000 } },
  ]);
});

test('write() does NOT retry after a lost connection', async () => {
  const pool = fakePool({ poolOutcomes: [lostConnection(), [{ insertId: 1 }, undefined]] });
  await assert.rejects(db.write('INSERT INTO t (a) VALUES (1)'), { code: 'ECONNRESET' });
  assert.equal(pool.log.filter((entry) => entry.pool).length, 1);
});

test('transaction() commits and releases when the callback resolves', async () => {
  const pool = fakePool({ connOutcomes: [[[{ id: 1 }], []]] });
  const result = await db.transaction(async (tx) => {
    const [rows] = await tx.query('SELECT ?', [1]);
    return rows[0].id;
  });
  assert.equal(result, 1);
  assert.deepEqual(pool.log, [
    'begin',
    { conn: { sql: 'SELECT ?', values: [1], timeout: 5000 } },
    'commit',
    'release',
  ]);
});

test('transaction() rolls back, releases and rethrows the original error', async () => {
  const boom = Object.assign(new Error('boom'), { code: 'ER_DUP_ENTRY' });
  const pool = fakePool();
  await assert.rejects(
    db.transaction(async () => {
      throw boom;
    }),
    (error) => error === boom,
  );
  assert.deepEqual(pool.log, ['begin', 'rollback', 'release']);
});

test('transaction() keeps the original error when rollback itself fails', async () => {
  const boom = Object.assign(new Error('boom'), { code: 'ER_LOCK_DEADLOCK' });
  const pool = fakePool({ rollbackError: lostConnection() });
  await assert.rejects(
    db.transaction(async () => {
      throw boom;
    }),
    (error) => error === boom,
  );
  assert.deepEqual(pool.log, ['begin', 'rollback', 'release']);
});

test('transaction() releases the connection when BEGIN fails', async () => {
  const pool = fakePool({ beginError: lostConnection('ETIMEDOUT') });
  await assert.rejects(
    db.transaction(async () => 'unreachable'),
    { code: 'ETIMEDOUT' },
  );
  assert.deepEqual(pool.log, ['begin', 'rollback', 'release']);
});

test('transaction() never retries a statement after a lost connection', async () => {
  const pool = fakePool({ connOutcomes: [lostConnection(), [{ affectedRows: 1 }]] });
  await assert.rejects(
    db.transaction((tx) => tx.query('DELETE FROM t')),
    { code: 'ECONNRESET' },
  );
  assert.equal(pool.log.filter((entry) => entry.conn).length, 1);
  assert.deepEqual(
    pool.log.filter((entry) => typeof entry === 'string'),
    ['begin', 'rollback', 'release'],
  );
});
