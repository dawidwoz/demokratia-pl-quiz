'use strict';

// The only module with auth SQL: users, sessions, one-time email tokens. All expiry arithmetic uses the
// database clock (NOW()), never the app's, so every comparison shares one time source. Writes go
// through db.write()/db.transaction(), which never retry. Only token HASHES reach this module (see
// tokens.js). Callers lower-case and trim emails.

const db = require('./db');
const config = require('./auth-config');

class DuplicateEmailError extends Error {
  constructor() {
    super('email already registered');
    this.code = 'DUPLICATE_EMAIL';
  }
}

// Account row for the service: emailVerified is a real boolean.
function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    emailVerified: Boolean(row.email_verified),
  };
}

async function createUser({ email, passwordHash, termsVersion }) {
  try {
    const [result] = await db.write(
      'INSERT INTO users (email, password_hash, terms_version) VALUES (?, ?, ?)',
      [email, passwordHash, termsVersion],
    );
    return result.insertId;
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') throw new DuplicateEmailError();
    throw error;
  }
}

async function findUserByEmail(email) {
  const [rows] = await db.query(
    'SELECT id, email, password_hash, email_verified_at IS NOT NULL AS email_verified ' +
      'FROM users WHERE email = ?',
    [email],
  );
  return rows.length > 0 ? toUser(rows[0]) : null;
}

async function markEmailVerified(userId) {
  await db.write(
    'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?',
    [userId],
  );
}

async function updatePassword(userId, passwordHash) {
  await db.write('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

async function createSession({ tokenHash, userId }) {
  await db.write(
    'INSERT INTO sessions (token_hash, user_id, expires_at) ' +
      'VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [tokenHash, userId, config.SESSION_ABSOLUTE_SECONDS],
  );
}

// -> { id, email } while the session is inside both its absolute and idle limits and the account is
// verified; otherwise null. Does not refresh the session (see touchSession).
async function getSession(tokenHash) {
  const [rows] = await db.query(
    'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id ' +
      'WHERE s.token_hash = ? AND s.expires_at > NOW() ' +
      'AND s.last_seen_at > DATE_SUB(NOW(), INTERVAL ? SECOND) ' +
      'AND u.email_verified_at IS NOT NULL',
    [tokenHash, config.SESSION_IDLE_SECONDS],
  );
  return rows.length > 0 ? { id: rows[0].id, email: rows[0].email } : null;
}

// Refreshes the idle timer, at most once per SESSION_TOUCH_SECONDS.
async function touchSession(tokenHash) {
  await db.write(
    'UPDATE sessions SET last_seen_at = NOW() ' +
      'WHERE token_hash = ? AND last_seen_at < DATE_SUB(NOW(), INTERVAL ? SECOND)',
    [tokenHash, config.SESSION_TOUCH_SECONDS],
  );
}

async function deleteSession(tokenHash) {
  await db.write('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}

async function deleteSessionsForUser(userId) {
  await db.write('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

// One live token per user and purpose: issuing a new one replaces the old one.
async function replaceEmailToken({ userId, purpose, tokenHash, ttlSeconds }) {
  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?', [userId, purpose]);
    await tx.query(
      'INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) ' +
        'VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
      [tokenHash, userId, purpose, ttlSeconds],
    );
  });
}

// Single use: -> the user id and deletes the token, or null when it is unknown, expired, used or
// issued for another purpose. The row lock makes two simultaneous uses race to one winner.
async function consumeEmailToken({ tokenHash, purpose }) {
  return db.transaction(async (tx) => {
    const [rows] = await tx.query(
      'SELECT user_id FROM email_tokens ' +
        'WHERE token_hash = ? AND purpose = ? AND expires_at > NOW() FOR UPDATE',
      [tokenHash, purpose],
    );
    if (rows.length === 0) return null;
    await tx.query('DELETE FROM email_tokens WHERE token_hash = ?', [tokenHash]);
    return rows[0].user_id;
  });
}

async function deleteEmailTokensForUser(userId) {
  await db.write('DELETE FROM email_tokens WHERE user_id = ?', [userId]);
}

// Housekeeping: expired sessions and tokens, and accounts that never verified their email.
async function purgeExpired() {
  const [sessions] = await db.write(
    'DELETE FROM sessions WHERE expires_at <= NOW() ' +
      'OR last_seen_at <= DATE_SUB(NOW(), INTERVAL ? SECOND)',
    [config.SESSION_IDLE_SECONDS],
  );
  const [tokens] = await db.write('DELETE FROM email_tokens WHERE expires_at <= NOW()');
  const [users] = await db.write(
    'DELETE FROM users WHERE email_verified_at IS NULL ' +
      'AND created_at <= DATE_SUB(NOW(), INTERVAL ? DAY)',
    [config.UNVERIFIED_PURGE_DAYS],
  );
  return {
    sessions: sessions.affectedRows,
    tokens: tokens.affectedRows,
    users: users.affectedRows,
  };
}

module.exports = {
  DuplicateEmailError,
  createUser,
  findUserByEmail,
  markEmailVerified,
  updatePassword,
  createSession,
  getSession,
  touchSession,
  deleteSession,
  deleteSessionsForUser,
  replaceEmailToken,
  consumeEmailToken,
  deleteEmailTokensForUser,
  purgeExpired,
};
