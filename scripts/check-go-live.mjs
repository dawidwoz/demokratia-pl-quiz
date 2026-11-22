// Go-live guard: accounts must not be published with placeholder legal texts. The deploy workflow runs
// this before building. It exits non-zero while src/app/legal/legal.config.ts still holds a placeholder
// value or LEGAL_REVIEWED is not true. Usage: node scripts/check-go-live.mjs [path-to-legal.config.ts]

import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'src/app/legal/legal.config.ts';
const source = readFileSync(file, 'utf8');
const problems = [];

for (const match of source.matchAll(/export const (\w+)\s*=\s*'DO_UZUPELNIENIA'/g)) {
  problems.push(`${match[1]} still holds the placeholder: fill it in`);
}
if (!/export const LEGAL_REVIEWED\s*=\s*true\s*;/.test(source)) {
  problems.push(
    'LEGAL_REVIEWED is not true: read the Regulamin and the Polityka Prywatności, then set it',
  );
}

if (problems.length > 0) {
  console.error(`Go-live check failed (${file}):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('Go-live check passed: legal texts are filled in and marked as reviewed.');
