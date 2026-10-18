'use strict';

// Minimal API for the first vh.pl deployment: health check only.
// CommonJS on purpose: simplest startup-file contract for a cPanel "Setup Node.js App".
// No credentials here: DB settings (DB_*) will come from environment variables set in cPanel.

const http = require('node:http');

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function health() {
  return { status: 'ok', node: process.version, uptimeSeconds: Math.round(process.uptime()) };
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, health());
  return sendJson(res, 404, { status: 'not_found' });
});

// Passenger (cPanel Node.js App) supplies the port; 3000 is the local fallback.
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`api listening on ${port}`));
