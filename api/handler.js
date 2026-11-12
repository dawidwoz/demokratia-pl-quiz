'use strict';

// Request handler for the API, separate from app.js so tests can import it without opening a port.
// app.js stays the always-listening entry point (Passenger loads it, so require.main is unreliable).
//
// Privacy (PRD NFR): answers of anonymous users are never stored or logged. They only travel in the
// POST body of /api/quizzes/:id/result; nothing in this file logs a request body, and error logs
// carry short codes only.

const { computeResult } = require('./scoring');
const { parseAnswers, InvalidRequestError } = require('./validate');

const MAX_BODY_BYTES = 16 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super('payload too large');
    this.code = 'payload_too_large';
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function health() {
  return { status: 'ok', node: process.version, uptimeSeconds: Math.round(process.uptime()) };
}

// Dev-only CORS: active only when CORS_ORIGIN is set (production never sets it).
function corsOrigin() {
  return process.env.CORS_ORIGIN || '';
}

function applyCors(res) {
  const origin = corsOrigin();
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : 'UNKNOWN';
}

// The real error code goes to the log only; the public response carries a fixed code so the quiz
// endpoints do not reveal infrastructure state (never a raw message or credentials either).
function sendUnavailable(res, error) {
  console.error(`quiz api request failed: ${errorCode(error)}`);
  return sendJson(res, 503, { status: 'error', code: 'unavailable' });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.toLowerCase().startsWith('application/json')) {
      reject(new InvalidRequestError('content-type must be application/json'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new InvalidRequestError('body is not valid JSON'));
      }
    });
    req.on('error', () => {
      if (!failed) reject(new InvalidRequestError('request stream error'));
    });
  });
}

function formatParties(parties, names) {
  return parties
    .map((party) => ({
      id: party.id,
      name: names.get(party.id),
      percent: party.fraction === null ? null : Math.round(party.fraction * 100),
      counted: party.counted,
    }))
    .sort((a, b) => {
      if (a.percent === null && b.percent !== null) return 1;
      if (a.percent !== null && b.percent === null) return -1;
      if (a.percent !== b.percent) return b.percent - a.percent;
      return a.name.localeCompare(b.name, 'pl');
    });
}

// deps: { data: { listQuizzes, getQuiz, getScoringData }, ping }
function createHandler({ data, ping }) {
  async function healthDb(res) {
    try {
      await ping();
      return sendJson(res, 200, { status: 'ok', db: 'up' });
    } catch (error) {
      const code = errorCode(error);
      console.error(`db health check failed: ${code}`);
      return sendJson(res, 503, { status: 'error', db: 'down', code });
    }
  }

  async function postResult(req, res, quizId) {
    // Results are personal: never let an intermediary or the browser cache them.
    res.setHeader('Cache-Control', 'no-store');
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        res.setHeader('Connection', 'close'); // do not keep reading an oversized body
        return sendJson(res, 413, { status: 'error', code: 'payload_too_large' });
      }
      return sendJson(res, 400, { status: 'error', code: 'invalid_request' });
    }

    let scoring;
    try {
      scoring = await data.getScoringData(quizId);
    } catch (error) {
      return sendUnavailable(res, error);
    }
    if (!scoring) return sendJson(res, 404, { status: 'not_found' });

    let answers;
    try {
      answers = parseAnswers(
        body,
        scoring.questions.map((question) => question.id),
      );
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        return sendJson(res, 400, { status: 'error', code: 'invalid_request' });
      }
      throw error;
    }

    let result;
    try {
      result = computeResult({
        questions: scoring.questions,
        parties: scoring.parties,
        answers,
      });
    } catch (error) {
      // Invalid quiz data in the database (for example an out-of-range weight): not the caller's fault.
      if (error instanceof RangeError) return sendUnavailable(res, { code: 'INVALID_QUIZ_DATA' });
      throw error;
    }
    if (result.status === 'insufficient_answers') {
      return sendJson(res, 422, {
        status: 'error',
        code: 'insufficient_answers',
        answered: result.answered,
        total: result.total,
        minAnswered: Math.ceil(result.total / 2),
      });
    }
    const names = new Map(scoring.parties.map((party) => [party.id, party.name]));
    return sendJson(res, 200, {
      answered: result.answered,
      total: result.total,
      parties: formatParties(result.parties, names),
    });
  }

  return async function handler(req, res) {
    try {
      applyCors(res);
      // req.url always starts with "/"; splitting avoids new URL() reading "//host/path" as a host.
      const pathname = String(req.url).split('?')[0];

      if (req.method === 'OPTIONS' && corsOrigin() && pathname.startsWith('/api/')) {
        res.writeHead(204);
        return res.end();
      }
      if (req.method === 'GET' && pathname === '/api/health') return sendJson(res, 200, health());
      if (req.method === 'GET' && pathname === '/api/health/db') return await healthDb(res);

      if (req.method === 'GET' && pathname === '/api/quizzes') {
        try {
          return sendJson(res, 200, await data.listQuizzes());
        } catch (error) {
          return sendUnavailable(res, error);
        }
      }

      const quizMatch = /^\/api\/quizzes\/([1-9]\d{0,8})$/.exec(pathname);
      if (req.method === 'GET' && quizMatch) {
        const id = Number(quizMatch[1]);
        let quiz;
        try {
          quiz = await data.getQuiz(id);
        } catch (error) {
          return sendUnavailable(res, error);
        }
        if (!quiz) return sendJson(res, 404, { status: 'not_found' });
        return sendJson(res, 200, { ...quiz, minAnswered: Math.ceil(quiz.questions.length / 2) });
      }

      const resultMatch = /^\/api\/quizzes\/([1-9]\d{0,8})\/result$/.exec(pathname);
      if (req.method === 'POST' && resultMatch)
        return await postResult(req, res, Number(resultMatch[1]));

      return sendJson(res, 404, { status: 'not_found' });
    } catch (error) {
      console.error(`unhandled api error: ${errorCode(error)}`);
      if (!res.headersSent) return sendJson(res, 500, { status: 'error', code: 'internal_error' });
      return res.end();
    }
  };
}

module.exports = { createHandler, MAX_BODY_BYTES };
