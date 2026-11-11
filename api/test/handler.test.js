'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHandler, MAX_BODY_BYTES } = require('../handler');

// Fake data layer: no database needed. Four questions of weight 1; party A always agrees with 'za',
// party B always with 'przeciw', party C has no stances at all.
function fakeData(overrides = {}) {
  const positions = (stance) => ({ 1: stance, 2: stance, 3: stance, 4: stance });
  return {
    async listQuizzes() {
      return [{ id: 1, title: 'Quiz', description: null, isSample: true, questionCount: 4 }];
    },
    async getQuiz(id) {
      if (id !== 1) return null;
      return {
        id: 1,
        title: 'Quiz',
        isSample: true,
        questions: [1, 2, 3, 4].map((n) => ({
          id: n,
          text: `Pytanie ${n}`,
          source: { label: 'Źródło', url: null, date: '2025-01-01' },
        })),
        parties: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' },
          { id: 3, name: 'C' },
        ],
      };
    },
    async getScoringData(id) {
      if (id !== 1) return null;
      return {
        questions: [1, 2, 3, 4].map((n) => ({ id: n, weight: 1 })),
        parties: [
          { id: 1, name: 'A', positions: positions('za') },
          { id: 2, name: 'B', positions: positions('przeciw') },
          { id: 3, name: 'C', positions: {} },
        ],
      };
    },
    ...overrides,
  };
}

async function withServer(deps, fn) {
  const server = http.createServer(createHandler({ ping: async () => {}, ...deps }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withEnv(name, value, fn) {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

// Captures everything the handler writes to the console while fn runs.
async function captureConsole(fn) {
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  const originals = methods.map((m) => console[m]);
  const calls = [];
  methods.forEach((m) => {
    console[m] = (...args) => calls.push(args.map(String).join(' '));
  });
  try {
    await fn();
  } finally {
    methods.forEach((m, i) => {
      console[m] = originals[i];
    });
  }
  return calls;
}

function post(base, path, body, headers = { 'Content-Type': 'application/json' }) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const answer = (questionId, value) => ({ questionId, answer: value });

test('GET /api/quizzes returns the list', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const res = await fetch(`${base}/api/quizzes`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      { id: 1, title: 'Quiz', description: null, isSample: true, questionCount: 4 },
    ]);
  });
});

test('GET /api/quizzes/:id returns the quiz with minAnswered and no weights or stances', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const res = await fetch(`${base}/api/quizzes/1`);
    assert.equal(res.status, 200);
    const quiz = await res.json();
    assert.equal(quiz.minAnswered, 2);
    assert.equal(quiz.questions.length, 4);
    assert.deepEqual(quiz.questions[0].source, { label: 'Źródło', url: null, date: '2025-01-01' });
    const text = JSON.stringify(quiz);
    assert.ok(!text.includes('weight') && !text.includes('stance') && !text.includes('positions'));
  });
});

test('GET unknown or non-numeric quiz id is 404', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    assert.equal((await fetch(`${base}/api/quizzes/99`)).status, 404);
    assert.equal((await fetch(`${base}/api/quizzes/abc`)).status, 404);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  });
});

test('POST result: percents, counted, and ordering (null last)', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const res = await post(base, '/api/quizzes/1/result', {
      answers: [answer(1, 'za'), answer(2, 'za'), answer(3, 'za')],
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      answered: 3,
      total: 4,
      parties: [
        { id: 1, name: 'A', percent: 100, counted: 3 },
        { id: 2, name: 'B', percent: 0, counted: 3 },
        { id: 3, name: 'C', percent: null, counted: 0 },
      ],
    });
  });
});

test('POST result: percent is rounded half up to an integer', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const res = await post(base, '/api/quizzes/1/result', {
      answers: [answer(1, 'za'), answer(2, 'wstrzymuje')],
    });
    const body = await res.json();
    // Party A ('za' everywhere): (1 + 0.25) / 2 = 0.625 => 62.5 => 63 (half up)
    assert.equal(body.parties.find((p) => p.id === 1).percent, 63);
    // Party B ('przeciw' everywhere): (0 + 0.25) / 2 = 0.125 => 12.5 => 13 (half up)
    assert.equal(body.parties.find((p) => p.id === 2).percent, 13);
  });
});

