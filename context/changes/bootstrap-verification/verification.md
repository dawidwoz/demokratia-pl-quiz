---
bootstrapped_at: 2026-10-03T17:03:22Z
starter_id: angular
starter_name: Angular
project_name: z-kim-mi-po-drodze
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: angular
package_manager: npm
project_name: z-kim-mi-po-drodze
hints:
  language_family: js
  team_size: solo
  deployment_target: self-host
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: true
    from_official_starter: false
    conventions: true
    docs_current: true
    can_judge_agent: true
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Solo developer building a web quiz with accounts, an admin panel and a 5-week after-hours budget. Custom path: the recommended JS default was declined in favour of the stated Angular front-end preference, which clears all four agent-friendly gates and has verified bootstrapper confidence. Angular is front-end only, so accounts and login (has_auth), the API and the MySQL database stated as a soft preference are not carried by this starter and must be built as a separate back end; that is the main schedule risk against the 2026-11-04 target. Deployment is self-host, the card default, with GitHub Actions and auto-deploy on merge. The self-check came back with one unmarked statement (not starting from an official template), so no nudge fired.

## Pre-scaffold verification

| Signal      | Value                                                    | Severity | Notes                                                                                |
| ----------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| npm package | @angular/cli v22.2.1, time.modified 2026-10-01T13:48:26Z | fresh    | package taken from cmd_template (`npx @angular/cli new`)                             |
| GitHub repo | not run                                                  | n/a      | card docs_url is https://angular.dev (not a GitHub URL); `gh` is also not installed  |

## Scaffold log

**Resolved invocation**: `npx @angular/cli new z-kim-mi-po-drodze --directory .bootstrap-scaffold --defaults --routing --style scss --skip-tests --ssr false`
**Strategy**: subdir-then-move
**Exit code**: 0
**Files moved**: 20919 (23 outside node_modules + 20896 inside node_modules; 14 top-level entries)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted

**Manual deviations from the registry template**:
- The registry template passes `{name}=.bootstrap-scaffold`; Angular CLI rejects a project name starting with a dot (first attempt, exit code 1, no files written). The second attempt used the valid name `z-kim-mi-po-drodze` plus `--directory .bootstrap-scaffold`. Run manually by the assistant at the user's request, not by an unmodified bootstrapper run.
- The Angular CLI initialised a git repository inside `.bootstrap-scaffold/`; it was deleted before the move (user chose "remove"). The current directory has no git history.

First attempt stderr (last lines):

```
Schematic input does not validate against the Schema: {"projectRoot":"","name":".bootstrap-scaffold",...}
Data path "/name" must match pattern "^(?:@[a-zA-Z0-9-*~][a-zA-Z0-9-*._~]*/)?[a-zA-Z0-9-~][a-zA-Z0-9-._~]*$".
```

Environment note: Node.js v25.9.0 (odd, non-LTS release); the CLI printed a warning only. Installed Angular packages: @angular/core 21.2.25, @angular/cli 21.2.24, @angular/build 21.2.24.

## Post-scaffold audit

**Tool**: npm audit --json (exit code 1: vulnerabilities present; not treated as a halt)
**Summary**: 2 CRITICAL, 9 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: 1/1/0/0 direct of total 2/9/0/0 (direct: @angular/build CRITICAL, @angular/cli HIGH; the rest transitive)
**Production dependencies only** (`npm audit --omit=dev`): 0 findings. All 11 findings are in packages that belong to the build tooling (devDependencies).

#### CRITICAL findings

- piscina 5.0.0 - 5.3.1 (installed 5.2.0, transitive via @angular/build): prototype-pollution gadget in ThreadPool.options allows RCE via execArgv / loadBalancer / env. Advisory GHSA-67c8-pqhq-4rmx. Fixed in piscina >= 5.3.2.
- @angular/build 20.0.0-next.0 - 22.2.0-rc.0 (installed 21.2.24, direct): flagged only through its dependency on piscina.

#### HIGH findings

- http-cache-semantics <= 4.2.0 (transitive): max-stale handling can disclose cross-user cached responses. Advisory GHSA-ch52-4w7c-c8xp.
- make-fetch-happen, npm-registry-fetch, pacote, sigstore, @sigstore/sign, @sigstore/tuf, tuf-js (all transitive): flagged only through the chain that ends in http-cache-semantics (no advisory of their own).
- @angular/cli 6.2.9 || 7.3.0-beta.0 - 22.1.0-rc.0 (installed 21.2.24, direct): flagged only through pacote.

Note: npm suggests `fixAvailable` versions that are major downgrades (@angular/cli 7.2.4, @angular/build 19.2.27). These are not real remediations; the useful fixes are newer releases of the transitive packages (piscina >= 5.3.2) or a newer Angular release that pulls them in. Nothing was changed (no `npm audit fix`).

## Hints recorded but not acted on

| Hint                    | Value                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| bootstrapper_confidence | verified                                                                                                |
| quality_override        | false                                                                                                   |
| path_taken              | custom                                                                                                  |
| self_check_answers      | typed: true, from_official_starter: false, conventions: true, docs_current: true, can_judge_agent: true |
| team_size               | solo                                                                                                    |
| deployment_target       | self-host                                                                                               |
| ci_provider             | github-actions                                                                                          |
| ci_default_flow         | auto-deploy-on-merge                                                                                    |
| has_auth                | true                                                                                                    |
| has_payments            | false                                                                                                   |
| has_realtime            | false                                                                                                   |
| has_ai                  | false                                                                                                   |
| has_background_jobs     | false                                                                                                   |

Not acted on: `has_auth: true` means the scaffold contains no accounts or login. Angular is front-end only; the back end and the MySQL database must be built separately.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep (none this run).
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
- Add the back end (accounts, API, MySQL) as a separate piece of work: it is not part of this scaffold.
