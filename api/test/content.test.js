'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateContent, renderSeedSql, deriveStance } = require('../content');
const { run } = require('../scripts/build-content-migration');

const TODAY = '2026-11-21';

function source(overrides = {}) {
  return {
    label: 'Sejm, głosowanie nr 1',
    url: 'https://www.sejm.gov.pl/',
    date: '2025-02-11',
    ...overrides,
  };
}

function question(id, positions) {
  return { id, text: `Pytanie ${id}?`, weight: 2, source: source(), positions };
}

function voteTwo(overrides = {}) {
  return {
    party: 2,
    basis: 'vote',
    stance: 'za',
    votes: { clubSize: 200, za: 150, przeciw: 20, wstrzymuje: 10 },
    justification: 'Klub głosował za.',
    source: source(),
    ...overrides,
  };
}

function declarationOne(overrides = {}) {
  return {
    party: 1,
    basis: 'declaration',
    stance: 'przeciw',
    justification: 'Program wyborczy.',
    source: source({ url: null }),
    ...overrides,
  };
}

// A valid document: 8 questions, 2 parties, a vote-based and a declaration-based position each.
function validDoc() {
  return {
    quiz: { id: 101, title: 'Quiz', description: 'Opis' },
    parties: [
      { id: 1, name: 'Partia A' },
      { id: 2, name: 'Partia B' },
    ],
    questions: Array.from({ length: 8 }, (_, index) =>
      question(101 + index, [declarationOne(), voteTwo()]),
    ),
  };
}

function check(doc, options = {}) {
  return validateContent(doc, { today: TODAY, ...options });
}

function errorsOf(doc, options) {
  return check(doc, options).errors;
}

function assertError(doc, pattern, options) {
  const errors = errorsOf(doc, options);
  assert.ok(
    errors.some((message) => pattern.test(message)),
    `expected an error matching ${pattern}, got:\n${errors.join('\n')}`,
  );
}

test('a complete document has no errors and no warnings', () => {
  assert.deepEqual(check(validDoc()), { errors: [], warnings: [] });
});

test('notes (keys starting with _) are ignored but unknown fields are errors', () => {
  const doc = validDoc();
  doc._note = 'free text';
  doc.questions[0]._todo = 'check the date';
  assert.deepEqual(errorsOf(doc), []);

  doc.questions[0].justyfication = 'typo';
  assertError(doc, /unknown field "justyfication"/);
});

test('the quiz needs at least 8 questions; draft mode relaxes only that', () => {
  const doc = validDoc();
  doc.questions = doc.questions.slice(0, 3);
  assertError(doc, /at least 8 questions are required \(found 3\)/);
  assert.deepEqual(errorsOf(doc, { draft: true }), []);

  doc.questions = [];
  assertError(doc, /at least one question/, { draft: true });
});

test('draft mode does not relax any other rule', () => {
  const doc = validDoc();
  doc.questions = doc.questions.slice(0, 2);
  doc.questions[0].positions[0].justification = '';
  assertError(doc, /justification: is required/, { draft: true });
});

test('quiz, party and question basics are checked', () => {
  const doc = validDoc();
  doc.quiz.id = 0;
  doc.quiz.title = ' ';
  doc.parties.push({ id: 2, name: 'Inna' });
  doc.parties.push({ id: 3, name: 'partia a' });
  doc.questions[0].text = 'x'.repeat(501);
  doc.questions[1].weight = 4;
  doc.questions[2].id = 101;
  assertError(doc, /quiz\.id: must be a positive integer/);
  assertError(doc, /quiz\.title: is required/);
  assertError(doc, /duplicate party id 2/);
  assertError(doc, /duplicates "Partia A"/);
  assertError(doc, /text: must be at most 500 characters/);
  assertError(doc, /weight: must be a whole number from 1 to 3/);
  assertError(doc, /duplicate question id 101/);
});

test('party names collide ignoring case and accents, like the unique column', () => {
  const doc = validDoc();
  doc.parties[1].name = 'PÁRTIA a';
  assertError(doc, /duplicates "Partia A"/);
});

test('at least two parties are required', () => {
  const doc = validDoc();
  doc.parties = [doc.parties[0]];
  assertError(doc, /at least 2 parties/);
});

