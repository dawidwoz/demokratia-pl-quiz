'use strict';

// Migration runner: applies pending api/migrations/NNNN_name.sql files in order and records
// them in schema_migrations. Usable as `node migrate.js` and importable (`migrate()`).
// DB_* come from process.env only; nothing here prints credential values.

const fs = require('node:fs');
const path = require('node:path');
const { readConfig } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_FILE = /^\d{4}_.+\.sql$/;
const LOCK_WAIT_SECONDS = 30;
const CONNECT_TIMEOUT_MS = 10000;

function listMigrationFiles(dir, warn) {
  const names = fs.readdirSync(dir).filter((name) => {
    if (MIGRATION_FILE.test(name)) return true;
    warn(`skipping ${name}: does not match NNNN_name.sql`);
    return false;
  });
  // Ascending by full filename; files sharing a number sort by the rest of the name.
  return names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// Applies pending migrations. Resolves with the list of applied names.
// Rejects on the first failure; later files are not attempted.
async function migrate({ log = console.log, warn = console.warn, dir = MIGRATIONS_DIR } = {}) {
  const config = readConfig(); // throws MissingConfigError naming variables only
  const mysql = require('mysql2/promise');

  // Dedicated connection: GET_LOCK is session-scoped, and multipleStatements stays off the pool.
  const conn = await mysql.createConnection({
    ...config,
    multipleStatements: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
  });

  const lockName = `${config.database}:schema_migrations`;
  let locked = false;
  try {
    const [[lockRow]] = await conn.query('SELECT GET_LOCK(?, ?) AS got', [lockName, LOCK_WAIT_SECONDS]);
    if (Number(lockRow.got) !== 1) {
      const error = new Error('could not acquire the migration lock (another run in progress?)');
      error.code = 'MIGRATION_LOCK_TIMEOUT';
      throw error;
    }
    locked = true;

    await conn.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (' +
        'name VARCHAR(255) PRIMARY KEY, ' +
        'applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
    );

    const [appliedRows] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.name));

    const pending = listMigrationFiles(dir, warn).filter((name) => !applied.has(name));
    if (pending.length === 0) {
      log('no pending migrations');
      return [];
    }

    const done = [];
    for (const name of pending) {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      try {
        await conn.query(sql);
      } catch (error) {
        error.migration = name;
        throw error;
      }
      // Recorded only after the file executed successfully.
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      log(`applied ${name}`);
      done.push(name);
    }
    return done;
  } finally {
    if (locked) {
      try {
        await conn.query('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch (_) {
        // Connection closing below releases the session lock anyway.
      }
    }
    try {
      await conn.end();
    } catch (_) {
      // Nothing useful to do on a failed close.
    }
  }
}

if (require.main === module) {
  migrate().then(
    () => {
      process.exitCode = 0;
    },
    (error) => {
      if (error && error.code === 'MISSING_CONFIG') {
        // Message names the missing variables only, never values.
        console.error(error.message);
      } else if (error && error.migration) {
        // Failure inside a migration file: SQL error text is safe to show.
        const detail = error.sqlMessage || error.code || 'unknown error';
        console.error(`migration ${error.migration} failed: ${detail}`);
      } else {
        // Connection or other failures: short code only, no raw message (may contain user/host).
        console.error(`migration run failed: ${(error && error.code) || 'UNKNOWN'}`);
      }
      process.exitCode = 1;
    },
  );
}

module.exports = { migrate };
