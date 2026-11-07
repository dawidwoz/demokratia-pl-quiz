---
change_id: f-01
title: Production database connection (roadmap F-01)
status: implemented
created: 2026-11-07
updated: 2026-11-07
archived_at: null
---

## Notes

from roadmap.md

### Phase 1 outcome

- Database server (reported by the owner, 2026-11-07): `11.4.13-MariaDB-cll-lve`, so MariaDB, not MySQL.
- `wait_timeout` = 600 seconds. The pool `idleTimeout` in Phase 2 must stay well below this, and an app idle for longer than 10 minutes will have lost its pooled connections, so the Phase 4 after-idle measurement (30+ min) always includes a fresh connection.
- SSH visibility check (owner-reported, 2026-11-07): **branch B**. Not all four `DB_*` names were visible over SSH after sourcing the activate script, so Phase 3 passes the four `VHPL_DB_*` secrets of GitHub environment `production` in the piped remote script (plan Phase 3 §1). Which names were missing, and whether the cPanel variables were set at that point, is not recorded.
