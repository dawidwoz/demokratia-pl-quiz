---
project: "Z kim mi po drodze"
version: 1
status: approved
created: 2026-11-03
updated: 2026-11-11
prd_version: 1
main_goal: speed
top_blocker: capacity
milestone_id: voter-quiz-mvp
milestone_seq: 1
milestone_status: open
---

# Roadmap: Z kim mi po drodze

> Wyprowadzone z `context/foundation/prd.md` (v1) + `tech-stack.md` + `infrastructure.md` + automatycznie zbadanego punktu bazowego kodu.
> Edytuj w miejscu; kolejny kamień milowy kontynuuje ten plik. Archiwizuj tylko wtedy, gdy zastępuje go niezależna mapa drogowa.
> Elementy poniżej są w kolejności zależności. Tabela „At a glance" jest indeksem.

## Milestone

**M-01: MVP quizu zgodności z partiami** — Status: open

- **Intent:** Wyborca (także bez konta) przechodzi quiz i dostaje wynik zgodności z partiami liczony z udokumentowanych stanowisk, a admin może utrzymywać treść quizu; zalogowany użytkownik może zapisać wynik. Bez dat — kamień milowy jest ograniczony rezultatem.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** każdy F-NN i S-NN poniżej ma status `done`.
- **Scope anchors:** US-01; FR-001, FR-002, FR-003, FR-004, FR-005, FR-008, FR-009, FR-010 oraz wymagania niefunkcjonalne PRD (prywatność odpowiedzi anonimowych, usunięcie konta, widoczność wyników tylko dla właściciela, źródło i data stanowiska). FR-006, FR-007 i FR-011 są w `## Parked`.

## Vision recap

Wyborca szukający partii zgodnej ze swoimi poglądami nie ma dobrego sposobu, by ją znaleźć: głosowania w Sejmie są publiczne, ale nieczytelne dla zwykłego człowieka. Produkt liczy zgodność użytkownika z partiami z faktycznych głosowań i deklaracji, z pokazanym źródłem każdego stanowiska, a nie z samych haseł programowych.

## North star

**S-01: Anonimowy użytkownik rozwiązuje quiz i widzi zgodność z partiami** — to najmniejszy przepływ end-to-end, który spełnia kryterium Primary z PRD (przepływ 1–4) i przy `main_goal: speed` jest pierwszym dowodem, że produkt działa.

> Gwiazda przewodnia (north star) to najmniejszy przepływ end-to-end, którego dostarczenie dowodzi, że produkt działa; stawiamy go tak wcześnie, jak pozwalają zależności, bo reszta ma sens tylko wtedy, gdy ten przepływ działa.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                         | Prerequisites                         | PRD refs                          | Status   |
| ---- | ------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- | --------------------------------- | -------- |
| F-01 | production-database-connection  | (foundation) produkcyjne API łączy się z bazą, a zmiany schematu da się wdrażać | —                                     | NFR (działanie bez API Sejmu)     | done     |
| F-02 | automated-test-baseline         | (foundation) testy automatyczne uruchamiają się jedną komendą                | —                                     | Business Logic                    | done     |
| S-01 | anonymous-quiz-result           | rozwiązać quiz bez konta i zobaczyć zgodność z każdą partią                  | F-01, F-02, seeded quiz content       | US-01, FR-002, FR-003, FR-004     | proposed |
| S-02 | result-position-justification   | zobaczyć, dlaczego partia ma dane stanowisko (uzasadnienie, źródło, data)    | S-01                                  | FR-003, FR-004                    | proposed |
| S-03 | account-registration-login      | założyć konto i się zalogować                                                | F-01                                  | FR-001                            | blocked  |
| S-04 | save-quiz-result                | zapisać swój wynik na koncie i zobaczyć go ponownie (tylko ja)               | S-01, S-03                            | FR-005                            | proposed |
| S-05 | admin-quiz-management           | jako admin dodać i zmienić quiz z pytaniami, źródłem i wagą                  | S-01, S-03                            | FR-009                            | proposed |
| S-06 | admin-party-positions           | jako admin dodać i zmienić stanowisko partii ze źródłem i uzasadnieniem      | S-05                                  | FR-010                            | proposed |
| S-07 | account-deletion                | usunąć swoje konto razem ze wszystkimi wynikami                              | S-04                                  | FR-001, FR-005                    | proposed |
| S-08 | result-image-export             | wyeksportować swój wynik jako obraz PNG                                      | S-01, S-03                            | FR-008                            | proposed |