test('sources need a label and a real, non-future ISO date; a URL is optional but must be http(s)', () => {
  const doc = validDoc();
  doc.questions[0].source = { label: '', date: '2025-02-30' };
  doc.questions[1].source = source({ date: '2026-11-22' });
  doc.questions[2].source = source({ url: 'ftp://example.org/file' });
  doc.questions[3].source = source({ url: null });
  doc.questions[4].source = { label: 'Bez daty' };
  assertError(doc, /questions\[0\] \(id 101\)\.source\.label: is required/);
  assertError(doc, /questions\[0\] \(id 101\)\.source\.date: must be a valid date/);
  assertError(doc, /questions\[1\] \(id 102\)\.source\.date: is in the future/);
  assertError(doc, /questions\[2\] \(id 103\)\.source\.url: must be an http\(s\) URL/);
  assertError(doc, /questions\[4\] \(id 105\)\.source\.date: must be a valid date/);
  assert.ok(!errorsOf(doc).some((message) => /questions\[3\]/.test(message)));
});

test('every position needs a known party, a basis, a stance, a justification and a source', () => {
  const doc = validDoc();
  const positions = doc.questions[0].positions;
  positions[0] = { party: 9, basis: 'guess', stance: 'maybe' };
  positions.push(voteTwo());
  assertError(doc, /party: must be the id of a party listed in "parties"/);
  assertError(doc, /basis: must be one of: vote, declaration/);
  assertError(doc, /stance: must be one of: za, przeciw, wstrzymuje, brak/);
  assertError(doc, /justification: is required/);
  assertError(doc, /source: must be an object/);
  assertError(doc, /this party already has a position on this question/);
});

test('a justification is limited to 1000 characters', () => {
  const doc = validDoc();
  doc.questions[0].positions[0].justification = 'ż'.repeat(1001);
  assertError(doc, /justification: must be at most 1000 characters/);
  doc.questions[0].positions[0].justification = 'ż'.repeat(1000);
  assert.deepEqual(errorsOf(doc), []);
});

test('majority rule: more than half of the whole club, absent members count against', () => {
  assert.equal(deriveStance({ clubSize: 200, za: 101, przeciw: 0, wstrzymuje: 0 }), 'za');
  assert.equal(deriveStance({ clubSize: 200, za: 100, przeciw: 0, wstrzymuje: 0 }), 'brak');
  assert.equal(deriveStance({ clubSize: 200, za: 0, przeciw: 101, wstrzymuje: 0 }), 'przeciw');
  assert.equal(deriveStance({ clubSize: 200, za: 0, przeciw: 0, wstrzymuje: 101 }), 'wstrzymuje');
  // Plurality is not enough: 90 of 200 is the biggest group but not a majority.
  assert.equal(deriveStance({ clubSize: 200, za: 90, przeciw: 60, wstrzymuje: 10 }), 'brak');
});

test('votes must agree with the stated stance (boundary at exactly half)', () => {
  const doc = validDoc();
  const votes = (za, przeciw = 0, wstrzymuje = 0) => ({ clubSize: 200, za, przeciw, wstrzymuje });

  doc.questions[0].positions[1] = voteTwo({ stance: 'za', votes: votes(101) });
  assert.deepEqual(errorsOf(doc), []);

  doc.questions[0].positions[1] = voteTwo({ stance: 'za', votes: votes(100) });
  assertError(doc, /stance: is "za" but the votes give "brak"/);

  doc.questions[0].positions[1] = voteTwo({ stance: 'brak', votes: votes(100) });
  assert.deepEqual(errorsOf(doc), []);

  doc.questions[0].positions[1] = voteTwo({
    stance: 'wstrzymuje',
    votes: votes(10, 20, 101),
  });
  assert.deepEqual(errorsOf(doc), []);

  doc.questions[0].positions[1] = voteTwo({ stance: 'przeciw', votes: votes(150) });
  assertError(doc, /stance: is "przeciw" but the votes give "za"/);
});

test('vote counts must be whole numbers that fit the club', () => {
  const doc = validDoc();
  doc.questions[0].positions[1] = voteTwo({
    votes: { clubSize: 100, za: 90, przeciw: 20, wstrzymuje: 0 },
  });
  assertError(doc, /exceeds clubSize \(100\)/);

  doc.questions[0].positions[1] = voteTwo({
    votes: { clubSize: 0, za: -1, przeciw: 1.5, wstrzymuje: 0 },
  });
  assertError(doc, /votes\.clubSize: must be a positive whole number/);
  assertError(doc, /votes\.za: must be a whole number, 0 or more/);
  assertError(doc, /votes\.przeciw: must be a whole number, 0 or more/);
});

test('"brak" needs votes proving there is no majority', () => {
  const doc = validDoc();
  doc.questions[0].positions[0] = declarationOne({ stance: 'brak' });
  assertError(doc, /"brak" needs votes/);
});

test('votes are only allowed for vote-based positions', () => {
  const doc = validDoc();
  doc.questions[0].positions[1] = voteTwo({ basis: 'declaration' });
  assertError(doc, /votes are only allowed when basis is "vote"/);
});

