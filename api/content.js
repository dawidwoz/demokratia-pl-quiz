'use strict';

// Content intake for real quizzes: validates a content/quizzes/<slug>.json document and renders the
// seed migration from it. Pure; no I/O. The file format is documented in content/README.md.

const { escape } = require('mysql2');
const { STANCES } = require('./scoring');

const MIN_QUESTIONS = 8;
const MIN_PARTIES = 2;
const BASES = ['vote', 'declaration'];
const POSITION_STANCES = [...STANCES, 'brak'];
const VOTE_KEYS = ['clubSize', ...STANCES];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPositiveInt = (value) => Number.isInteger(value) && value > 0;
const isNonNegativeInt = (value) => Number.isInteger(value) && value >= 0;
const isText = (value) => typeof value === 'string' && value.trim() !== '';
// VARCHAR limits count characters, not UTF-16 units.
const textLength = (value) => Array.from(value).length;

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isHttpUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// Approximates the case- and accent-insensitive uniqueness of the parties.name column.
const nameKey = (name) => name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// The stance a club's vote counts support: an option needs more than half of the WHOLE club
// (absent members count against it); otherwise the club has no stance ('brak').
function deriveStance(votes) {
  for (const option of STANCES) {
    if (votes[option] * 2 > votes.clubSize) return option;
  }
  return 'brak';
}

/**
 * @param {unknown} doc parsed content JSON
 * @param {{draft?: boolean, today?: string}} [options] draft relaxes only the 8-question minimum;
 *   today (YYYY-MM-DD) is injectable for tests
 * @returns {{errors: string[], warnings: string[]}}
 */