## Streams

Pomoc nawigacyjna — grupuje elementy ze wspólnym łańcuchem Prerequisites. Kanoniczna kolejność jest w grafie zależności poniżej.

| Stream | Theme                  | Chain                          | Note                                                                                  |
| ------ | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| A      | Rdzeń quizu            | `F-01` → `S-01` → `S-02`       | Najpierw przepływ z kryterium Primary (cel `speed`); S-01 potrzebuje też F-02 ze Stream D. |
| B      | Konta i zapis wyniku   | `S-03` → `S-04` → `S-07`       | Startuje po `F-01` ze Stream A; konta są opcjonalne dla quizu, więc nie blokują rdzenia. |
| C      | Panel admina           | `S-05` → `S-06`                | Dołącza do Stream B w `S-03` (logowanie) i do Stream A w `S-01` (model quizu).        |
| D      | Weryfikacja formuły    | `F-02`                         | Samodzielny; odblokowuje weryfikację wzoru zgodności w `S-01` (neutralność wobec partii). |
| E      | Eksport wyniku         | `S-08`                         | Dołącza do Stream B w `S-03`; pierwszy kandydat do odroczenia przy braku mocy.       |

## Baseline

Co już jest w kodzie na dzień 2026-11-03 (zbadane automatycznie i potwierdzone przez użytkownika z korektami). Foundations poniżej nie tworzą ponownie warstw oznaczonych jako present.

- **Frontend:** partial — szkielet aplikacji (`src/app/`), `routes` puste, `app.html` to placeholder; testy uruchamia `npm test` (aplikacja: `ng test` z Vitest, API: `node --test`; F-02).
- **Backend / API:** partial — `api/app.js` obsługuje tylko `GET /api/health`, bez zależności i bez dostępu do bazy.
- **Data:** absent — baza relacyjna zadeklarowana w `tech-stack.md`, ale brak schematu, migracji i danych; zmienne `DB_*` nieustawione w produkcji.
- **Auth:** absent — brak kodu kont. Użytkownik: konta są opcjonalne (quiz działa bez konta), więc auth jest zwykłym wycinkiem (S-03), nie fundamentem.
- **Deploy / infra:** present — `.github/workflows/deploy-vhpl.yml`, `quiz.demokratia.pl`, wdrożenie ręczne (`workflow_dispatch`) ze smoke checkiem; auto-deploy po merge odroczony.
- **Observability:** absent — użytkownik: nice-to-have, jeśli starczy czasu (trafia do `## Parked`).

## Foundations

### F-01: Produkcyjne API połączone z bazą danych

- **Outcome:** (foundation) API na produkcji łączy się z bazą, a zmiana schematu może zostać wdrożona w ramach zwykłego wdrożenia; schemat konkretnych funkcji powstaje dopiero w wycinkach, które go używają.
- **Change ID:** production-database-connection
- **PRD refs:** NFR (quiz i wynik działają bez API Sejmu — dane są lokalne); NFR (wynik < 2 s)
- **Unlocks:** S-01 (treść quizu i stanowiska partii muszą skądś być czytane), S-03 (konta wymagają trwałego zapisu), nazwana ścieżka weryfikacji: pomiar opóźnienia po bezczynności.
- **Prerequisites:** —
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Jak stosować zmiany schematu z workflow wdrożenia (tunel SSH do bazy z GitHub Actions nie był potwierdzony)? — Owner: user. Block: no.
  - Czy opóźnienie pierwszego żądania po bezczynności mieści się w celu < 2 s (niezmierzone; wyzwalacz planu B w `infrastructure.md`)? — Owner: user. Block: no.
- **Risk:** Sekwencjonowane pierwsze, bo bez bazy żaden wycinek z danymi nie ruszy; ręczna bramka w panelu hostingu (utworzenie bazy i zmiennych `DB_*`) wymaga człowieka, więc zacząć od niej.
- **Status:** done

### F-02: Podstawa testów automatycznych

