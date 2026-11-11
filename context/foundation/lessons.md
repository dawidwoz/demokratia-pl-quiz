# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Remind how to test DB migrations locally in PowerShell

- **Context**: Whenever a SQL migration script in `api/migrations/` is added or changed, or `node migrate.js` is mentioned.
- **Problem**: When a SQL script is changed, the migration can go untested locally because the verification steps are not recalled.
- **Rule**: Always remind the user how to test the DB migration locally in PowerShell, using a scratch database: `cd C:\Projects\10xDEV\quiz\api`, then `$env:DB_HOST = "localhost"; $env:DB_USER = "<local user>"; $env:DB_PASSWORD = "<local password>"; $env:DB_NAME = "<scratch database>"`, then `node migrate.js`.
- **Applies to**: implement
