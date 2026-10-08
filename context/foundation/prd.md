---
project: "Z kim mi po drodze"
version: 1
status: draft
created: 2026-10-03
context_type: greenfield
product_type: web-app
target_scale:
  users: medium                # min 5, średnio 20, max 50 (podane przez użytkownika)
  qps: # TODO: target_scale.qps — see Open Questions
  data_volume: # TODO: target_scale.data_volume — see Open Questions
timeline_budget:
  mvp_weeks: 5                 # szacunek użytkownika: 4–5 tygodni; zapisano górną granicę
  hard_deadline: 2026-11-04    # termin 1 (cel MVP); fallback: 2026-12-06
  after_hours_only: true
---

# Z kim mi po drodze — PRD

## Vision & Problem Statement

Wyborca szukający partii zgodnej ze swoimi poglądami nie ma dobrego sposobu, by ją znaleźć. Dane o faktycznym zachowaniu partii (głosowania w Sejmie) są publiczne, ale nieczytelne dla zwykłego człowieka; porównywanie ich z deklaracjami i programami to paraliż decyzyjny. Dziś wyborca korzysta z narzędzi bez AI albo robi to sam, manualnie; koszt to błędny wybór, czas, rezygnacja z głosowania i niedokładny wybór.

Zgodność z partią jest liczona z faktycznych głosowań w Sejmie, a nie tylko z deklaracji.

## User & Persona

Główna persona: niezdecydowany wyborca w okresie wyborczym — osoba uprawniona do głosowania, która jeszcze nie wie, na kogo zagłosuje.

Moment: okres wyborczy, gdy musi zdecydować, na kogo głosować.

## Success Criteria

### Primary
- Użytkownik (także bez konta) wybiera quiz, rozwiązuje co najmniej 8 pytań (bez górnego limitu) i otrzymuje wynik zgodności z partiami (przepływ 1–4 działa od początku do końca).

Pierwszy przepływ MVP (zablokowany przez użytkownika):

1. Wejście na podrodze.demokratia.pl
2. Wybór quizu
3. Rozwiązanie quizu (co najmniej 8 pytań, bez górnego limitu)
4. Otrzymanie wyniku
5. (opcjonalnie) Założenie konta, by wyeksportować plik graficzny z rezultatem
6. (opcjonalnie) Zapisanie wyniku quizu na koncie
7. (opcjonalnie) Porównanie wyniku z innymi uczestnikami, jeśli użytkownik jest zarejestrowany

### Secondary
- Eksport wyniku do pliku graficznego (krok 5).
- Porównanie z innymi uczestnikami (krok 7, FR-007) — obniżone do nice-to-have przy ponownej ocenie harmonogramu.
- Nice-to-have w FR: zapis odpowiedzi razem z wynikiem (FR-006), eksport PNG (FR-008), AI do szkiców uzasadnień (FR-011).

### Guardrails
- Każde stanowisko partii ma wskazane źródło.
- Neutralność wobec partii: wszystkie partie liczone tym samym algorytmem i na tych samych zasadach.
- Prywatność wyników użytkownika.

## User Stories

### US-01: Anonimowy użytkownik rozwiązuje quiz i widzi wynik

- **Given** odwiedzający podrodze.demokratia.pl bez konta
- **When** wybiera quiz i odpowiada na pytania (quiz ma co najmniej 8 pytań, bez górnego limitu)
- **Then** widzi swój wynik: zgodność z każdą partią

#### Acceptance Criteria
- Wynik jest widoczny bez logowania.
- Źródło pytania jest widoczne przy każdym pytaniu.
- Wynik pokazuje zgodność z każdą partią z quizu.
- Użytkownik może pominąć pytanie.

## Functional Requirements

### Konta
- FR-001: User can register an account and log in. Priority: must-have
  > Socrates: Counter-argument considered: "konto odstrasza niezdecydowanego wyborcę." Resolution: FR bez zmian; konto pozostaje opcjonalne dla quizu (quiz bez konta, konto tylko do zapisu/eksportu/porównania).

### Quiz i wynik
- FR-002: User (including anonymous) can take a quiz chosen from a list of quizzes. Priority: must-have
  > Socrates: No counter-argument; it stands as written.
- FR-003: User can see their agreement with each party after finishing a quiz. Priority: must-have
  > Socrates: Counter-argument considered: "procent zgodności daje fałszywą precyzję." Resolution: FR bez zmian; sposób prezentacji wyniku do rozstrzygnięcia przy Business Logic / Open Questions.
- FR-004: Everyone can see the source for a question. Priority: must-have
  > Socrates: Counter-argument considered: "wymuszanie źródła blokuje dodawanie pytań." Resolution: FR bez zmian; zgodne z guardrailem (każde stanowisko ma źródło).

