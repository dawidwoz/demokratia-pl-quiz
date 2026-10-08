# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

"Z kim mi po drodze" (npm name `z-kim-mi-po-drodze`) is a Polish-language voter quiz that computes a user's agreement with parties from actual Sejm votes. As of 2026-10-08 the repo is only a freshly generated Angular 21 scaffold (no git history): `src/app/app.html` is still the Angular placeholder and `routes` is empty. Nothing from the PRD is implemented yet.

The product intent lives in `context/foundation/` (written in Polish); read it before building features:
- `@context/foundation/prd.md` — requirements FR-001…FR-011. The scoring formula is under "Business Logic" and privacy and role rules are under "Non-Functional Requirements" and "Access Control"; follow them exactly.
- `@context/foundation/tech-stack.md` — Angular is **front-end only**: accounts/login, the API and the MySQL database are separate, not-yet-started back-end work (the main schedule risk; MVP target 2026-11-04, fallback 2026-12-06).
- `@context/foundation/shape-notes.md` — the discovery notes the PRD was generated from.
- Foundation docs are edited in place, never copied with dates. Change-scoped docs go in `context/changes/<change-id>/`, not `foundation/`; finished changes move to `context/archive/`.

## Commands

```bash
npm start                          # ng serve, http://localhost:4200
npx ng generate component <name>   # schematics default to SCSS and skipTests: true
npx prettier --write <files>       # no lint script; Prettier is the only formatter
```

Other scripts (`build`, `watch`) are in `@package.json`.

As of 2026-10-08, `npm test` / `ng test` does not work: `angular.json` has no `test` target, and Vitest (referenced by `tsconfig.spec.json` and the README) is not in `devDependencies`. Add the runner and a `test` target before relying on tests or running a single test, then delete this paragraph.

## Known issues

`npm audit` reports 2 critical / 9 high findings, all in dev/build tooling (none in production deps). They were left unfixed on purpose as of 2026-10-03; see `context/changes/bootstrap-verification/verification.md`.
