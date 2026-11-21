# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

"Z kim mi po drodze" (npm name `z-kim-mi-po-drodze`) is a Polish-language voter quiz that computes a user's agreement with parties from actual Sejm votes. As of 2026-11-11 the anonymous flow (US-01, change S-01) exists: Angular 21 front end in `src/` (quiz list at `/`, quiz run and result at `/quiz/:id`) and a Node API in `api/` (`GET /api/quizzes`, `GET /api/quizzes/:id`, stateless `POST /api/quizzes/:id/result`; formula in `api/scoring.js`, MariaDB schema and seed in `api/migrations/`). The seeded quiz is **sample content** (`is_sample`, fictional parties) and must be replaced before launch. Accounts, saving results, admin and export (S-02…S-08) are not implemented. For local dev run the API with `CORS_ORIGIN=http://localhost:4200` (see `api/README.md`) and restart `ng serve` after editing `angular.json`.

The product intent lives in `context/foundation/` (written in Polish); read it before building features:
- `@context/foundation/prd.md` — requirements FR-001…FR-011. The scoring formula is under "Business Logic" and privacy and role rules are under "Non-Functional Requirements" and "Access Control"; follow them exactly.
- `@context/foundation/tech-stack.md` — Angular is **front-end only**: accounts/login are still not-yet-started back-end work (the API in `api/` and the MySQL database exist since F-01/S-01) (the main schedule risk; MVP target 2026-12-06; the earlier 2026-11-04 date was dropped).
- `@context/foundation/shape-notes.md` — the discovery notes the PRD was generated from.
- Foundation docs are edited in place, never copied with dates. Change-scoped docs go in `context/changes/<change-id>/`, not `foundation/`; finished changes move to `context/archive/`.

## Commands

```bash
npm start                          # ng serve, http://localhost:4200
npx ng generate component <name>   # schematics default to SCSS and skipTests: true
npx prettier --write <files>       # no lint script; Prettier is the only formatter
npm test                           # app tests, then api tests; fails if either fails
npm run test:app                   # app only: ng test --no-watch (Vitest + jsdom)
npm run test:api                   # api only: node --test, no database needed
```

Other scripts (`build`, `watch`) are in `@package.json`.

App specs live next to the code as `src/**/*.spec.ts` (not `*.test.ts`, which would be compiled into the app build). API tests live in `api/test/*.test.js` and use `node:test` with `node:assert/strict`. `.github/workflows/test.yml` runs `npm test` on pull requests and pushes to `main`.

## Known issues

`npm audit` reports 2 critical / 9 high findings, all in dev/build tooling (none in production deps). They were left unfixed on purpose as of 2026-10-03; see `context/changes/bootstrap-verification/verification.md`.
<!-- BEGIN @przeprogramowani/10x-cli -->

## Zestaw narzędzi AI 10xDevs — Moduł 2, Lekcja 1

Przejdź od konfiguracji sprintu zerowego do orkiestracji projektu za pomocą **łańcucha roadmapy**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` jest tematem lekcji. `/10x-new` zostaje celowo wprowadzone w Module 2, Lesson 2, gdy wybrany element roadmapy staje się folderem zmiany implementacyjnej.

### Router zadań — od czego zacząć

| Skill | Użyj, gdy |
| --- | --- |
| **Roadmap (temat lekcji)** | |
| `/10x-roadmap` | Masz `context/foundation/prd.md` oraz przygotowaną bazę projektu i potrzebujesz roadmapy MVP o priorytecie pionowych przekrojów. Skill odczytuje PRD, analizuje bazę kodu, wykorzystuje dostępne dokumenty podstawowe, takie jak `tech-stack.md`, `infrastructure.md` i `deploy-plan.md`, a następnie zapisuje `context/foundation/roadmap.md`. Użyj go PRZED utworzeniem folderów dla poszczególnych zmian lub planów implementacji. |
| **W razie potrzeby uruchom ponownie etap wcześniejszy** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Zestawione z Module 1, aby kontrakty podstawowe można było poprawić przed ustaleniem kolejności roadmapy. Jeśli generowanie roadmapy ujawni lukę w PRD, popraw PRD, zanim uznasz backlog za gotowy. |

### Jak łańcuch przekazuje pracę dalej

- `/10x-roadmap` łączy produkt z implementacją. Nie wybiera frameworków, nie projektuje schematów ani nie tworzy planu implementacji dla pojedynczej zmiany.
- Wynikiem jest `context/foundation/roadmap.md`: uporządkowane kamienie milowe, pionowe przekroje, ograniczone fundamenty, zależności, niewiadome, ryzyka oraz pola przekazania do backlogu.
- Elementy roadmapy powinny otrzymywać stabilne, czytelne dla ludzi identyfikatory w narzędziach backlogu. Rzeczywisty folder `context/changes/<change-id>/` zostanie utworzony w Lekcji 2 za pomocą `/10x-new`.

### Granice roadmapy

- Domyślnie stosuj pionowe przekroje: widoczne dla użytkownika rezultaty obejmujące UI, dane, logikę biznesową i integracje.
- Praca horyzontalna jest dozwolona tylko jako ograniczony element umożliwiający realizację, który wskazuje docelowy pionowy kamień milowy, jaki odblokowuje.
- Unikaj osieroconej pracy horyzontalnej, takiej jak „zbuduj całą bazę danych”, „zbuduj wszystkie endpointy API” lub „zaprojektuj cały UI” przed pierwszym przepływem widocznym dla użytkownika.
- Roadmapa nie jest estymacją kalendarzową. Nie wymyślaj dat, punktów historyjek ani prędkości sprintu, chyba że użytkownik wyraźnie poprosi o osobny artefakt planowania.

### Ścieżki podstawowe używane przez tę lekcję

- `context/foundation/prd.md` — dane wejściowe
- `context/foundation/tech-stack.md` — opcjonalne dane wejściowe
- `context/foundation/infrastructure.md` — opcjonalne dane wejściowe
- `context/deployment/deploy-plan.md` — opcjonalne dane wejściowe
- `context/foundation/roadmap.md` — dane wyjściowe
- `context/foundation/lessons.md` — powtarzające się reguły i pułapki
- `docs/reference/contract-surfaces.md` — rejestr nazw krytycznych dla działania

Skills nie mogą zapisywać do `context/archive/`. Zarchiwizowane zmiany są niezmienne; jeśli rozwiązana ścieżka docelowa zaczyna się od `context/archive/`, przerwij z komunikatem: „This change is archived. Open a new change with `/10x-new` instead.”

<!-- END @przeprogramowani/10x-cli -->
