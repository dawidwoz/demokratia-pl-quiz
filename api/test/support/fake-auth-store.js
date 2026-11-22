'use strict';

// In-memory stand-in for auth-store.js plus a recording mailer, shared by the auth service and route
// tests. Behaves like the real store where it matters: unique emails, single-use tokens, expiry. No
// database needed. (This file lives in test/ so node --test also runs it; it defines no tests.)

const { DuplicateEmailError } = require('../../auth-store');

function createFakeStore() {
  let nextId = 1;
  const users = new Map(); // id -> { id, email, passwordHash, emailVerified, termsVersion }
  const sessions = new Map(); // tokenHash -> { userId, expired }
  const tokens = new Map(); // tokenHash -> { userId, purpose, expired }
  const log = []; // names of store calls, for "was it called" assertions
  const record = (name) => log.push(name);

  const store = {
    users,
    sessions,
    tokens,
    log,
    failWith: null, // set to an Error to make the next call of any method throw it
    expireSession(hash) {
      sessions.get(hash).expired = true;
    },
    expireToken(hash) {
      tokens.get(hash).expired = true;
    },
    userByEmail(email) {
      return [...users.values()].find((user) => user.email === email) || null;
    },
    async createUser({ email, passwordHash, termsVersion }) {
      record('createUser');
      if (store.userByEmail(email)) throw new DuplicateEmailError();
      const id = nextId++;
      users.set(id, { id, email, passwordHash, emailVerified: false, termsVersion });
      return id;
    },
    async findUserByEmail(email) {
      record('findUserByEmail');
      if (store.failWith) {
        const error = store.failWith;
        store.failWith = null;
        throw error;
      }
      const user = store.userByEmail(email);
      return user ? { ...user } : null;
    },
    async markEmailVerified(userId) {
      record('markEmailVerified');
      users.get(userId).emailVerified = true;
    },
    async updatePassword(userId, passwordHash) {
      record('updatePassword');
      users.get(userId).passwordHash = passwordHash;
    },
    async createSession({ tokenHash, userId }) {
      record('createSession');
      sessions.set(tokenHash, { userId, expired: false });
    },
    async getSession(tokenHash) {
      record('getSession');
      const session = sessions.get(tokenHash);
      if (!session || session.expired) return null;
      const user = users.get(session.userId);
      return user && user.emailVerified ? { id: user.id, email: user.email } : null;
    },
    async touchSession() {
      record('touchSession');
    },
    async deleteSession(tokenHash) {
      record('deleteSession');
      sessions.delete(tokenHash);
    },
    async deleteSessionsForUser(userId) {
      record('deleteSessionsForUser');
      for (const [hash, session] of sessions) if (session.userId === userId) sessions.delete(hash);
    },
    async replaceEmailToken({ userId, purpose, tokenHash }) {
      record('replaceEmailToken');
      for (const [hash, token] of tokens) {
        if (token.userId === userId && token.purpose === purpose) tokens.delete(hash);
      }
      tokens.set(tokenHash, { userId, purpose, expired: false });
    },
    async consumeEmailToken({ tokenHash, purpose }) {
      record('consumeEmailToken');
      const token = tokens.get(tokenHash);
      if (!token || token.expired || token.purpose !== purpose) return null;
      tokens.delete(tokenHash);
      return token.userId;
    },
    async deleteEmailTokensForUser(userId) {
      record('deleteEmailTokensForUser');
      for (const [hash, token] of tokens) if (token.userId === userId) tokens.delete(hash);
    },
    async purgeExpired() {
      record('purgeExpired');
      return { sessions: 0, tokens: 0, users: 0 };
    },
  };
  return store;
}

// Records every mail the service asks for. `failWith` makes sending throw (to test mail failures).
function createFakeMailer() {
  const sent = [];
  const mailer = {
    sent,
    failWith: null,
    async sendVerification(to, token) {
      sent.push({ type: 'verification', to, token });
      if (mailer.failWith) throw mailer.failWith;
    },
    async sendReset(to, token) {
      sent.push({ type: 'reset', to, token });
      if (mailer.failWith) throw mailer.failWith;
    },
    async sendAlreadyRegistered(to) {
      sent.push({ type: 'already-registered', to });
      if (mailer.failWith) throw mailer.failWith;
    },
  };
  return mailer;
}

module.exports = { createFakeStore, createFakeMailer };
