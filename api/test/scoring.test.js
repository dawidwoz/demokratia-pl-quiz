'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeResult } = require('../scoring');

// Four questions of weights 1, 2, 3, 1. Question ids are numbers; answers/positions are keyed by string.
const questions = [
  { id: 1, weight: 1 },
  { id: 2, weight: 2 },
  { id: 3, weight: 3 },
  { id: 4, weight: 1 },
];

function only(result, partyId) {
  assert.equal(result.status, 'ok');
  return result.parties.find((party) => party.id === partyId);
}

test('same answer on every question gives full agreement', () => {
  const party = { id: 'a', positions: { 1: 'za', 2: 'przeciw', 3: 'wstrzymuje', 4: 'za' } };
  const answers = { 1: 'za', 2: 'przeciw', 3: 'wstrzymuje', 4: 'za' };
  assert.deepEqual(only(computeResult({ questions, parties: [party], answers }), 'a'), {
    id: 'a',
    fraction: 1,
    counted: 4,
  });
});

test('za against przeciw on every question gives zero', () => {
  const party = { id: 'a', positions: { 1: 'za', 2: 'za', 3: 'za', 4: 'za' } };
  const answers = { 1: 'przeciw', 2: 'przeciw', 3: 'przeciw', 4: 'przeciw' };
  assert.equal(only(computeResult({ questions, parties: [party], answers }), 'a').fraction, 0);
});

test('za<->wstrzymuje counts 0.25 in both directions', () => {
  const answers = { 1: 'za', 2: 'wstrzymuje' };
  const party = { id: 'a', positions: { 1: 'wstrzymuje', 2: 'za' } };
  const result = computeResult({ questions: questions.slice(0, 2), parties: [party], answers });
  // weights 1 and 2, each worth 0.25: (0.25 + 0.5) / 3
  assert.equal(only(result, 'a').fraction, 0.25);
});

test('przeciw<->wstrzymuje counts 0.25, same as za<->wstrzymuje (symmetric)', () => {
  const answers = { 1: 'przeciw', 2: 'wstrzymuje' };
  const party = { id: 'a', positions: { 1: 'wstrzymuje', 2: 'przeciw' } };
  const result = computeResult({ questions: questions.slice(0, 2), parties: [party], answers });
  assert.equal(only(result, 'a').fraction, 0.25);
});

test('weights change the result: matching the weight-3 question outweighs missing weight-1', () => {
  // answers: q1 (w1) za, q3 (w3) przeciw. Party: q1 przeciw (0), q3 przeciw (1) => 3 / 4
  const party = { id: 'a', positions: { 1: 'przeciw', 3: 'przeciw' } };
  const result = computeResult({ questions, parties: [party], answers: { 1: 'za', 3: 'przeciw' } });
  assert.equal(only(result, 'a').fraction, 0.75);
});

test('skipped questions are excluded from numerator and denominator', () => {
  const party = { id: 'a', positions: { 1: 'za', 2: 'za', 3: 'za', 4: 'za' } };
  // q2 and q4 skipped; q1 matches (w1), q3 opposite (w3) => 1 / 4
  const result = computeResult({ questions, parties: [party], answers: { 1: 'za', 3: 'przeciw' } });
  assert.deepEqual(only(result, 'a'), { id: 'a', fraction: 0.25, counted: 2 });
});

test('a question without a party stance is excluded for that party only', () => {
  const withStance = { id: 'a', positions: { 1: 'za', 2: 'przeciw' } };
  const noStanceOnQ2 = { id: 'b', positions: { 1: 'za' } };
  const answers = { 1: 'za', 2: 'za' };
  const result = computeResult({ questions, parties: [withStance, noStanceOnQ2], answers });
  // a: q1 match (w1), q2 opposite (w2) => 1/3; b: only q1 counts => 1
  assert.deepEqual(only(result, 'a'), { id: 'a', fraction: 1 / 3, counted: 2 });
  assert.deepEqual(only(result, 'b'), { id: 'b', fraction: 1, counted: 1 });
});

test('a party with no stance on any answered question gets null, not 0', () => {
  const party = { id: 'a', positions: { 4: 'za' } };
  const result = computeResult({ questions, parties: [party], answers: { 1: 'za', 2: 'za' } });
  assert.deepEqual(only(result, 'a'), { id: 'a', fraction: null, counted: 0 });
});

test('gate with an even total: 4 of 8 answered is enough, 3 of 8 is not', () => {
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, weight: 1 }));
  const party = { id: 'a', positions: {} };
  const answer = (count) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [i + 1, 'za']));
  assert.equal(
    computeResult({ questions: eight, parties: [party], answers: answer(4) }).status,
    'ok',
  );
  assert.deepEqual(computeResult({ questions: eight, parties: [party], answers: answer(3) }), {
    status: 'insufficient_answers',
    answered: 3,
    total: 8,
  });
});

test('gate with an odd total: 4 of 9 is not enough, 5 of 9 is', () => {
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, weight: 1 }));
  const party = { id: 'a', positions: {} };
  const answer = (count) =>
    Object.fromEntries(Array.from({ length: count }, (_, i) => [i + 1, 'za']));
  assert.equal(
    computeResult({ questions: nine, parties: [party], answers: answer(4) }).status,
    'insufficient_answers',
  );
  assert.equal(
    computeResult({ questions: nine, parties: [party], answers: answer(5) }).status,
    'ok',
  );
});

test('wstrzymuje counts as answered for the gate', () => {
  const party = { id: 'a', positions: {} };
  const answers = { 1: 'wstrzymuje', 2: 'wstrzymuje' };
  const result = computeResult({ questions, parties: [party], answers });
  assert.equal(result.status, 'ok');
  assert.equal(result.answered, 2);
});

test('result does not depend on party or question order (neutrality)', () => {
  const parties = [
    { id: 'a', positions: { 1: 'za', 2: 'przeciw', 3: 'za' } },
    { id: 'b', positions: { 1: 'przeciw', 2: 'wstrzymuje', 4: 'za' } },
    { id: 'c', positions: { 1: 'za', 2: 'za', 3: 'przeciw', 4: 'przeciw' } },
  ];
  const answers = { 1: 'za', 2: 'przeciw', 3: 'przeciw', 4: 'wstrzymuje' };
  const forward = computeResult({ questions, parties, answers });
  const shuffled = computeResult({
    questions: [...questions].reverse(),
    parties: [...parties].reverse(),
    answers,
  });
  const byId = (result) => Object.fromEntries(result.parties.map((p) => [p.id, p]));
  assert.deepEqual(byId(shuffled), byId(forward));
});

test('invalid input throws RangeError', () => {
  const party = { id: 'a', positions: {} };
  assert.throws(() => computeResult({ questions: [], parties: [party], answers: {} }), RangeError);
  assert.throws(
    () => computeResult({ questions: [{ id: 1, weight: 4 }], parties: [party], answers: {} }),
    RangeError,
  );
  assert.throws(
    () => computeResult({ questions, parties: [party], answers: { 99: 'za' } }),
    RangeError,
  );
  assert.throws(
    () => computeResult({ questions, parties: [party], answers: { 1: 'maybe' } }),
    RangeError,
  );
});
