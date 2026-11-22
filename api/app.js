'use strict';

// API entry point started by Passenger (cPanel "Setup Node.js App"): wires the real dependencies into
// the handler (handler.js) and listens unconditionally. Do not gate listen() on require.main:
// Passenger loads this file, so require.main is not reliable here.
// CommonJS on purpose: simplest startup-file contract for the host.
// No credentials here: DB settings (DB_*) come from environment variables set in cPanel (see db.js).

const http = require('node:http');
const { ping } = require('./db');
const { createHandler } = require('./handler');
const quizData = require('./quiz-data');
const passwords = require('./passwords');
const authStore = require('./auth-store');
const { createMailer } = require('./mailer');
const { createAuthService } = require('./auth-service');
const { createAuthRoutes } = require('./auth-routes');

// Accounts: SQL store, SMTP mailer and the in-memory limiters are wired here; mail settings are read
// from the environment when a mail is sent, so a missing SMTP variable never stops the API starting.
const auth = createAuthRoutes({
  service: createAuthService({ store: authStore, mailer: createMailer(process.env), passwords }),
  env: process.env,
});

const server = http.createServer(createHandler({ data: quizData, ping, auth }));

// Bound slow or stalled clients: a whole request must arrive within 30 s (Node's default is 300 s).
server.requestTimeout = 30000;
server.headersTimeout = 15000;

// Passenger supplies the port; 3000 is the local fallback.
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`api listening on ${port}`));
