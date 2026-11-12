'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const mysql = require('mysql2/promise');
const db = require('../db.js');

const NAMES = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];

let savedEnv;
let originalCreatePool;
let created;
let fakeQuery;

beforeEach(() => {
  savedEnv = {};
  for (const name of NAMES) {
    savedEnv[name] = process.env[name];
    process.env[name] = 'test';
  }
  created = [];
  fakeQuery = async () => [[], []];
  originalCreatePool = mysql.createPool;
  mysql.createPool = (options) => {
    created.push(options);
    return { query: (...args) => fakeQuery(...args), end: async () => {} };
  };
});

afterEach(async () => {
  await db.closePool();
  mysql.createPool = originalCreatePool;
  for (const name of NAMES) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

test('pool is created with a finite queueLimit', () => {
  db.getPool();
  assert.equal(created.length, 1);
  assert.ok(Number.isInteger(created[0].queueLimit));
  assert.ok(created[0].queueLimit > 0 && created[0].queueLimit < Infinity);
});

test('query() passes a per-query timeout to the pool', async () => {
  let seen;
  fakeQuery = async (options) => {
    seen = options;
    return [[{ a: 1 }], []];
  };
  const [rows] = await db.query('SELECT ?', [1]);
  assert.deepEqual(rows, [{ a: 1 }]);
  assert.equal(seen.sql, 'SELECT ?');
  assert.deepEqual(seen.values, [1]);
  assert.ok(seen.timeout > 0);
});

test('a timed-out query rejects and is not retried', async () => {
  let calls = 0;
  fakeQuery = async () => {
    calls += 1;
    const error = new Error('Query inactivity timeout');
    error.code = 'PROTOCOL_SEQUENCE_TIMEOUT';
    error.fatal = true;
    throw error;
  };
  await assert.rejects(db.query('SELECT 1'), { code: 'PROTOCOL_SEQUENCE_TIMEOUT' });
  assert.equal(calls, 1);
});

test('a lost connection is still retried once', async () => {
  let calls = 0;
  fakeQuery = async () => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('lost');
      error.code = 'PROTOCOL_CONNECTION_LOST';
      throw error;
    }
    return [[{ ok: 1 }], []];
  };
  const [rows] = await db.query('SELECT 1');
  assert.deepEqual(rows, [{ ok: 1 }]);
  assert.equal(calls, 2);
});
