'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLimiter } = require('../rate-limit');

function clock(start = 1000) {
  let current = start;
  return { now: () => current, advance: (ms) => (current += ms) };
}

test('hit() allows up to max attempts in a window and refuses the next', () => {
  const time = clock();
  const limiter = createLimiter({ max: 3, windowMs: 1000, now: time.now });
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(() => limiter.hit('a')),
    [true, true, true, false, false],
  );
});

test('the window expires and the budget is restored', () => {
  const time = clock();
  const limiter = createLimiter({ max: 1, windowMs: 1000, now: time.now });
  assert.equal(limiter.hit('a'), true);
  assert.equal(limiter.hit('a'), false);
  time.advance(1000);
  assert.equal(limiter.hit('a'), true);
});

test('keys are independent', () => {
  const limiter = createLimiter({ max: 1, windowMs: 1000, now: clock().now });
  assert.equal(limiter.hit('a'), true);
  assert.equal(limiter.hit('b'), true);
  assert.equal(limiter.hit('a'), false);
});

test('peek() does not count and reports whether the next hit would be allowed', () => {
  const limiter = createLimiter({ max: 2, windowMs: 1000, now: clock().now });
  assert.equal(limiter.peek('a'), true);
  assert.equal(limiter.peek('a'), true);
  limiter.hit('a');
  assert.equal(limiter.peek('a'), true);
  limiter.hit('a');
  assert.equal(limiter.peek('a'), false);
});

test('reset() clears a key', () => {
  const limiter = createLimiter({ max: 1, windowMs: 1000, now: clock().now });
  limiter.hit('a');
  assert.equal(limiter.peek('a'), false);
  limiter.reset('a');
  assert.equal(limiter.peek('a'), true);
});

test('memory is bounded: expired keys are dropped, then the oldest key is evicted', () => {
  const time = clock();
  const limiter = createLimiter({ max: 5, windowMs: 1000, maxKeys: 3, now: time.now });
  limiter.hit('a');
  limiter.hit('b');
  limiter.hit('c');
  assert.equal(limiter.size(), 3);
  limiter.hit('d'); // full, nothing expired: the oldest ('a') is evicted
  assert.equal(limiter.size(), 3);
  assert.equal(limiter.peek('a'), true); // 'a' was forgotten, so it has a fresh budget
  time.advance(1000);
  limiter.hit('e'); // everything expired: swept, then 'e' is added
  assert.equal(limiter.size(), 1);
});
