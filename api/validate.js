'use strict';

// Request validation for POST /api/quizzes/:id/result. Pure; no I/O.

const { STANCES } = require('./scoring');

class InvalidRequestError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'InvalidRequestError';
    this.code = 'invalid_request';
    this.reason = reason;
  }
}

// body: parsed JSON. validQuestionIds: ids of the quiz's questions (numbers).
// Returns answers as { [questionId]: answer }; skipped questions are simply absent.
function parseAnswers(body, validQuestionIds) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new InvalidRequestError('body must be an object');
  }
  const { answers } = body;
  if (!Array.isArray(answers)) throw new InvalidRequestError('answers must be an array');
  if (answers.length > validQuestionIds.length) {
    throw new InvalidRequestError('more answers than questions');
  }

  const allowed = new Set(validQuestionIds);
  const result = {};
  for (const item of answers) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new InvalidRequestError('each answer must be an object');
    }
    const { questionId, answer } = item;
    if (!Number.isInteger(questionId) || !allowed.has(questionId)) {
      throw new InvalidRequestError('unknown questionId');
    }
    if (!STANCES.includes(answer)) throw new InvalidRequestError('invalid answer value');
    if (Object.hasOwn(result, questionId)) throw new InvalidRequestError('duplicate questionId');
    result[questionId] = answer;
  }
  return result;
}

module.exports = { parseAnswers, InvalidRequestError };
