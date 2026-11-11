# Archive SHA repoint — f-02

- Date: 2026-11-11
- Target: origin/main @ c804b6e577f38096bfbd3112f6d4ec4c0d493746
- Integration commit: c804b6e "F-02: automated test baseline (npm test for app and API, CI workflow) (#3)"
- PR: https://github.com/dawidwoz/demokratia-pl-quiz/pull/3 (merged; its commit list contains all three old SHAs)
- Evidence: the squash diff contains the files of all three phase commits (angular.json, package.json, src/app/app.spec.ts, api/test/db.test.js, .github/workflows/test.yml, docs). The old SHAs are not ancestors of the target; c804b6e is (checked with `git merge-base --is-ancestor`).
- Decision: user chose "Zaktualizuj i archiwizuj".
- This note is provenance only, not an implementation review.

| Row ID | Old suffix | New SHA |
| --- | --- | --- |
| 1.1–1.4 (4 rows) | c65d77c | c804b6e |
| 2.1–2.5 (5 rows) | b481fe0 | c804b6e |
| 3.1–3.5 (5 rows) | def0758 | c804b6e |

Total repointed rows: 14
