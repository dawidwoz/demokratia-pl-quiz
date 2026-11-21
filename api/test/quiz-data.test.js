'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assembleScoringData } = require('../quiz-data');

const questionRows = [
  { id: 11, weight: 2 },
  { id: 12, weight: 3 },
  { id: 13, weight: 1 },
];
const partyRows = [
  { id: 1, name: 'A' },
  { id: 2, name: 'B' },
  { id: 3, name: 'C' },
];

function position(questionId, partyId, overrides = {}) {
  return {
    question_id: questionId,
    party_id: partyId,
    stance: 'za',
    justification: `Uzasadnienie ${partyId}/${questionId}`,
    source_label: 'Źródło',
    source_url: 'https://example.org/',
    source_date: '2025-03-05',
    ...overrides,
  };
}

test('keeps what the formula needs: weights in quiz order and a stance map per party', () => {
  const data = assembleScoringData(questionRows, partyRows, [
    position(11, 1),
    position(12, 1, { stance: 'przeciw' }),
    position(11, 2, { stance: 'wstrzymuje' }),
  ]);
  assert.deepEqual(data.questions, [
    { id: 11, weight: 2 },
    { id: 12, weight: 3 },
    { id: 13, weight: 1 },
  ]);
  assert.deepEqual(data.parties, [
    { id: 1, name: 'A', positions: { 11: 'za', 12: 'przeciw' } },
    { id: 2, name: 'B', positions: { 11: 'wstrzymuje' } },
    { id: 3, name: 'C', positions: {} },
  ]);
});

test('details cover every question in quiz order, positions ordered by party id', () => {
  // Rows arrive in an arbitrary order from the database.
  const data = assembleScoringData(questionRows, partyRows, [
    position(12, 3),
    position(11, 2),
    position(11, 1),
    position(12, 1),
  ]);
  assert.deepEqual(
    data.details.map((detail) => detail.questionId),
    [11, 12, 13],
  );
  assert.deepEqual(
    data.details[0].positions.map((p) => p.partyId),
    [1, 2],
  );
  assert.deepEqual(
    data.details[1].positions.map((p) => p.partyId),
    [1, 3],
  );
  assert.deepEqual(data.details[2].positions, []); // a question nobody has a stance on
});

test('a position carries stance, justification and the source with url and date', () => {
  const data = assembleScoringData(questionRows, partyRows, [position(11, 1)]);
  assert.deepEqual(data.details[0].positions, [
    {
      partyId: 1,
      stance: 'za',
      justification: 'Uzasadnienie 1/11',
      source: { label: 'Źródło', url: 'https://example.org/', date: '2025-03-05' },
    },
  ]);
});

test('a missing justification or url is returned as null, never undefined', () => {
  const data = assembleScoringData(questionRows, partyRows, [
    position(11, 1, { justification: null, source_url: null }),
  ]);
  const [only] = data.details[0].positions;
  assert.equal(only.justification, null);
  assert.equal(only.source.url, null);
});

test('positions of parties outside the quiz, or of unknown questions, are ignored', () => {
  const data = assembleScoringData(questionRows, partyRows, [
    position(11, 99), // party not linked to this quiz
    position(99, 1), // question not in this quiz
    position(11, 1),
  ]);
  assert.deepEqual(
    data.details[0].positions.map((p) => p.partyId),
    [1],
  );
  assert.deepEqual(data.parties[0].positions, { 11: 'za' });
  assert.deepEqual(
    data.details.map((detail) => detail.questionId),
    [11, 12, 13],
  );
});
