'use strict';

// Password policy and hashing with Node's built-in scrypt (no native module: the shared host may not
// build bcrypt/argon2). Stored form: scrypt$<log2 N>$<r>$<p>$<salt b64>$<hash b64>, so the parameters
// travel with the hash and can be raised later. Passwords are NFKC-normalised before hashing and
// policy checks. Nothing here logs or returns a password.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const authConfig = require('./auth-config');

const scrypt = promisify(crypto.scrypt);

const COMMON_PASSWORDS_FILE = path.join(__dirname, 'data', 'common-passwords.txt');
// Bounds applied to parameters read back from a stored hash, so a corrupted row cannot ask for
// unbounded memory or time.
const MAX_STORED_LOG2_N = 17;
const MAX_STORED_R = 16;
const MAX_STORED_P = 16;

class HashBusyError extends Error {
  constructor() {
    super('too many password hashes in progress');
    this.code = 'HASH_BUSY';
  }
}

// Limits concurrent scrypt runs and the number of waiters; the rest are refused immediately.
function createGate({ concurrency, queue }) {
  let active = 0;
  const waiting = [];

  async function acquire() {
    if (active < concurrency) {
      active += 1;
      return;
    }
    if (waiting.length >= queue) throw new HashBusyError();
    // The slot is handed over by release(), so `active` stays unchanged for the waiter.
    await new Promise((resolve) => waiting.push(resolve));
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  }

  return {
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}

function normalize(password) {
  return String(password).normalize('NFKC');
}

function parseStored(stored) {
  if (typeof stored !== 'string') return null;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const log2N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(log2N) || log2N < 10 || log2N > MAX_STORED_LOG2_N) return null;
  if (!Number.isInteger(r) || r < 1 || r > MAX_STORED_R) return null;
  if (!Number.isInteger(p) || p < 1 || p > MAX_STORED_P) return null;
  const salt = Buffer.from(parts[4], 'base64');
  const hash = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || hash.length === 0) return null;
  return { N: 2 ** log2N, log2N, r, p, salt, hash };
}

function loadCommonPasswords(file) {
  const entries = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line === '' || line.startsWith('#')) continue;
    entries.add(line.normalize('NFKC').toLowerCase());
  }
  return entries;
}

function createPasswords({
  params = authConfig.SCRYPT,
  gate = createGate(authConfig.HASH_GATE),
  min = authConfig.PASSWORD_MIN,
  max = authConfig.PASSWORD_MAX,
  commonFile = COMMON_PASSWORDS_FILE,
} = {}) {
  let common = null;
  let dummyHash = null;

  function derive(password, salt, { N, r, p }, keylen) {
    // maxmem comfortably above scrypt's 128 * N * r requirement for any accepted parameters.
    const maxmem = Math.max(params.maxmem, 256 * N * r);
    return gate.run(() => scrypt(normalize(password), salt, keylen, { N, r, p, maxmem }));
  }

  // null when acceptable, otherwise 'too_short' | 'too_long' | 'too_common' (a common password, or
  // the email address / its local part).
  function checkPolicy(password, email) {
    if (typeof password !== 'string') return 'too_short';
    const normalized = normalize(password);
    const length = [...normalized].length;
    if (length < min) return 'too_short';
    if (length > max) return 'too_long';
    const lowered = normalized.toLowerCase();
    if (!common) common = loadCommonPasswords(commonFile);
    if (common.has(lowered)) return 'too_common';
    if (typeof email === 'string' && email !== '') {
      const address = normalize(email).toLowerCase();
      if (lowered === address || lowered === address.split('@')[0]) return 'too_common';
    }
    return null;
  }

  async function hashPassword(password) {
    const salt = crypto.randomBytes(params.saltBytes);
    const key = await derive(password, salt, params, params.keylen);
    const log2N = Math.log2(params.N);
    return `scrypt$${log2N}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  // false for a wrong password or an unparsable stored value; throws HashBusyError when the gate is full.
  async function verifyPassword(password, stored) {
    const parsed = parseStored(stored);
    if (!parsed) return false;
    const key = await derive(password, parsed.salt, parsed, parsed.hash.length);
    return key.length === parsed.hash.length && crypto.timingSafeEqual(key, parsed.hash);
  }

  // Burns the same work as a real verification, for logins with an unknown email, so response time
  // does not reveal whether the account exists. Always false.
  async function verifyDummy() {
    if (!dummyHash) dummyHash = hashPassword('dummy password for timing equalisation');
    await verifyPassword('another dummy password', await dummyHash);
    return false;
  }

  return { checkPolicy, hashPassword, verifyPassword, verifyDummy };
}

module.exports = { ...createPasswords(), createPasswords, createGate, HashBusyError };
