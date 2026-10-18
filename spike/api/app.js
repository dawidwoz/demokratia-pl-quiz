'use strict';

// Throwaway spike for context/changes/vhpl-deploy-spike/spike-plan.md.
// CommonJS on purpose: simplest startup-file contract for a cPanel "Setup Node.js App".
// No credentials here: DB settings come from environment variables set in cPanel.

const http = require('node:http');
const crypto = require('node:crypto');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// Criterion 3: the API answers over HTTPS on the test subdomain.
function health() {
  return { status: 'ok', node: process.version, uptimeSeconds: Math.round(process.uptime()) };
}

// Criterion 4: write and read one row in MySQL on the same host.
async function dbCheck() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    await conn.query(
      'CREATE TABLE IF NOT EXISTS spike_check (id INT AUTO_INCREMENT PRIMARY KEY, note VARCHAR(100) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
    );
    const note = `spike-${Date.now()}`;
    const [insert] = await conn.execute('INSERT INTO spike_check (note) VALUES (?)', [note]);
    const [rows] = await conn.execute('SELECT id, note FROM spike_check WHERE id = ?', [insert.insertId]);
    return { status: 'ok', wrote: note, read: rows[0] };
  } finally {
    await conn.end();
  }
}

// Criterion 7: password hashing with the built-in scrypt (no native module to compile).
function scryptCheck() {
  const started = process.hrtime.bigint();
  crypto.scryptSync('spike-password', crypto.randomBytes(16), 64);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { status: 'ok', scryptMs: Math.round(ms * 10) / 10 };
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, health());
    if (req.method === 'GET' && pathname === '/api/db-check') return sendJson(res, 200, await dbCheck());
    if (req.method === 'GET' && pathname === '/api/scrypt-check') return sendJson(res, 200, scryptCheck());
    return sendJson(res, 404, { status: 'not_found' });
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { status: 'error', message: err.code || err.message });
  }
});

// UNVERIFIED on vh.pl: whether the cPanel Node.js App (Passenger) injects its own port or
// needs PORT. Check this in "Setup Node.js App" and record the result in the spike notes.
const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`spike api listening on ${port}`));
