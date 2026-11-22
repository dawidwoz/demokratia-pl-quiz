'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const config = require('../auth-config');

// The legal texts live in the Angular app (src/app/legal/legal.config.ts); the API records which version a
// user accepted. These tests keep the two in step and prove the deploy guard script does its job.

const ROOT = path.join(__dirname, '..', '..');
const LEGAL_CONFIG = path.join(ROOT, 'src', 'app', 'legal', 'legal.config.ts');
const GUARD = path.join(ROOT, 'scripts', 'check-go-live.mjs');

test('TERMS_VERSION in the API equals the one in the Angular legal config', () => {
  const source = fs.readFileSync(LEGAL_CONFIG, 'utf8');
  const match = /export const TERMS_VERSION = '([^']+)'/.exec(source);
  assert.ok(match, 'legal.config.ts must export TERMS_VERSION as a string literal');
  assert.equal(match[1], config.TERMS_VERSION);
});

function runGuard(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'go-live-'));
  const file = path.join(dir, 'legal.config.ts');
  fs.writeFileSync(file, content);
  try {
    return spawnSync(process.execPath, [GUARD, file], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const FILLED = `
export const TERMS_VERSION = '1';
export const CONTROLLER_NAME = 'Jan Kowalski';
export const PRIVACY_CONTACT = 'kontakt@example.org';
export const EFFECTIVE_DATE = '2026-12-06';
export const LEGAL_REVIEWED = true;
`;

test('go-live guard passes when every value is filled in and the texts are reviewed', () => {
  const result = runGuard(FILLED);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed/);
});

test('go-live guard fails, naming each constant, while a placeholder remains', () => {
  const result = runGuard(
    FILLED.replace("'Jan Kowalski'", "'DO_UZUPELNIENIA'").replace(
      "'kontakt@example.org'",
      "'DO_UZUPELNIENIA'",
    ),
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CONTROLLER_NAME still holds the placeholder/);
  assert.match(result.stderr, /PRIVACY_CONTACT still holds the placeholder/);
  assert.doesNotMatch(result.stderr, /EFFECTIVE_DATE/);
});

test('go-live guard fails until the texts are marked as reviewed', () => {
  const result = runGuard(FILLED.replace('LEGAL_REVIEWED = true', 'LEGAL_REVIEWED = false'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LEGAL_REVIEWED is not true/);
});

test('go-live guard fails when LEGAL_REVIEWED is missing', () => {
  const result = runGuard(FILLED.replace('export const LEGAL_REVIEWED = true;', ''));
  assert.equal(result.status, 1);
});

test('the shipped legal config is guarded: its placeholders are literal strings the guard recognises', () => {
  const source = fs.readFileSync(LEGAL_CONFIG, 'utf8');
  // Either still a draft (placeholders present) or fully approved; never silently half-way.
  const placeholders = [...source.matchAll(/export const (\w+)\s*=\s*'DO_UZUPELNIENIA'/g)].length;
  const reviewed = /export const LEGAL_REVIEWED\s*=\s*true\s*;/.test(source);
  const result = spawnSync(process.execPath, [GUARD, LEGAL_CONFIG], { encoding: 'utf8' });
  assert.equal(result.status === 0, placeholders === 0 && reviewed);
});

// The deploy workflow is the only thing that stops placeholder legal texts reaching production, and it
// cannot be run here, so pin the two lines that matter.
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'deploy-vhpl.yml');

test('deploy workflow runs the go-live guard before it builds the app', () => {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');
  const guard = workflow.indexOf('node scripts/check-go-live.mjs');
  const build = workflow.indexOf('npm run build');
  assert.ok(guard !== -1, 'the workflow must run scripts/check-go-live.mjs');
  assert.ok(guard < build, 'the guard must run before the build');
});

test('deploy smoke check calls the anonymous /api/auth/me with GET only and expects a null user', () => {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');
  assert.match(workflow, /\/api\/auth\/me"\)/);
  assert.match(workflow, /grep -q '"user":null'/);
  assert.doesNotMatch(workflow, /-X POST[^\n]*\/api\/auth/);
  assert.doesNotMatch(workflow, /--data[^\n]*\/api\/auth/);
});
