'use strict';

// Minimal API for the first vh.pl deployment: liveness (/api/health) and DB probe (/api/health/db).
// CommonJS on purpose: simplest startup-file contract for a cPanel "Setup Node.js App".
// No credentials here: DB settings (DB_*) come from environment variables set in cPanel (see db.js).

const http = require('node:http');
const { ping } = require('./db');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function health() {
  return { status: 'ok', node: process.version, uptimeSeconds: Math.round(process.uptime()) };
}

// DB probe: never leaks credential values or raw error messages, only a short code.
async function healthDb(res) {
  try {
    await ping();
    return sendJson(res, 200, { status: 'ok', db: 'up' });
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    console.error(`db health check failed: ${code}`);
    return sendJson(res, 503, { status: 'error', db: 'down', code });
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, health());
  if (req.method === 'GET' && pathname === '/api/health/db') return healthDb(res);
  return sendJson(res, 404, { status: 'not_found' });
});

// Passenger (cPanel Node.js App) supplies the port; 3000 is the local fallback.
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`api listening on ${port}`));
