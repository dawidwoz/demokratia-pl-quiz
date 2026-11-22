'use strict';

// Fixed-window in-memory counters keyed by string (email, client address, "global"). Bounded memory:
// expired keys are dropped on access and the oldest key is evicted at maxKeys. Counters live only in
// this process, so a restart (every deploy, or a Passenger idle stop) resets them; the owner accepted
// that trade-off. Keys can hold an email address, so they are never logged.

function createLimiter({ max, windowMs, maxKeys = 10000, now = Date.now }) {
  const entries = new Map(); // key -> { count, resetAt }

  function live(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.resetAt <= now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  function makeRoom() {
    if (entries.size < maxKeys) return;
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.resetAt <= current) entries.delete(key);
    }
    // Still full: drop the oldest key (a Map iterates in insertion order).
    while (entries.size >= maxKeys) entries.delete(entries.keys().next().value);
  }

  return {
    // Counts one attempt. true while the key is within its budget, false once it is exceeded.
    hit(key) {
      const entry = live(key);
      if (!entry) {
        makeRoom();
        entries.set(key, { count: 1, resetAt: now() + windowMs });
        return max >= 1;
      }
      entry.count += 1;
      return entry.count <= max;
    },
    // Would the next hit be allowed? Does not count.
    peek(key) {
      const entry = live(key);
      return !entry || entry.count < max;
    },
    reset(key) {
      entries.delete(key);
    },
    size() {
      return entries.size;
    },
  };
}

module.exports = { createLimiter };
