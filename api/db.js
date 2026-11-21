'use strict';

// Single place that builds the MySQL pool from the environment.
// Nothing connects at require time: the app starts and /api/health works with no database.
// No credentials here: DB_* come from process.env (cPanel Node.js App on the host).

const REQUIRED = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];

// Production MariaDB has wait_timeout = 600 s; close idle connections well before that.
const IDLE_TIMEOUT_MS = 60000;
const CONNECTION_LIMIT = 3;
const CONNECT_TIMEOUT_MS = 10000;
// With 3 connections and no app-level rate limiting, a hung database must fail fast instead of piling
// up requests: at most 50 waiters (~12 POSTs at 4 queries each), the rest get an immediate error (-> 503).
const QUEUE_LIMIT = 50;
// Each quiz query is a primary-key/small-table read; 5 s is far above normal and bounds a hung query.
const QUERY_TIMEOUT_MS = 5000;
const QUERY_TIMEOUT_CODE = 'PROTOCOL_SEQUENCE_TIMEOUT';

const LOST_CONNECTION_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'CR_SERVER_LOST',
]);

class MissingConfigError extends Error {
  constructor(names) {
    super(`Missing required environment variables: ${names.join(', ')}`);
    this.name = 'MissingConfigError';
    this.code = 'MISSING_CONFIG';
    this.missing = names;
  }
}

// Returns the connection options, or throws MissingConfigError naming the missing variables only.
function readConfig() {
  const missing = REQUIRED.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new MissingConfigError(missing);
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };
}

let pool = null;

function getPool() {
  if (pool) return pool;
  const config = readConfig();
  const mysql = require('mysql2/promise');
  pool = mysql.createPool({
    ...config,
    waitForConnections: true,
    connectionLimit: CONNECTION_LIMIT,
    queueLimit: QUEUE_LIMIT,
    maxIdle: CONNECTION_LIMIT,
    idleTimeout: IDLE_TIMEOUT_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    enableKeepAlive: true,
  });
  return pool;
}

function isConnectionLost(error) {
  return Boolean(error) && (LOST_CONNECTION_CODES.has(error.code) || error.fatal === true);
}

// Resolves when SELECT 1 succeeds. Retries once on a connection-lost error so a stale pooled
// connection after a long idle does not surface as "db down".
async function ping() {
  try {
    await getPool().query('SELECT 1');
  } catch (error) {
    if (!isConnectionLost(error)) throw error;
    await getPool().query('SELECT 1');
  }
}

// Runs a read query on the pool with the same single retry as ping(): a pooled connection that went
// stale during a long idle must not surface as an error to the visitor.
// Every attempt has QUERY_TIMEOUT_MS; a timeout is never retried (the database is hanging, a second
// wait would only double the latency and the load).
async function query(sql, params) {
  const options = { sql, values: params, timeout: QUERY_TIMEOUT_MS };
  try {
    return await getPool().query(options);
  } catch (error) {
    if (error && error.code === QUERY_TIMEOUT_CODE) throw error;
    if (!isConnectionLost(error)) throw error;
    return getPool().query(options);
  }
}

async function closePool() {
  if (!pool) return;
  const closing = pool;
  pool = null;
  await closing.end();
}

module.exports = { getPool, ping, query, closePool, readConfig, MissingConfigError };