### Zapis, porównanie, eksport (wymagają konta)
- FR-005: Logged-in user can save their quiz result. Priority: must-have
  > Socrates: Counter-argument considered: "wynik bez odpowiedzi jest bezużyteczny po czasie." Resolution: FR bez zmian; zapis odpowiedzi to osobny FR-006 (nice-to-have).
- FR-006: Logged-in user can save their quiz result together with their answers. Priority: nice-to-have
  > Socrates: Counter-argument considered: "bez odpowiedzi FR-007 (porównanie) nie zadziała." Resolution: sprzeczność rozwiązana przez przeformułowanie FR-007 na porównanie wyników; FR-006 zostaje nice-to-have.
- FR-007: Logged-in user can compare their results (agreement with parties) with others (stats). Priority: nice-to-have
  > Socrates: Counter-argument considered: "porównanie wymaga zapisanych odpowiedzi i zgody na prywatność." Resolution: FR zmieniony — porównanie dotyczy wyników (zgodności z partiami), nie odpowiedzi (wcześniej: "compare their answers with others"). Zasady prywatności porównań nadal otwarte.
  > Harmonogram (2026-10-03): priorytet obniżony z must-have do nice-to-have, aby zmieścić się w terminie 4 XI.
- FR-008: Logged-in user can export their result as a PNG image. Priority: nice-to-have
  > Socrates: Counter-argument considered: "eksport za kontem odstrasza chętnych do udostępnienia." Resolution: FR bez zmian; wymóg konta zachowany (zgodnie z wcześniejszą decyzją o modelu dostępu).

### Admin
- FR-009: Admin can add and modify quizzes. Priority: must-have
  > Socrates: Counter-argument considered: "panel admina można zastąpić prostszym wprowadzaniem danych." Resolution: FR bez zmian; w kontroli krzyżowej rozstrzygnięto, że MVP ma pełny panel admina w aplikacji.
- FR-010: Admin can add and modify party positions with a source. Priority: must-have
  > Socrates: Counter-argument considered: "weryfikacja stanowisk z deklaracji bywa subiektywna." Resolution: FR bez zmian; kryteria weryfikacji deklaracji pozostają otwarte.
- FR-011: Admin can use AI to draft vote summaries and justifications, and must approve them before publication. Priority: nice-to-have
  > Socrates: Counter-argument considered: "AI może wprowadzić błędne lub stronnicze uzasadnienia." Resolution: FR zawiera wymóg zatwierdzenia przez admina przed publikacją; nice-to-have, poza rdzeniem MVP.

## Non-Functional Requirements

- Odpowiedzi użytkownika bez konta nie są trwale zapisywane: po zakończeniu quizu w danych operatora nie zostaje ślad odpowiedzi tej osoby.
- Użytkownik może usunąć swoje konto wraz ze wszystkimi wynikami.
- Zapisane wyniki widzi wyłącznie ich właściciel; inni użytkownicy widzą co najwyżej zagregowane statystyki (por. FR-007), nigdy cudze indywidualne wyniki.
- Produkt jest w pełni użyteczny na dwóch ostatnich wersjach głównych przeglądarek, także mobilnych.
- Wynik zgodności pojawia się w czasie < 2 s po odpowiedzi na ostatnie pytanie.
- Quiz i wynik działają także wtedy, gdy API Sejmu jest niedostępne.
- Każde pokazane stanowisko partii ma widoczną datę źródła lub głosowania.

## Business Logic

Aplikacja liczy dla każdej partii ważoną zgodność między odpowiedziami użytkownika (za / przeciw / wstrzymuję się) a stanowiskiem partii — ustalonym z większości klubu w głosowaniach Sejmu albo z jej deklaracji, zawsze z uzasadnieniem pokazanym użytkownikowi — i pokazuje wynik tylko wtedy, gdy użytkownik odpowiedział na co najmniej połowę pytań.

**Wejścia.** Odpowiedzi użytkownika na pytania quizu (za / przeciw / wstrzymuję się; pytanie można pominąć); stanowiska partii wobec tych pytań wraz ze źródłem i uzasadnieniem; waga ważności każdego pytania (skala 1–3), ustalana przez admina przy tworzeniu pytania.

**Stanowisko partii.** Dla pytań opartych na głosowaniach Sejmu stanowiskiem klubu jest większość klubu; gdy większość wstrzymała się, wstrzymanie jest osobnym stanowiskiem; przy podziale klubu po równo (np. 50/50) klub nie ma stanowiska i pytanie nie liczy się dla tej partii. Dla pytań opartych na deklaracjach stanowisko pochodzi z deklaracji. W obu przypadkach użytkownik widzi uzasadnienie.

