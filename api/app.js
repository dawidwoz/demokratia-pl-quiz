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

const server = http.createServer(createHandler({ data: quizData, ping }));

// Passenger supplies the port; 3000 is the local fallback.
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`api listening on ${port}`));
