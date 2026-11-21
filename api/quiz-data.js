'use strict';

// Read-only data access for the quiz API (plain mysql2, no ORM). The only module of the quiz slice
// that touches the database; handler.js receives it as `data` so tests can pass a fake.
// Nothing here writes: user answers are never stored (PRD NFR).

const { query } = require('./db');

async function listQuizzes() {
  const [rows] = await query(
    'SELECT q.id, q.title, q.description, q.is_sample, COUNT(qs.id) AS question_count ' +
      'FROM quizzes q LEFT JOIN questions qs ON qs.quiz_id = q.id ' +
      // Quizzes without questions are not playable, so they are not offered.
      'GROUP BY q.id, q.title, q.description, q.is_sample HAVING COUNT(qs.id) > 0 ORDER BY q.id',
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    isSample: Boolean(row.is_sample),
    questionCount: Number(row.question_count),
  }));
}

// Quiz for the client: questions with their source, parties; no weights and no stances.
async function getQuiz(id) {
  const [quizRows] = await query('SELECT id, title, is_sample FROM quizzes WHERE id = ?', [id]);
  if (quizRows.length === 0) return null;
  const [questionRows, partyRows] = await Promise.all([
    query(
      'SELECT id, text, source_label, source_url, ' +
        "DATE_FORMAT(source_date, '%Y-%m-%d') AS source_date " +
        'FROM questions WHERE quiz_id = ? ORDER BY sort_order',
      [id],
    ).then(([rows]) => rows),
    query(
      'SELECT p.id, p.name FROM parties p JOIN quiz_parties qp ON qp.party_id = p.id ' +
        'WHERE qp.quiz_id = ? ORDER BY p.id',
      [id],
    ).then(([rows]) => rows),
  ]);
  if (questionRows.length === 0) return null; // not playable: same as an unknown quiz
  return {
    id: quizRows[0].id,
    title: quizRows[0].title,
    isSample: Boolean(quizRows[0].is_sample),
    questions: questionRows.map((row) => ({
      id: row.id,
      text: row.text,
      source: { label: row.source_label, url: row.source_url, date: row.source_date },
    })),
    parties: partyRows.map((row) => ({ id: row.id, name: row.name })),
  };
}

// Everything the formula needs: question weights and each party's stances (missing = no stance).
async function getScoringData(id) {
  const [quizRows] = await query('SELECT id FROM quizzes WHERE id = ?', [id]);
  if (quizRows.length === 0) return null;
  const [[questionRows], [partyRows], [positionRows]] = await Promise.all([
    query('SELECT id, weight FROM questions WHERE quiz_id = ? ORDER BY sort_order', [id]),
    query(
      'SELECT p.id, p.name FROM parties p JOIN quiz_parties qp ON qp.party_id = p.id ' +
        'WHERE qp.quiz_id = ? ORDER BY p.id',
      [id],
    ),
    query(
      'SELECT pos.question_id, pos.party_id, pos.stance FROM positions pos ' +
        'JOIN questions q ON q.id = pos.question_id WHERE q.quiz_id = ?',
      [id],
    ),
  ]);
  if (questionRows.length === 0) return null; // not playable: same as an unknown quiz
  const parties = partyRows.map((row) => ({ id: row.id, name: row.name, positions: {} }));
  const byId = new Map(parties.map((party) => [party.id, party]));
  for (const row of positionRows) {
    const party = byId.get(row.party_id);
    if (party) party.positions[row.question_id] = row.stance;
  }
  return {
    questions: questionRows.map((row) => ({ id: row.id, weight: row.weight })),
    parties,
  };
}

module.exports = { listQuizzes, getQuiz, getScoringData };