- **Outcome:** (foundation) testy automatyczne da się uruchomić jedną komendą i obejmują co najmniej jeden test logiki, a ten sam sposób działa dla kodu aplikacji i API.
- **Change ID:** automated-test-baseline
- **PRD refs:** Business Logic (wzór zgodności)
- **Unlocks:** S-01 (weryfikacja wzoru zgodności: wagi, rozbieżność za↔wstrzymuję się = 0,25, pominięte pytania, próg połowy odpowiedzi — gwarancja neutralności wobec partii).
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wąski element umożliwiający: tylko tyle, by wzór dało się sprawdzać; bez niego neutralność wobec partii jest nieweryfikowalna, a quality jest drugim naciskiem tej mapy.
- **Status:** done

## Slices

### S-01: Anonimowy użytkownik rozwiązuje quiz i widzi zgodność z partiami

- **Outcome:** user can bez konta wybrać quiz z listy, odpowiedzieć na pytania (za / przeciw / wstrzymuję się, z możliwością pominięcia, ze źródłem widocznym przy pytaniu) i zobaczyć zgodność z każdą partią z quizu; wynik pojawia się tylko przy odpowiedzi na co najmniej połowę pytań, a odpowiedzi nie zostają trwale zapisane.
- **Change ID:** anonymous-quiz-result
- **PRD refs:** US-01, FR-002, FR-003, FR-004
- **Prerequisites:** F-01, F-02, seeded quiz content (co najmniej 8 pytań, partie ze stanowiskami i źródłami)
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Jak pokazać wynik, by nie sugerował fałszywej precyzji (PRD Open Question 7)? — Owner: user. Block: no.
  - Jakie pytania i partie wchodzą do pierwszego quizu i skąd pochodzą ich stanowiska (PRD Open Question 2)? — Owner: user. Block: no (wycinek można zaplanować na treści przykładowej; publikacja czeka na treść rzeczywistą — zob. Open Roadmap Questions).
- **Risk:** Największy wycinek (nowy backend, dane, wzór), ale sekwencjonowany pierwszy, bo dowodzi kryterium Primary; ryzyko, że treść przykładowa zostanie, a nie rzeczywista.
- **Decyzja (2026-11-11, planowanie F-02):** wzór zgodności powstaje w `api/` jako zwykły moduł CommonJS i jest testowany przez `node --test`.
- **Status:** proposed

### S-02: Użytkownik widzi uzasadnienie stanowiska partii

- **Outcome:** user can przy swoim wyniku zobaczyć dla każdego pytania stanowisko każdej partii wraz z uzasadnieniem, źródłem i datą źródła lub głosowania.
- **Change ID:** result-position-justification
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wynika z guardrails (każde stanowisko ma źródło i datę) i przy nacisku na jakość nie może zostać odłożone za konta; bez niego wynik to czarna skrzynka.
- **Status:** proposed

### S-03: Użytkownik zakłada konto i się loguje

- **Outcome:** user can założyć konto i się zalogować; quiz nadal działa bez konta.
- **Change ID:** account-registration-login
- **PRD refs:** FR-001
- **Prerequisites:** F-01
- **Parallel with:** F-02, S-01, S-02
- **Blockers:** potwierdzenie warunków RODO i lokalizacji danych vh.pl (zewnętrzne, po stronie dostawcy)
- **Unknowns:**
  - Czy warunki RODO i lokalizacja danych vh.pl są akceptowalne przed zapisem danych osobowych (spełnienie wyzwalacza nr 4 przejścia na plan B)? — Owner: user. Block: yes.
  - Jak użytkownik zakłada konto i się loguje (PRD Open Question 4)? — Owner: user. Block: no.
- **Risk:** Pierwszy wycinek zapisujący dane osobowe, więc RODO jest bramką; konta są opcjonalne dla quizu, dlatego wycinek jest poza ścieżką gwiazdy przewodniej.
- **Status:** blocked

### S-04: Zalogowany użytkownik zapisuje wynik

- **Outcome:** user can zapisać swój wynik quizu na koncie i zobaczyć go ponownie; widzi go wyłącznie właściciel.
- **Change ID:** save-quiz-result
- **PRD refs:** FR-005
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-02, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:**
  - Jak weryfikować zapisany wynik po zmianie stanowisk partii, skoro odpowiedzi nie są zapisywane (PRD Open Question 8)? — Owner: user. Block: no.
- **Risk:** Granica prywatności: tylko właściciel widzi wynik i tylko zapisany wynik zostaje w danych; błąd tutaj łamie guardrail prywatności.
- **Status:** proposed

### S-05: Admin dodaje i zmienia quiz

