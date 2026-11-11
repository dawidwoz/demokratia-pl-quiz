'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { readConfig, MissingConfigError } = require('../db.js');

const NAMES = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

// readConfig() reads process.env at call time, and a developer's shell may already define DB_*.
// Every test starts from a clean slate and the original values come back afterwards.
let saved;

beforeEach(() => {
  saved = {};
  for (const name of NAMES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function setRequired() {
  process.env.DB_USER = 'quiz_user';
  process.env.DB_PASSWORD = 's3cret-value';
  process.env.DB_NAME = 'quiz_db';
}

function missingError() {
  try {
    readConfig();
  } catch (error) {
    return error;
  }
  return assert.fail('readConfig() did not throw');
}

test('returns the connection options and defaults the host to localhost', () => {
  setRequired();

  assert.deepEqual(readConfig(), {
    host: 'localhost',
    user: 'quiz_user',
    password: 's3cret-value',
    database: 'quiz_db',
  });
});

test('uses DB_HOST when it is set', () => {
  setRequired();
  process.env.DB_HOST = 'db.internal';

  assert.equal(readConfig().host, 'db.internal');
});

for (const name of ['DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
  test(`throws MissingConfigError naming only ${name} when it is unset`, () => {
    setRequired();
    delete process.env[name];

    const error = missingError();

    assert.ok(error instanceof MissingConfigError);
    assert.equal(error.code, 'MISSING_CONFIG');
    assert.deepEqual(error.missing, [name]);
  });
}

test('lists all three required variables, in order, when none is set', () => {
  assert.deepEqual(missingError().missing, ['DB_USER', 'DB_PASSWORD', 'DB_NAME']);
});

test('treats an empty string as missing', () => {
  setRequired();
  process.env.DB_NAME = '';

  assert.deepEqual(missingError().missing, ['DB_NAME']);
});

test('does not put the password value in the error message', () => {
  setRequired();
  delete process.env.DB_NAME;

  assert.ok(!missingError().message.includes('s3cret-value'));
});
