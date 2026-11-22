'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { newToken, hashToken, safeEqual } = require('../tokens');

test('newToken() returns a 256-bit url-safe token and the SHA-256 of it', () => {
  const { token, hash } = newToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/); // 32 bytes in base64url
  assert.equal(hash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
});

test('newToken() does not repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) seen.add(newToken().token);
  assert.equal(seen.size, 200);
});

test('hashToken() is deterministic and distinguishes inputs', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('abd'));
});

test('safeEqual() compares equal and different strings, including different lengths', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
  assert.equal(safeEqual('', ''), true);
});
