'use strict';

// CLI for real quiz content (see content/README.md).
//   node scripts/build-content-migration.js check <file.json> [--draft]
//   node scripts/build-content-migration.js build <file.json> --out migrations/NNNN_name.sql
//   node scripts/build-content-migration.js build <file.json> --draft      (prints the SQL, writes nothing)
// Relative paths are resolved from the current directory. Exit code: 0 ok, 1 invalid content, 2 usage.

const fs = require('node:fs');
const path = require('node:path');
const { validateContent, renderSeedSql } = require('../content');

const USAGE = [
  'usage:',
  '  content:check <file.json> [--draft]',
  '  content:build <file.json> --out <NNNN_name.sql>',
  '  content:build <file.json> --draft',
].join('\n');

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, file: null, draft: false, out: null };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--draft') args.draft = true;
    else if (arg === '--out') {
      args.out = rest[index + 1];
      index += 1;
    } else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else if (args.file === null) args.file = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  return args;
}

// Returns the exit code. io is injectable for tests.
function run(argv, io = { out: console.log, err: console.error }) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.err(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (!['check', 'build'].includes(args.command) || !args.file) {
    io.err(USAGE);
    return 2;
  }
  if (args.command === 'check' && args.out) {
    io.err('check does not write files; --out belongs to build');
    return 2;
  }
  if (args.command === 'build') {
    if (args.draft && args.out) {
      io.err(
        '--draft never writes a migration; drop --draft to write one, or drop --out to preview',
      );
      return 2;
    }
    if (!args.draft && !args.out) {
      io.err('build needs --out <NNNN_name.sql> (or --draft to preview the SQL on screen)');
      return 2;
    }
    if (args.out && !/^\d{4}_.+\.sql$/.test(path.basename(args.out))) {
      io.err('--out must be named NNNN_name.sql so that api/migrate.js picks it up');
      return 2;
    }
    if (args.out && fs.existsSync(args.out)) {
      io.err(`${args.out} already exists; an applied migration is never edited, add a new number`);
      return 2;
    }
    if (args.out && !fs.existsSync(path.dirname(args.out))) {
      io.err(`directory ${path.dirname(args.out)} does not exist`);
      return 2;
    }
  }

  let doc;
  try {
    const text = fs.readFileSync(args.file, 'utf8').replace(/^﻿/, '');
    doc = JSON.parse(text);
  } catch (error) {
    io.err(`cannot read ${args.file} as JSON: ${error.message}`);
    return 1;
  }

  const { errors, warnings } = validateContent(doc, { draft: args.draft });
  for (const warning of warnings) io.err(`WARN  ${warning}`);
  for (const error of errors) io.err(`ERROR ${error}`);
  if (errors.length > 0) {
    io.err(`${errors.length} error(s), ${warnings.length} warning(s): nothing generated`);
    return 1;
  }
  if (args.command === 'check') {
    io.out(
      `OK: ${doc.questions.length} question(s), ${doc.parties.length} party(ies), ${warnings.length} warning(s)${args.draft ? ' (draft mode)' : ''}`,
    );
    return 0;
  }

  const sql = renderSeedSql(doc, { sourceFile: args.file.split(path.sep).join('/') });
  if (args.draft) {
    io.out(sql);
    return 0;
  }
  fs.writeFileSync(args.out, sql, { encoding: 'utf8', flag: 'wx' });
  io.out(
    `wrote ${args.out} (${warnings.length} warning(s)); test it on a scratch database before deploying`,
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = run(process.argv.slice(2));
}

module.exports = { run };