function validateContent(doc, options = {}) {
  const { draft = false, today = new Date().toISOString().slice(0, 10) } = options;
  const errors = [];
  const warnings = [];
  const fail = (path, message) => errors.push(`${path}: ${message}`);

  // Keys starting with "_" are free-form notes; any other unknown key is most likely a typo.
  function checkKeys(value, allowed, path) {
    for (const key of Object.keys(value)) {
      if (!key.startsWith('_') && !allowed.includes(key)) {
        fail(path, `unknown field "${key}" (allowed: ${allowed.join(', ')})`);
      }
    }
  }

  function checkSource(source, path) {
    if (!isObject(source))
      return fail(path, 'must be an object with label, url (optional) and date');
    checkKeys(source, ['label', 'url', 'date'], path);
    if (!isText(source.label)) fail(`${path}.label`, 'is required');
    else if (textLength(source.label) > 255)
      fail(`${path}.label`, 'must be at most 255 characters');
    if (source.url !== undefined && source.url !== null) {
      if (typeof source.url !== 'string' || !isHttpUrl(source.url)) {
        fail(`${path}.url`, 'must be an http(s) URL or omitted');
      } else if (textLength(source.url) > 500) {
        fail(`${path}.url`, 'must be at most 500 characters');
      }
    }
    if (!isIsoDate(source.date)) fail(`${path}.date`, 'must be a valid date written as YYYY-MM-DD');
    else if (source.date > today) fail(`${path}.date`, `is in the future (today is ${today})`);
  }

  if (!isObject(doc)) {
    fail('document', 'must be a JSON object with quiz, parties and questions');
    return { errors, warnings };
  }
  checkKeys(doc, ['quiz', 'parties', 'questions'], 'document');

  // quiz
  if (!isObject(doc.quiz)) fail('quiz', 'is required (id, title, description)');
  else {
    checkKeys(doc.quiz, ['id', 'title', 'description'], 'quiz');
    if (!isPositiveInt(doc.quiz.id)) fail('quiz.id', 'must be a positive integer');
    if (!isText(doc.quiz.title)) fail('quiz.title', 'is required');
    else if (textLength(doc.quiz.title) > 200) fail('quiz.title', 'must be at most 200 characters');
    const { description } = doc.quiz;
    if (description !== undefined && description !== null && typeof description !== 'string') {
      fail('quiz.description', 'must be text or omitted');
    }
  }

  // parties
  const partyIds = new Set();
  if (!Array.isArray(doc.parties)) fail('parties', 'must be a list');
  else {
    if (doc.parties.length < MIN_PARTIES) {
      fail('parties', `at least ${MIN_PARTIES} parties are required (found ${doc.parties.length})`);
    }
    const names = new Map();
    doc.parties.forEach((party, index) => {
      const path = `parties[${index}]`;
      if (!isObject(party)) return fail(path, 'must be an object with id and name');
      checkKeys(party, ['id', 'name'], path);
      if (!isPositiveInt(party.id)) fail(`${path}.id`, 'must be a positive integer');
      else if (partyIds.has(party.id)) fail(`${path}.id`, `duplicate party id ${party.id}`);
      else partyIds.add(party.id);
      if (!isText(party.name)) return fail(`${path}.name`, 'is required');
      if (textLength(party.name) > 120) fail(`${path}.name`, 'must be at most 120 characters');
      const key = nameKey(party.name);
      if (names.has(key)) {
        fail(
          `${path}.name`,
          `"${party.name}" duplicates "${names.get(key)}" (names are unique, ignoring case and accents)`,
        );
      } else names.set(key, party.name);
    });
  }

  // questions and positions
  const partiesWithStance = new Set();
  if (!Array.isArray(doc.questions)) fail('questions', 'must be a list');
  else {
    if (doc.questions.length === 0) fail('questions', 'at least one question is required');
    else if (!draft && doc.questions.length < MIN_QUESTIONS) {
      fail(
        'questions',
        `at least ${MIN_QUESTIONS} questions are required (found ${doc.questions.length}); use --draft only to preview`,
      );
    }
    const questionIds = new Set();
    doc.questions.forEach((question, qIndex) => {
      let path = `questions[${qIndex}]`;
      if (!isObject(question)) return fail(path, 'must be an object');
      if (isPositiveInt(question.id)) path += ` (id ${question.id})`;
      checkKeys(question, ['id', 'text', 'weight', 'source', 'positions'], path);
      if (!isPositiveInt(question.id)) fail(`${path}.id`, 'must be a positive integer');
      else if (questionIds.has(question.id))
        fail(`${path}.id`, `duplicate question id ${question.id}`);
      else questionIds.add(question.id);
      if (!isText(question.text)) fail(`${path}.text`, 'is required');
      else if (textLength(question.text) > 500)
        fail(`${path}.text`, 'must be at most 500 characters');
      if (!Number.isInteger(question.weight) || question.weight < 1 || question.weight > 3) {
        fail(`${path}.weight`, 'must be a whole number from 1 to 3');
      }
      checkSource(question.source, `${path}.source`);

      if (!Array.isArray(question.positions)) return fail(`${path}.positions`, 'must be a list');
      const seenParties = new Set();
      question.positions.forEach((position, pIndex) => {
        let pPath = `${path}.positions[${pIndex}]`;
        if (!isObject(position)) return fail(pPath, 'must be an object');
        if (isPositiveInt(position.party)) pPath += ` (party ${position.party})`;
        checkKeys(
          position,
          ['party', 'basis', 'stance', 'votes', 'justification', 'source'],
          pPath,
        );

        if (!isPositiveInt(position.party) || !partyIds.has(position.party)) {
          fail(`${pPath}.party`, 'must be the id of a party listed in "parties"');
        } else if (seenParties.has(position.party)) {
          fail(`${pPath}.party`, 'this party already has a position on this question');
        } else seenParties.add(position.party);

        if (!BASES.includes(position.basis))
          fail(`${pPath}.basis`, `must be one of: ${BASES.join(', ')}`);
        if (!POSITION_STANCES.includes(position.stance)) {
          fail(`${pPath}.stance`, `must be one of: ${POSITION_STANCES.join(', ')}`);
        }

        if (!isText(position.justification)) fail(`${pPath}.justification`, 'is required');
        else if (textLength(position.justification) > 1000) {
          fail(`${pPath}.justification`, 'must be at most 1000 characters');
        }
        checkSource(position.source, `${pPath}.source`);

        let derived = null;
        if (position.votes !== undefined) {
          const votes = position.votes;
          if (!isObject(votes))
            fail(`${pPath}.votes`, 'must be an object with clubSize, za, przeciw, wstrzymuje');
          else {
            checkKeys(votes, VOTE_KEYS, `${pPath}.votes`);
            // Check every count (no short-circuit) so one run reports all of them.
            const countsValid = VOTE_KEYS.map((key) => {
              const ok =
                key === 'clubSize' ? isPositiveInt(votes[key]) : isNonNegativeInt(votes[key]);
              if (!ok) {
                fail(
                  `${pPath}.votes.${key}`,
                  key === 'clubSize'
                    ? 'must be a positive whole number'
                    : 'must be a whole number, 0 or more',
                );
              }
              return ok;
            }).every(Boolean);
            if (countsValid) {
              const cast = votes.za + votes.przeciw + votes.wstrzymuje;
              if (cast > votes.clubSize) {
                fail(
                  `${pPath}.votes`,
                  `za + przeciw + wstrzymuje (${cast}) exceeds clubSize (${votes.clubSize})`,
                );
              } else derived = deriveStance(votes);
            }
            if (position.basis === 'declaration') {
              fail(`${pPath}.votes`, 'votes are only allowed when basis is "vote"');
            }
          }
        }
        if (
          derived !== null &&
          POSITION_STANCES.includes(position.stance) &&
          derived !== position.stance
        ) {
          const half = position.votes.clubSize / 2;
          fail(
            `${pPath}.stance`,
            `is "${position.stance}" but the votes give "${derived}" (a stance needs more than ${half} of ${position.votes.clubSize} club members)`,
          );
        }
        if (position.stance === 'brak' && position.votes === undefined) {
          fail(
            `${pPath}.stance`,
            '"brak" needs votes showing that no option has a majority; if the party simply has no stance, leave the position out',
          );
        }
        if (position.basis === 'vote' && position.votes === undefined) {
          warnings.push(
            `${pPath}: basis is "vote" but no votes are given, so the majority rule is not checked`,
          );
        }
        if (position.stance !== 'brak' && isPositiveInt(position.party))
          partiesWithStance.add(position.party);
      });
    });
  }

  if (Array.isArray(doc.parties) && Array.isArray(doc.questions) && doc.questions.length > 0) {
    doc.parties.forEach((party, index) => {
      if (isObject(party) && partyIds.has(party.id) && !partiesWithStance.has(party.id)) {
        warnings.push(
          `parties[${index}] (id ${party.id}): has no stance on any question, so it would always show "brak danych"`,
        );
      }
    });
  }

  return { errors, warnings };
}