- **Outcome:** user can jako admin dodać i zmienić quiz wraz z pytaniami, źródłem pytania i wagą ważności (1–3).
- **Change ID:** admin-quiz-management
- **PRD refs:** FR-009
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-02, S-04, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Jak nadawana jest rola admina (PRD Open Question 4)? — Owner: user. Block: no.
  - Czy wagi pytań wpływają na neutralność wobec partii (PRD Open Question 6)? — Owner: user. Block: no.
- **Risk:** Zastępuje treść zasianą w S-01; pierwszy wycinek z rolą admina, więc kontrola dostępu musi być poprawna od razu.
- **Status:** proposed

### S-06: Admin dodaje i zmienia stanowiska partii

- **Outcome:** user can jako admin dodać i zmienić stanowisko partii wobec pytania ze źródłem, datą i uzasadnieniem.
- **Change ID:** admin-party-positions
- **PRD refs:** FR-010
- **Prerequisites:** S-05
- **Parallel with:** S-02, S-04, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - Jakie są kryteria weryfikacji stanowisk z deklaracji (PRD Open Question 1)? — Owner: user. Block: no.
  - Czy admin wpisuje gotowe stanowisko klubu, czy wynik głosowania (liczby głosów), z którego system wyznacza większość, wstrzymanie lub brak stanowiska? — Owner: user. Block: no.
- **Risk:** Tu rozstrzyga się neutralność wobec partii; wycinek jest po S-05, bo stanowiska odnoszą się do pytań.
- **Status:** proposed

### S-07: Użytkownik usuwa konto

- **Outcome:** user can usunąć swoje konto razem ze wszystkimi zapisanymi wynikami.
- **Change ID:** account-deletion
- **PRD refs:** FR-001, FR-005
- **Prerequisites:** S-04
- **Parallel with:** S-02, S-05, S-06, S-08
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Wymóg prywatności z PRD; po S-04, bo dopiero wtedy jest co usuwać, a pominięcie go łamie obietnicę wobec użytkownika.
- **Status:** proposed

### S-08: Użytkownik eksportuje wynik jako obraz

