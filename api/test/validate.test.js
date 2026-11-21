'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAnswers, InvalidRequestError } = require('../validate');

const ids = [1, 2, 3, 4];

function rejects(body) {
  assert.throws(() => parseAnswers(body, ids), InvalidRequestError);
}

test('returns answers keyed by question id; skipped questions are absent', () => {
  const result = parseAnswers(
    {
      answers: [
        { questionId: 1, answer: 'za' },
        { questionId: 3, answer: 'wstrzymuje' },
      ],
    },
    ids,
  );
  assert.deepEqual(result, { 1: 'za', 3: 'wstrzymuje' });
});

test('an empty answers array is valid (the half-answered gate is the scorer’s job)', () => {
  assert.deepEqual(parseAnswers({ answers: [] }, ids), {});
});

test('rejects a body that is not an object', () => {
  rejects(null);
  rejects('za');
  rejects([]);
  rejects(42);
});

test('rejects missing or non-array answers', () => {
  rejects({});
  rejects({ answers: 'za' });
  rejects({ answers: { 1: 'za' } });
});

test('rejects an answer item that is not an object', () => {
  rejects({ answers: ['za'] });
  rejects({ answers: [null] });
  rejects({ answers: [[1, 'za']] });
});

test('rejects an unknown, foreign or non-integer questionId', () => {
  rejects({ answers: [{ questionId: 99, answer: 'za' }] });
  rejects({ answers: [{ questionId: '1', answer: 'za' }] });
  rejects({ answers: [{ questionId: 1.5, answer: 'za' }] });
  rejects({ answers: [{ answer: 'za' }] });
});

test('rejects an answer value outside za / przeciw / wstrzymuje', () => {
  rejects({ answers: [{ questionId: 1, answer: 'maybe' }] });
  rejects({ answers: [{ questionId: 1 }] });
  rejects({ answers: [{ questionId: 1, answer: null }] });
});

test('rejects a duplicate questionId', () => {
  rejects({
    answers: [
      { questionId: 1, answer: 'za' },
      { questionId: 1, answer: 'przeciw' },
    ],
  });
});

test('rejects more answers than questions', () => {
  rejects({ answers: [1, 2, 3, 4, 5].map((questionId) => ({ questionId, answer: 'za' })) });
});
