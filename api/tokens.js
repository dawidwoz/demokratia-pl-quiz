'use strict';

// Random secrets (session ids, email tokens) and their storage form. The raw token only ever goes to
// the user (cookie or mail link); the database holds its SHA-256, so a read-only leak of the tables
// does not hand out usable sessions or reset links.

const crypto = require('node:crypto');

const TOKEN_BYTES = 32; // 256 bits, far above OWASP's 64-bit minimum for a session id

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// -> { token, hash }: send `token` to the user, store `hash`.
function newToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, hash: hashToken(token) };
}

// Constant-time string comparison that tolerates different lengths (timingSafeEqual throws on those).
function safeEqual(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = { newToken, hashToken, safeEqual };