/**
 * Renders the seed migration for a document that passed validateContent.
 * Deterministic: the same document always gives the same bytes.
 */
function renderSeedSql(doc, { sourceFile = 'content file' } = {}) {
  const row = (values) => `  (${values.map((value) => escape(value ?? null)).join(', ')})`;
  const insert = (table, columns, rows) =>
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${rows.map(row).join(',\n')};`;
  const source = String(sourceFile).replace(/[\r\n]+/g, ' ');

  const quizId = doc.quiz.id;
  const positionRows = [];
  for (const question of doc.questions) {
    for (const position of question.positions) {
      if (position.stance === 'brak') continue; // no row means "party has no stance"
      positionRows.push([
        question.id,
        position.party,
        position.stance,
        position.justification,
        position.source.label,
        position.source.url,
        position.source.date,
      ]);
    }
  }

  const parts = [
    `-- GENERATED from ${source} by api/scripts/build-content-migration.js. Do not edit this file:`,
    '-- correct the JSON and add a new migration instead (an applied migration is never re-run).',
    '-- Retires the sample quiz (is_sample = 1) and any party left without a quiz, then inserts the real quiz.',
    '-- Data statements only, in one transaction: any error aborts the file and closing the connection',
    '-- rolls everything back (api/migrate.js records a file only after it succeeded).',
    '',
    'START TRANSACTION;',
    '',
    'DELETE FROM quizzes WHERE is_sample = 1;',
    'DELETE FROM parties WHERE id NOT IN (SELECT party_id FROM quiz_parties);',
    '',
    insert(
      'quizzes',
      ['id', 'title', 'description', 'is_sample'],
      [[quizId, doc.quiz.title, doc.quiz.description, 0]],
    ),
    '',
    insert(
      'parties',
      ['id', 'name'],
      doc.parties.map((party) => [party.id, party.name]),
    ),
    '',
    insert(
      'quiz_parties',
      ['quiz_id', 'party_id'],
      doc.parties.map((party) => [quizId, party.id]),
    ),
    '',
    insert(
      'questions',
      [
        'id',
        'quiz_id',
        'sort_order',
        'text',
        'weight',
        'source_label',
        'source_url',
        'source_date',
      ],
      doc.questions.map((question, index) => [
        question.id,
        quizId,
        index + 1,
        question.text,
        question.weight,
        question.source.label,
        question.source.url,
        question.source.date,
      ]),
    ),
  ];
  if (positionRows.length > 0) {
    parts.push(
      '',
      insert(
        'positions',
        [
          'question_id',
          'party_id',
          'stance',
          'justification',
          'source_label',
          'source_url',
          'source_date',
        ],
        positionRows,
      ),
    );
  }
  parts.push('', 'COMMIT;', '');
  return parts.join('\n');
}

module.exports = { validateContent, renderSeedSql, deriveStance, MIN_QUESTIONS };
