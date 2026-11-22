'use strict';

// Times password hashing with the parameters in auth-config.js, so they can be checked on any
// machine (run it on the host over SSH before go-live). Prints timings only, never a password.
//   node scripts/measure-scrypt.js [count]     (default 5 hashes, sequential)

const { hashPassword, verifyPassword } = require('../passwords');
const { SCRYPT } = require('../auth-config');

async function main() {
  const count = Math.max(1, Number(process.argv[2]) || 5);
  const mib = (128 * SCRYPT.N * SCRYPT.r) / (1024 * 1024);
  console.log(
    `scrypt N=${SCRYPT.N} r=${SCRYPT.r} p=${SCRYPT.p} (~${mib} MiB per hash), ${count} runs`,
  );

  const times = [];
  for (let i = 0; i < count; i += 1) {
    const started = process.hrtime.bigint();
    const stored = await hashPassword('measurement password');
    const hashed = process.hrtime.bigint();
    const ok = await verifyPassword('measurement password', stored);
    const verified = process.hrtime.bigint();
    if (!ok) throw new Error('round trip failed');
    const hashMs = Number(hashed - started) / 1e6;
    times.push(hashMs);
    console.log(
      `run ${i + 1}: hash ${hashMs.toFixed(0)} ms, verify ${(Number(verified - hashed) / 1e6).toFixed(0)} ms`,
    );
  }
  const average = times.reduce((sum, value) => sum + value, 0) / times.length;
  console.log(
    `average hash ${average.toFixed(0)} ms (target: well under 500 ms), rss ${(process.memoryUsage().rss / 1048576).toFixed(0)} MiB`,
  );
}

main().catch((error) => {
  console.error(`measurement failed: ${(error && error.code) || 'UNKNOWN'}`);
  process.exitCode = 1;
});
