# Archive SHA repoint — f-01

- Date: 2026-11-11
- Target: origin/main @ c804b6e577f38096bfbd3112f6d4ec4c0d493746
- Evidence: PRs #1 and #2 were squash-merged; old SHAs exist only on branches `f-01-database-connection` and `f-01-phase-4` and are not ancestors of the target. PR file lists and merge-commit diffs match the old commits' changes. Both merge commits are ancestors of the target (checked with `git merge-base --is-ancestor`).
- Decision: user chose "Zaktualizuj i archiwizuj".
- This note is provenance only, not an implementation review.

## Entry 1: PR #1 — 33fd61da741b66196cfa515203fc8e833d53421b "F-01: connect production API to the database and ship schema migrations (#1)"

PR: https://github.com/dawidwoz/demokratia-pl-quiz/pull/1

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1–1.5 (5 rows) | 522e704 (full OID resolved via git rev-parse) | 33fd61d |
| 2.1–2.9 (9 rows) | 5b997ac (full OID resolved via git rev-parse) | 33fd61d |

Rows: 14

## Entry 2: PR #2 — 17d9a1d09c18d6bb113315df9de04af7ca6b6807 "F-01: record deploy verification, latency gate and foundation docs (#2)"

PR: https://github.com/dawidwoz/demokratia-pl-quiz/pull/2

| Row ID | Old suffix | New SHA |
| --- | --- | --- |
| 3.1–3.6 (6 rows) | 30eac9b | 17d9a1d |
| 4.1–4.5 (5 rows) | a41bd10 | 17d9a1d |

Rows: 11

Total repointed rows: 25