**Wynik.** Zgodność z każdą partią z quizu: suma wag pytań ze zgodną odpowiedzią podzielona przez sumę wag pytań, na które użytkownik odpowiedział i dla których partia ma stanowisko. Zgodność pełna = ta sama odpowiedź (za / przeciw / wstrzymuję się); rozbieżność za↔wstrzymuję się liczy się jako 0,25 pełnej zgodności; za↔przeciw = 0. Pominięte pytania nie biorą udziału w wyniku. Jeśli użytkownik pominął więcej niż połowę pytań, wynik nie jest pokazywany (brak wyniku).

## Access Control

Dwie role: **użytkownik** i **admin**.

- Quiz jest dostępny **bez konta** (anonimowo).
- **Konto jest potrzebne**, aby: zapisywać swoje wyniki, eksportować wyniki do obrazów oraz (opcjonalnie) porównywać się z innymi.
- **Admin** zarządza pytaniami i stanowiskami partii ze wskazaniem źródła.
- Niepodane (patrz Open Questions): sposób rejestracji/logowania, sposób nadawania roli admina, zasady prywatności porównań z innymi.

## Non-Goals

- Brak automatycznego importu wszystkich głosowań Sejmu — admin wprowadza konkretne głosowania na potrzeby pytań (zakres funkcjonalny).
- Brak publicznych profili i udostępniania indywidualnych wyników innym użytkownikom — inni widzą co najwyżej zagregowane statystyki (zgodne z NFR prywatności).
- AI nie jest wymaganiem MVP — tylko nice-to-have (FR-011) do szkicowania uzasadnień i streszczeń głosowań przez admina, z obowiązkowym zatwierdzeniem człowieka.
- Brak pełnej zgodności z WCAG-AA oraz brak wersji językowych innych niż polska (zakres niefunkcjonalny).

## Open Questions

1. **Jakie są kryteria weryfikacji stanowisk partii z deklaracji (FR-010)?** — Niepodane; ryzyko subiektywności interpretacji deklaracji. Owner: user.
2. **Jakie są kryteria doboru pytań i partii do quizu?** — Niepodane w danych wejściowych. Owner: user.
3. **Jaki jest stan testów, dokumentacji i repozytoriów demokratia.pl?** — Nieznany; wiadomo tylko, że demokratia.pl nie ma mechanizmu logowania ani zakładania kont (konta z FR-001 są nową pracą, nie reuse). Owner: user.
4. **Jak użytkownik zakłada konto / loguje się i jak nadawana jest rola admina?** — Niepodane. Owner: user.
5. **Jakie są zasady prywatności porównań z innymi (FR-007): kto i co widzi, czy wyniki są domyślnie prywatne?** — Niepodane; przy ~20 uczestnikach statystyki mają bardzo małą próbę (przy 100× tej skali zmieniłyby się tylko statystyki porównawcze, nie reguła domenowa). Owner: user.
6. **Czy wagi ważności pytań (ustalane przez admina) wpływają na FR-007 (porównanie) i na neutralność wobec partii?** — Niepodane. Owner: user.
7. **Jak prezentować wynik zgodności, by nie sugerować fałszywej precyzji (FR-003)?** — Z rundy Sokratesa; nierozstrzygnięte. Owner: user.
8. **Jak weryfikować zapisany wynik po zmianie stanowisk partii (FR-005 bez FR-006)?** — Bez zapisanych odpowiedzi zapisany wynik nie jest weryfikowalny po zmianie stanowisk. Owner: user.
9. **Jaki jest docelowy ruch (`target_scale.qps`) i wolumen danych (`target_scale.data_volume`)?** — Niepodane; znana tylko liczba użytkowników (min 5, średnio 20, max 50). Owner: user.
10. **Czy harmonogram jest realny?** — Szacunek 4–5 tygodni (zapisano `mvp_weeks: 5`) przy ok. 4,5 tygodnia do 2026-11-04 (fallback 2026-12-06): brak zapasu. Potwierdzenie z 2026-10-03: „4-week MVP requires sustained dedication; user accepted”, wydane przed ustaleniem, że konta to nowa praca. Owner: user. By: 2026-11-04.
11. **Czy moment użycia persony jest poprawny?** — „Okres wyborczy, gdy musi zdecydować, na kogo głosować” wyprowadzono z wybranej persony; użytkownik nie opisał momentu osobno. Owner: user.
12. **Jaki mierzalny cel ma kryterium Primary?** — Kryterium opisuje działający przepływ, bez liczbowego progu (np. liczba ukończonych quizów). Owner: user.