test('a vote-based stance without votes is a warning, not an error', () => {
  const doc = validDoc();
  const { votes, ...withoutVotes } = voteTwo();
  void votes;
  doc.questions[0].positions[1] = withoutVotes;
  const result = check(doc);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /basis is "vote" but no votes are given/);
});

test('a party without any stance gets a warning', () => {
  const doc = validDoc();
  for (const item of doc.questions) item.positions = [declarationOne()];
  const { errors, warnings } = check(doc);
  assert.deepEqual(errors, []);
  assert.ok(
    warnings.some((message) =>
      /parties\[1\] \(id 2\): has no stance on any question/.test(message),
    ),
  );
});

test('a document that is not an object is rejected', () => {
  for (const doc of [null, [], 'x', 42]) {
    assert.ok(errorsOf(doc)[0].startsWith('document:'));
  }
});

test('SQL: sample is retired first, then the quiz is inserted in one transaction', () => {
  const sql = renderSeedSql(validDoc(), { sourceFile: 'content/quizzes/test.json' });
  const order = [
    'GENERATED from content/quizzes/test.json',
    'START TRANSACTION;',
    'DELETE FROM parties',
    'DELETE FROM quizzes WHERE is_sample = 1;',
    'INSERT INTO quizzes',
    'INSERT INTO parties',
    'INSERT INTO quiz_parties',
    'INSERT INTO questions',
    'INSERT INTO positions',
    'COMMIT;',
  ].map((needle) => {
    const index = sql.indexOf(needle);
    assert.notEqual(index, -1, `missing: ${needle}`);
    return index;
  });
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.match(sql, /\(101, 'Quiz', 'Opis', 0\)/);
  assert.match(sql, /\(101, 101, 1, 'Pytanie 101\?', 2,/);
  assert.match(sql, /\(108, 101, 8, 'Pytanie 108\?', 2,/);
});

test('SQL: only the parties of sample quizzes are deleted, and a party a real quiz uses is kept', () => {
  const sql = renderSeedSql(validDoc());
  // The broad "every party that is in no quiz" delete must not come back.
  assert.ok(!sql.includes('NOT IN (SELECT party_id FROM quiz_parties);'));
  assert.match(
    sql,
    /DELETE FROM parties\s+WHERE id IN \(SELECT party_id FROM quiz_parties WHERE quiz_id IN \(SELECT id FROM quizzes WHERE is_sample = 1\)\)\s+AND id NOT IN \(SELECT party_id FROM quiz_parties WHERE quiz_id IN \(SELECT id FROM quizzes WHERE is_sample = 0\)\);/,
  );
  // The parties go before the quizzes: the links that identify them vanish with the quiz.
  assert.ok(sql.indexOf('DELETE FROM parties') < sql.indexOf('DELETE FROM quizzes'));
});

test('SQL: quotes, backslashes, newlines and Polish characters are escaped', () => {
  const doc = validDoc();
  doc.quiz.title = "Żółć i O'Brien \\ test";
  doc.questions[0].positions[0].justification = 'Linia 1\nLinia 2 "cytat" \\';
  const sql = renderSeedSql(doc);
  assert.ok(sql.includes("'Żółć i O\\'Brien \\\\ test'"));
  assert.ok(sql.includes('\'Linia 1\\nLinia 2 \\"cytat\\" \\\\\''));
  // No raw newline may appear inside a string literal: every line is a statement or a row.
  assert.ok(!sql.includes('Linia 1\nLinia 2'));
});

test('SQL: a "brak" position writes no row, and missing urls become NULL', () => {
  const doc = validDoc();
  doc.questions[0].positions = [
    declarationOne(),
    voteTwo({ stance: 'brak', votes: { clubSize: 200, za: 100, przeciw: 0, wstrzymuje: 0 } }),
  ];
  const sql = renderSeedSql(doc);
  const positionsPart = sql.slice(sql.indexOf('INSERT INTO positions'));
  const rowsForQuestion101 = positionsPart
    .split('\n')
    .filter((line) => line.startsWith('  (101, '));
  assert.equal(rowsForQuestion101.length, 1);
  assert.match(
    rowsForQuestion101[0],
    /^ {2}\(101, 1, 'przeciw', 'Program wyborczy\.', 'Sejm, głosowanie nr 1', NULL, '2025-02-11'\)/,
  );
});

test('SQL: the output is byte-identical for the same input', () => {
  assert.equal(
    renderSeedSql(validDoc(), { sourceFile: 'a.json' }),
    renderSeedSql(validDoc(), { sourceFile: 'a.json' }),
  );
});

// --- CLI ---------------------------------------------------------------------------------------

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-cli-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runCli(argv) {
  const out = [];
  const err = [];
  const code = run(argv, { out: (line) => out.push(line), err: (line) => err.push(line) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function writeDoc(dir, doc, name = 'quiz.json') {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(doc), 'utf8');
  return file;
}

test('CLI check: exit 0 for valid content, 1 with the error list otherwise', () => {
  withTempDir((dir) => {
    const good = writeDoc(dir, validDoc(), 'good.json');
    assert.equal(runCli(['check', good]).code, 0);

    const doc = validDoc();
    doc.questions = doc.questions.slice(0, 2);
    const small = writeDoc(dir, doc, 'small.json');
    const strict = runCli(['check', small]);
    assert.equal(strict.code, 1);
    assert.match(strict.err, /ERROR questions: at least 8 questions are required/);
    assert.equal(runCli(['check', small, '--draft']).code, 0);
  });
});

test('CLI check: unreadable or non-JSON files give exit 1 without a stack trace', () => {
  withTempDir((dir) => {
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{ "quiz": ', 'utf8');
    const result = runCli(['check', bad]);
    assert.equal(result.code, 1);
    assert.match(result.err, /cannot read .* as JSON/);
    assert.equal(runCli(['check', path.join(dir, 'missing.json')]).code, 1);
  });
});

test('CLI build --draft prints the SQL and writes nothing', () => {
  withTempDir((dir) => {
    const file = writeDoc(dir, validDoc());
    const result = runCli(['build', file, '--draft']);
    assert.equal(result.code, 0);
    assert.match(result.out, /START TRANSACTION;/);
    assert.deepEqual(fs.readdirSync(dir), ['quiz.json']);
  });
});

test('CLI build refuses --out together with --draft', () => {
  withTempDir((dir) => {
    const file = writeDoc(dir, validDoc());
    const out = path.join(dir, '0008_seed.sql');
    const result = runCli(['build', file, '--draft', '--out', out]);
    assert.equal(result.code, 2);
    assert.match(result.err, /--draft never writes a migration/);
    assert.equal(fs.existsSync(out), false);
  });
});

test('CLI build writes the migration, and never overwrites or invents names', () => {
  withTempDir((dir) => {
    const file = writeDoc(dir, validDoc());
    const out = path.join(dir, '0008_seed_real_quiz.sql');

    assert.equal(runCli(['build', file]).code, 2); // neither --out nor --draft
    assert.equal(runCli(['build', file, '--out', path.join(dir, 'seed.sql')]).code, 2); // name pattern

    const first = runCli(['build', file, '--out', out]);
    assert.equal(first.code, 0);
    assert.match(fs.readFileSync(out, 'utf8'), /COMMIT;\n$/);

    const second = runCli(['build', file, '--out', out]);
    assert.equal(second.code, 2);
    assert.match(second.err, /already exists/);
  });
});

test('CLI build writes nothing when the content is invalid', () => {
  withTempDir((dir) => {
    const doc = validDoc();
    doc.questions[0].weight = 9;
    const file = writeDoc(dir, doc);
    const out = path.join(dir, '0008_seed_real_quiz.sql');
    const result = runCli(['build', file, '--out', out]);
    assert.equal(result.code, 1);
    assert.equal(fs.existsSync(out), false);
  });
});

test('CLI usage errors exit with 2', () => {
  assert.equal(runCli([]).code, 2);
  assert.equal(runCli(['check']).code, 2);
  assert.equal(runCli(['frobnicate', 'x.json']).code, 2);
  assert.equal(runCli(['check', 'x.json', '--bogus']).code, 2);
  assert.equal(runCli(['check', 'x.json', '--out', 'y.sql']).code, 2);
});

test('the shipped template passes in draft mode and fails in strict mode', () => {
  const template = path.join(__dirname, '..', '..', 'content', 'quizzes', '_template.json');
  assert.equal(runCli(['check', template, '--draft']).code, 0);
  const strict = runCli(['check', template]);
  assert.equal(strict.code, 1);
  assert.match(strict.err, /at least 8 questions/);
});

test('every committed content file passes the strict check with no warnings', () => {
  const dir = path.join(__dirname, '..', '..', 'content', 'quizzes');
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && !name.startsWith('_')); // _template.json is a draft
  // Real content must exist: the seed migration is generated from it.
  assert.ok(files.length > 0, 'no content/quizzes/*.json file found');
  for (const name of files) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/^﻿/, '');
    const { errors, warnings } = validateContent(JSON.parse(text));
    assert.deepEqual({ errors, warnings }, { errors: [], warnings: [] }, name);
  }
});