- **Outcome:** user can jako zalogowany wyeksportować swój wynik jako obraz PNG.
- **Change ID:** result-image-export
- **PRD refs:** FR-008
- **Prerequisites:** S-01, S-03
- **Parallel with:** S-02, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Nice-to-have z przepływu MVP (krok 5); ostatni w kolejności i pierwszy do przeniesienia do `## Parked`, jeśli moc przerobowa zawiedzie.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                      | Suggested issue title                                         | Ready for `/10x-plan` | Notes                                                        |
| ---------- | ------------------------------ | ------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| F-01       | production-database-connection | Połączyć produkcyjne API z bazą i ustalić wdrażanie schematu  | no (done)             | Zrealizowane w zmianie `f-01` (PR #1, #2)                    |
| F-02       | automated-test-baseline        | Uruchomić testy automatyczne jedną komendą                    | no (done)             | Zrealizowane w zmianie `f-02` (PR #3)                        |
| S-01       | anonymous-quiz-result          | Anonimowy quiz z wynikiem zgodności z partiami                | no                    | Czeka na F-01, F-02 i treść quizu                            |
| S-02       | result-position-justification  | Uzasadnienie, źródło i data stanowiska partii przy wyniku     | no                    | Czeka na S-01                                                |
| S-03       | account-registration-login     | Rejestracja i logowanie                                       | no                    | Zablokowane: RODO / lokalizacja danych vh.pl                 |
| S-04       | save-quiz-result               | Zapis wyniku na koncie                                        | no                    | Czeka na S-01, S-03                                          |
| S-05       | admin-quiz-management          | Panel admina: quizy i pytania                                 | no                    | Czeka na S-01, S-03                                          |
| S-06       | admin-party-positions          | Panel admina: stanowiska partii ze źródłem                    | no                    | Czeka na S-05                                                |
| S-07       | account-deletion               | Usunięcie konta wraz z wynikami                               | no                    | Czeka na S-04                                                |
| S-08       | result-image-export            | Eksport wyniku do PNG                                         | no                    | Czeka na S-01, S-03                                          |

## Open Roadmap Questions

1. **Jakie są kryteria weryfikacji stanowisk partii z deklaracji (FR-010)?** — Niepodane; ryzyko subiektywności interpretacji deklaracji. Owner: user. Block: S-06.
2. **Jakie są kryteria doboru pytań i partii do quizu?** — Niepodane w danych wejściowych. Owner: user. Block: publikacja (zob. pytanie 13).
3. **Jaki jest stan testów, dokumentacji i repozytoriów demokratia.pl?** — Nieznany; demokratia.pl nie ma mechanizmu logowania ani kont (konta z FR-001 to nowa praca, nie reuse). Owner: user. Block: roadmap-wide (informacyjnie).
4. **Jak użytkownik zakłada konto / loguje się i jak nadawana jest rola admina?** — Niepodane. Owner: user. Block: S-03, S-05.
5. **Jakie są zasady prywatności porównań z innymi (FR-007)?** — Niepodane; przy ~20 uczestnikach statystyki mają bardzo małą próbę. Owner: user. Block: — (FR-007 jest w Parked).
6. **Czy wagi ważności pytań wpływają na FR-007 i na neutralność wobec partii?** — Niepodane. Owner: user. Block: S-05.
7. **Jak prezentować wynik zgodności, by nie sugerować fałszywej precyzji (FR-003)?** — Z rundy Sokratesa; nierozstrzygnięte. Owner: user. Block: S-01.
8. **Jak weryfikować zapisany wynik po zmianie stanowisk partii (FR-005 bez FR-006)?** — Bez zapisanych odpowiedzi wynik nie jest weryfikowalny po zmianie stanowisk. Owner: user. Block: S-04.
9. **Jaki jest docelowy ruch (`target_scale.qps`) i wolumen danych (`target_scale.data_volume`)?** — Niepodane; znana tylko liczba użytkowników (min 5, średnio 20, max 50). Owner: user. Block: roadmap-wide (informacyjnie).
10. **Czy harmonogram jest realny?** — Rozstrzygnięte 2026-11-03 decyzją użytkownika: cel MVP to 2026-12-06, a 2026-11-04 jest nieosiągalne; `prd.md` (`hard_deadline` i Open Question 10) jest już zaktualizowany. Owner: user. Block: — (rozstrzygnięte).
11. **Czy moment użycia persony jest poprawny?** — Wyprowadzono z wybranej persony; użytkownik nie opisał momentu osobno. Owner: user. Block: roadmap-wide (informacyjnie).
12. **Jaki mierzalny cel ma kryterium Primary?** — Kryterium opisuje działający przepływ, bez liczbowego progu. Owner: user. Block: roadmap-wide (informacyjnie).
13. **Kto i kiedy przygotuje rzeczywistą treść pierwszego quizu (co najmniej 8 pytań, partie, stanowiska ze źródłami i datami)?** — Nowe z roadmapy: S-01 da się zbudować na treści przykładowej, ale produkt nie może być opublikowany bez treści rzeczywistej i neutralnej. Owner: user. Block: roadmap-wide (publikacja).

## Parked

- **FR-006 — zapis odpowiedzi razem z wynikiem** — Why parked: nice-to-have w PRD; przy `main_goal: speed` i braku mocy przerobowej nie jest sekwencjonowany.
- **FR-007 — porównanie wyników z innymi (statystyki)** — Why parked: nice-to-have w PRD; mała próba (~20 uczestników) i otwarte pytania 5–6 o prywatność.
- **FR-011 — AI do szkiców uzasadnień i streszczeń głosowań** — Why parked: nice-to-have; PRD Non-Goals (AI nie jest wymaganiem MVP).
- **Observability (logowanie, śledzenie błędów)** — Why parked: użytkownik określił jako nice-to-have, jeśli starczy czasu.
- **Auto-deploy po merge do `main`** — Why parked: odroczone decyzją użytkownika (wdrożenie ręczne), zob. `infrastructure.md`, Open Decisions.
- **Automatyczny import głosowań Sejmu** — Why parked: PRD Non-Goals; admin wprowadza konkretne głosowania.
- **Publiczne profile i udostępnianie indywidualnych wyników** — Why parked: PRD Non-Goals; inni widzą co najwyżej statystyki zagregowane.
- **Pełna zgodność WCAG-AA i wersje językowe inne niż polska** — Why parked: PRD Non-Goals.

## Milestone History

(Brak — to pierwszy kamień milowy.)

## Done

(Puste. `/10x-archive` dopisuje wpisy przy archiwizacji zmian, których `Change ID` pasuje do elementu.)
