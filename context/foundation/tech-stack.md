---
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
---

## Why this stack

Solo developer building a web quiz with accounts, an admin panel and a 5-week after-hours budget. Custom path: the recommended JS default was declined in favour of the stated Angular front-end preference, which clears all four agent-friendly gates and has verified bootstrapper confidence. Angular is front-end only, so accounts and login (has_auth), the API and the MySQL database stated as a soft preference are not carried by this starter and must be built as a separate back end; that is the main schedule risk against the 2026-11-04 target. Deployment is self-host, the card default, with GitHub Actions and auto-deploy on merge. The self-check came back with one unmarked statement (not starting from an official template), so no nudge fired.
