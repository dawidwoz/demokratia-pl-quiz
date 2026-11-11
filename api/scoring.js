'use strict';

// Party-agreement formula (PRD Business Logic, context/foundation/prd.md:116-122).
// Pure and dependency-free on purpose: every party goes through the same code path (neutrality),
// and it is unit-tested with `node --test` without a database.

const STANCES = ['za', 'przeciw', 'wstrzymuje'];

// Full agreement = 1; za<->wstrzymuje and przeciw<->wstrzymuje = 0.25; za<->przeciw = 0.
// przeciw<->wstrzymuje is not in the PRD text: symmetric choice made in S-01 planning.
const PARTIAL_AGREEMENT = 0.25;

function agreement(answer, stance) {
  if (answer === stance) return 1;
  if (answer === 'wstrzymuje' || stance === 'wstrzymuje') return PARTIAL_AGREEMENT;
  return 0;
}

function assertStance(value, what) {
  if (!STANCES.includes(value)) {
    throw new RangeError(`${what} must be one of ${STANCES.join(', ')}`);
  }
}

/**
 * @param {object} input
 * @param {{id: number|string, weight: number}[]} input.questions weights are integers 1..3
 * @param {{id: number|string, positions: Record<string, string>}[]} input.parties
 *   positions maps questionId -> stance; a missing key means the party has no stance on it
 * @param {Record<string, string>} input.answers questionId -> answer; a missing key means skipped
 * @returns {{status: 'ok', answered: number, total: number,
 *   parties: {id: number|string, fraction: number|null, counted: number}[]}
 *   | {status: 'insufficient_answers', answered: number, total: number}}
 */
function computeResult({ questions, parties, answers }) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new RangeError('questions must be a non-empty array');
  }

  const weights = new Map();
  for (const question of questions) {
    if (!Number.isInteger(question.weight) || question.weight < 1 || question.weight > 3) {
      throw new RangeError('question weight must be an integer from 1 to 3');
    }
    weights.set(String(question.id), question.weight);
  }

  const answeredIds = Object.keys(answers);
  for (const id of answeredIds) {
    if (!weights.has(id)) throw new RangeError('answer for an unknown question');
    assertStance(answers[id], 'answer');
  }

  const total = questions.length;
  const answered = answeredIds.length;
  // "At least half answered": 8 questions need 4, 9 questions need 5.
  if (answered * 2 < total) return { status: 'insufficient_answers', answered, total };

  const results = parties.map((party) => {
    let matched = 0;
    let possible = 0;
    let counted = 0;
    for (const id of answeredIds) {
      if (!Object.hasOwn(party.positions, id)) continue; // no stance: question excluded for this party
      assertStance(party.positions[id], 'position');
      const weight = weights.get(id);
      matched += weight * agreement(answers[id], party.positions[id]);
      possible += weight;
      counted += 1;
    }
    return { id: party.id, fraction: counted === 0 ? null : matched / possible, counted };
  });

  return { status: 'ok', answered, total, parties: results };
}

module.exports = { computeResult, STANCES };
