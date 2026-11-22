'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPasswords, createGate, HashBusyError } = require('../passwords');
const authConfig = require('../auth-config');

// Fast parameters for tests only (the real ones are in auth-config.js).
const FAST = { N: 1024, r: 8, p: 1, keylen: 32, saltBytes: 16, maxmem: 64 * 1024 * 1024 };
const passwords = createPasswords({ params: FAST });

test('checkPolicy() enforces length 10..128 in characters, not bytes', () => {
  assert.equal(passwords.checkPolicy('a'.repeat(9)), 'too_short');
  assert.equal(passwords.checkPolicy('jX3!kq9Zp2'), null); // exactly 10
  assert.equal(passwords.checkPolicy('ąęśćżźółńą'), null); // 10 characters, 20 bytes
  assert.equal(passwords.checkPolicy('ąęśćżźółń'), 'too_short'); // 9 characters
  assert.equal(passwords.checkPolicy('x'.repeat(128).replace(/x/g, 'q')), null);
  assert.equal(passwords.checkPolicy('q'.repeat(129)), 'too_long');
  assert.equal(passwords.checkPolicy(undefined), 'too_short');
  assert.equal(passwords.checkPolicy(1234567890123), 'too_short');
});

test('checkPolicy() has no composition rules', () => {
  assert.equal(passwords.checkPolicy('kolorowekredki'), null); // lower case only
  assert.equal(passwords.checkPolicy('zupelnie losowe slowa'), null); // spaces allowed
});

test('checkPolicy() rejects common passwords case-insensitively', () => {
  assert.equal(passwords.checkPolicy('1234567890'), 'too_common');
  assert.equal(passwords.checkPolicy('QWERTYUIOP'), 'too_common');
  assert.equal(passwords.checkPolicy('Q1w2E3r4T5'), 'too_common');
});

test('checkPolicy() rejects the email address and its local part', () => {
  assert.equal(
    passwords.checkPolicy('jan.kowalski@example.com', 'jan.kowalski@example.com'),
    'too_common',
  );
  assert.equal(
    passwords.checkPolicy('Jan.Kowalski.1990', 'jan.kowalski.1990@example.com'),
    'too_common',
  );
  assert.equal(passwords.checkPolicy('jan.kowalski.1990', 'ktos.inny@example.com'), null);
});

test('checkPolicy() treats canonically equivalent text the same (NFKC)', () => {
  // 'ｑｗｅｒｔｙｕｉｏｐ' is full-width and normalises to the common password 'qwertyuiop'.
  assert.equal(passwords.checkPolicy('ｑｗｅｒｔｙｕｉｏｐ'), 'too_common');
});

test('hashPassword() stores parameters, salt and key in the documented format', async () => {
  const stored = await passwords.hashPassword('correct horse battery');
  const [scheme, log2N, r, p, salt, key] = stored.split('$');
  assert.equal(scheme, 'scrypt');
  assert.equal(log2N, '10');
  assert.equal(r, '8');
  assert.equal(p, '1');
  assert.equal(Buffer.from(salt, 'base64').length, 16);
  assert.equal(Buffer.from(key, 'base64').length, 32);
  assert.ok(!stored.includes('correct horse battery'));
});

test('hashPassword() salts: the same password hashes differently each time', async () => {
  const [a, b] = await Promise.all([
    passwords.hashPassword('correct horse battery'),
    passwords.hashPassword('correct horse battery'),
  ]);
  assert.notEqual(a, b);
});

test('verifyPassword() accepts the right password and rejects wrong ones', async () => {
  const stored = await passwords.hashPassword('correct horse battery');
  assert.equal(await passwords.verifyPassword('correct horse battery', stored), true);
  assert.equal(await passwords.verifyPassword('correct horse batterz', stored), false);
  assert.equal(await passwords.verifyPassword('', stored), false);
});

test('verifyPassword() normalises (NFKC) the same way hashPassword() does', async () => {
  const stored = await passwords.hashPassword('ｃｏｒｒｅｃｔ horse'); // full-width letters
  assert.equal(await passwords.verifyPassword('correct horse', stored), true);
});

test('verifyPassword() reads the parameters from the stored hash', async () => {
  const stored = await passwords.hashPassword('correct horse battery');
  // A differently configured instance (other N) still verifies a hash made with N=1024.
  const other = createPasswords({ params: { ...FAST, N: 2048 } });
  assert.equal(await other.verifyPassword('correct horse battery', stored), true);
});

test('verifyPassword() returns false for unparsable or out-of-bounds stored values', async () => {
  for (const stored of [
    null,
    '',
    'plain',
    'scrypt$10$8$1$abc',
    'bcrypt$10$8$1$YQ==$YQ==',
    'scrypt$30$8$1$YQ==$YQ==', // N = 2^30 would need gigabytes
    'scrypt$10$999$1$YQ==$YQ==',
    'scrypt$10$8$999$YQ==$YQ==',
    'scrypt$10$8$1$$YQ==',
  ]) {
    assert.equal(
      await passwords.verifyPassword('whatever password', stored),
      false,
      String(stored),
    );
  }
});

test('verifyDummy() resolves false after doing real hashing work', async () => {
  const started = process.hrtime.bigint();
  assert.equal(await passwords.verifyDummy(), false);
  assert.ok(Number(process.hrtime.bigint() - started) > 0);
});

test('default parameters match the agreed OWASP-equivalent scrypt settings', () => {
  assert.equal(authConfig.SCRYPT.N, 2 ** 15);
  assert.equal(authConfig.SCRYPT.r, 8);
  assert.equal(authConfig.SCRYPT.p, 3);
  // Node refuses scrypt when 128 * N * r exceeds maxmem; the configured maxmem must cover it.
  assert.ok(authConfig.SCRYPT.maxmem > 128 * authConfig.SCRYPT.N * authConfig.SCRYPT.r);
  // and the real parameters actually run under Node's check:
  const key = crypto.scryptSync('x', 'salt', 32, authConfig.SCRYPT);
  assert.equal(key.length, 32);
});

test('createGate() runs at most `concurrency` tasks, queues `queue` more and refuses the rest', async () => {
  const gate = createGate({ concurrency: 1, queue: 1 });
  let releaseFirst;
  const first = gate.run(() => new Promise((resolve) => (releaseFirst = resolve)));
  const second = gate.run(async () => 'second');
  await assert.rejects(
    gate.run(async () => 'third'),
    HashBusyError,
  );
  releaseFirst('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
  // Capacity is restored afterwards.
  assert.equal(await gate.run(async () => 'again'), 'again');
});

test('createGate() releases its slot when a task throws', async () => {
  const gate = createGate({ concurrency: 1, queue: 0 });
  await assert.rejects(
    gate.run(async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(await gate.run(async () => 'ok'), 'ok');
});

test('HashBusyError carries a short code', () => {
  assert.equal(new HashBusyError().code, 'HASH_BUSY');
});
