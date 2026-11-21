# Quiz content

The real quiz (parties, questions, stances, justifications) is handed over as **one JSON file per quiz** in `content/quizzes/`. A validator rejects anything incomplete or inconsistent, and a generator turns the file into the seed migration that replaces the fictional sample quiz.

You can fill the file yourself, or paste raw notes (a table, a list, a spreadsheet export) into the chat and ask for them to be normalised into the file. Nothing is ever invented: a missing stance, source, date or justification is reported as an error, not filled in.

## How to start

1. Copy `content/quizzes/_template.json` to `content/quizzes/<slug>.json` (for example `sejm-2025.json`).
2. Replace everything with your content. Keys starting with `_` are notes and are ignored.
3. Run the check (from the repository root, in PowerShell) until it prints `OK`:

   ```powershell
   node api/scripts/build-content-migration.js check content/quizzes/<slug>.json
   ```

   Add `--draft` to preview partial content. Draft mode relaxes only the 8-question minimum, and `build --draft` prints the SQL on screen and never writes a migration.

4. When the check passes without errors, generate the migration (the number is the next free one in `api/migrations/`):

   ```powershell
   node api/scripts/build-content-migration.js build content/quizzes/<slug>.json --out api/migrations/0008_seed_real_quiz.sql
   ```

5. Test the migration on a scratch database before any deploy (see "Migrations" in `api/README.md`). A deployed migration cannot be undone by a rollback; corrections need a new migration.

The same commands exist as `npm --prefix api run content:check -- <file>` and `content:build -- <file> --out <file>`; npm runs them inside `api/`, so paths are relative to `api/` (for example `../content/quizzes/<slug>.json`).

## File format

```json
{
  "quiz": { "id": 101, "title": "…", "description": "…" },
  "parties": [{ "id": 101, "name": "…" }],
  "questions": [
    {
      "id": 101,
      "text": "Czy …?",
      "weight": 2,
      "source": { "label": "…", "url": "https://…", "date": "2025-02-11" },
      "positions": [
        {
          "party": 101,
          "basis": "vote",
          "stance": "za",
          "votes": { "clubSize": 100, "za": 90, "przeciw": 3, "wstrzymuje": 2 },
          "justification": "…",
          "source": { "label": "…", "url": "https://…", "date": "2025-02-11" }
        }
      ]
    }
  ]
}
```

A complete example is in `content/quizzes/_template.json`.

| Field                                       | Rule                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quiz.id`, `parties[].id`, `questions[].id` | Positive whole numbers you choose, unique within the file. Keep them stable: a later correction deletes and re-inserts the same ids.                      |
| `quiz.title`                                | Required, at most 200 characters. `quiz.description` is optional text.                                                                                    |
| `parties[].name`                            | Required, at most 120 characters, unique ignoring case and accents. At least 2 parties.                                                                   |
| `questions`                                 | At least 8 (draft mode: at least 1). The order in the file is the order in the quiz.                                                                      |
| `questions[].text`                          | Required, at most 500 characters.                                                                                                                         |
| `questions[].weight`                        | Whole number 1, 2 or 3: how important the question is.                                                                                                    |
| `source` (question and position)            | `label` required (at most 255 characters), `url` optional (`http(s)://…`, at most 500 characters), `date` required as `YYYY-MM-DD` and not in the future. |
| `positions[].party`                         | The `id` of a party from `parties`, at most one position per party and question.                                                                          |
| `positions[].basis`                         | `vote` (a Sejm vote) or `declaration`.                                                                                                                    |
| `positions[].stance`                        | `za`, `przeciw`, `wstrzymuje`, or `brak` (see below).                                                                                                     |
| `positions[].justification`                 | Required, at most 1000 characters. Shown to the user, so write it for a voter.                                                                            |
| `positions[].votes`                         | Optional, only with `basis` `vote`: `clubSize`, `za`, `przeciw`, `wstrzymuje`, all whole numbers, and `za + przeciw + wstrzymuje` at most `clubSize`.     |

A party with **no position** on a question has no stance on it; the question does not count for that party and the result shows "brak stanowiska". Unknown fields are errors (they are usually typos).

## How a stance from a vote is decided

A vote-based stance needs **more than half of the whole club**, absent members count against it, so give the club size at the time of the vote. Example with `clubSize` 100:

| za  | przeciw | wstrzymuje | Stance                                           |
| --- | ------- | ---------- | ------------------------------------------------ |
| 90  | 3       | 2          | `za`                                             |
| 51  | 20      | 10         | `za`                                             |
| 50  | 30      | 10         | `brak` (exactly half is not more than half)      |
| 40  | 40      | 10         | `brak`                                           |
| 10  | 12      | 60         | `wstrzymuje` (abstaining is a stance of its own) |

When `votes` is given, the validator checks that your `stance` matches the counts, the same way for every party. Use `"stance": "brak"` together with `votes` to document a club that had no majority; no row is written for it. Without `votes` the stance is taken as you wrote it and the validator only warns, because it cannot check the rule. If a party simply has no stance (for example no clear declaration), leave the position out instead of using `brak`.

## What the validator cannot judge

It enforces structure, limits, dates and the majority rule. It cannot tell whether a justification matches its source, whether the question set is balanced, or whether weights are fair. That review is yours, and it is a required step before a real-content migration is deployed.