test('POST result: ties are ordered by name using the Polish locale', async () => {
  const data = fakeData({
    async getScoringData() {
      return {
        questions: [
          { id: 1, weight: 1 },
          { id: 2, weight: 1 },
        ],
        parties: [
          { id: 1, name: 'Żółć', positions: { 1: 'za', 2: 'za' } },
          { id: 2, name: 'Zebra', positions: { 1: 'za', 2: 'za' } },
        ],
      };
    },
  });
  await withServer({ data }, async (base) => {
    const res = await post(base, '/api/quizzes/1/result', { answers: [answer(1, 'za')] });
    assert.deepEqual(
      (await res.json()).parties.map((p) => p.name),
      ['Zebra', 'Żółć'],
    );
  });
});

test('POST result below half answered is 422 with minAnswered', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const res = await post(base, '/api/quizzes/1/result', { answers: [answer(1, 'za')] });
    assert.equal(res.status, 422);
    assert.deepEqual(await res.json(), {
      status: 'error',
      code: 'insufficient_answers',
      answered: 1,
      total: 4,
      minAnswered: 2,
    });
  });
});

test('POST result rejects invalid bodies with 400 invalid_request', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const bodies = [
      '{not json',
      JSON.stringify({}),
      JSON.stringify({ answers: [answer(99, 'za')] }),
      JSON.stringify({ answers: [answer(1, 'za'), answer(1, 'przeciw')] }),
      JSON.stringify({ answers: [answer(1, 'maybe')] }),
    ];
    for (const body of bodies) {
      const res = await post(base, '/api/quizzes/1/result', body);
      assert.equal(res.status, 400, body);
      assert.deepEqual(await res.json(), { status: 'error', code: 'invalid_request' });
    }
    const wrongType = await post(base, '/api/quizzes/1/result', '{"answers":[]}', {
      'Content-Type': 'text/plain',
    });
    assert.equal(wrongType.status, 400);
  });
});

test('POST result with a body over the size cap is 413', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const big = JSON.stringify({ answers: [], pad: 'x'.repeat(MAX_BODY_BYTES + 1) });
    const res = await post(base, '/api/quizzes/1/result', big);
    assert.equal(res.status, 413);
  });
});

test('POST result for an unknown quiz is 404', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const res = await post(base, '/api/quizzes/99/result', { answers: [] });
    assert.equal(res.status, 404);
  });
});

test('a database failure is 503 with a short code only, never the raw message', async () => {
  const data = fakeData({
    async getScoringData() {
      const error = new Error('connect ECONNREFUSED user@secret-host');
      error.code = 'ECONNREFUSED';
      throw error;
    },
  });
  await withServer({ data }, async (base) => {
    let res;
    const logs = await captureConsole(async () => {
      res = await post(base, '/api/quizzes/1/result', { answers: [answer(1, 'za')] });
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: 'error', code: 'ECONNREFUSED' });
    assert.deepEqual(logs, ['quiz api request failed: ECONNREFUSED']);
  });
});

test('answers are never logged on the success path', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const logs = await captureConsole(async () => {
      const res = await post(base, '/api/quizzes/1/result', {
        answers: [answer(1, 'przeciw'), answer(2, 'wstrzymuje')],
      });
      assert.equal(res.status, 200);
    });
    assert.deepEqual(logs, []);
  });
});

test('health endpoints keep working', async () => {
  await withServer({ data: fakeData() }, async (base) => {
    const health = await (await fetch(`${base}/api/health`)).json();
    assert.equal(health.status, 'ok');
    assert.deepEqual(await (await fetch(`${base}/api/health/db`)).json(), {
      status: 'ok',
      db: 'up',
    });
  });
  const failingPing = async () => {
    const error = new Error('boom');
    error.code = 'ECONNREFUSED';
    throw error;
  };
  await withServer({ data: fakeData(), ping: failingPing }, async (base) => {
    let res;
    await captureConsole(async () => {
      res = await fetch(`${base}/api/health/db`);
    });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: 'error', db: 'down', code: 'ECONNREFUSED' });
  });
});

test('CORS headers and preflight exist only when CORS_ORIGIN is set', async () => {
  await withEnv('CORS_ORIGIN', 'http://localhost:4200', async () => {
    await withServer({ data: fakeData() }, async (base) => {
      const res = await fetch(`${base}/api/quizzes`);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:4200');
      assert.equal(res.headers.get('vary'), 'Origin');
      const preflight = await fetch(`${base}/api/quizzes/1/result`, { method: 'OPTIONS' });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
      assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
    });
  });
  await withEnv('CORS_ORIGIN', undefined, async () => {
    await withServer({ data: fakeData() }, async (base) => {
      const res = await fetch(`${base}/api/quizzes`);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      const preflight = await fetch(`${base}/api/quizzes/1/result`, { method: 'OPTIONS' });
      assert.equal(preflight.status, 404);
    });
  });
});
