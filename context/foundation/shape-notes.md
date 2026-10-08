---
project: "Z kim mi po drodze"
context_type: greenfield
created: 2026-10-03
updated: 2026-10-03
product_type: web-app
target_scale:
  users: medium                # min 5, średnio 20, max 50 (podane przez użytkownika)
  qps: null                    # niepodane — do Open Questions
  data_volume: null            # niepodane — do Open Questions
timeline_budget:
  mvp_weeks: 5                 # szacunek użytkownika: 4–5 tygodni; zapisano górną granicę
  hard_deadline: 2026-11-04    # termin 1 (cel MVP); fallback: 2026-12-06
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "kategoria problemu"
      decision: "paraliż decyzyjny + dane uwięzione (głosowania w Sejmie publiczne, ale nieczytelne dla zwykłego człowieka)"
    - topic: "wgląd produktu"
      decision: "zgodność liczona z faktycznych głosowań w Sejmie, nie tylko z deklaracji partii"
    - topic: "główna persona"
      decision: "niezdecydowany wyborca w okresie wyborczym"
    - topic: "model dostępu"
      decision: "quiz bez konta; konto potrzebne do zapisu wyników, eksportu do obrazów i opcjonalnego porównania z innymi; role: użytkownik + admin"
    - topic: "długość quizu"
      decision: "co najmniej 8 pytań, bez górnego limitu (zmienione z 8–15)"
    - topic: "FR-007 vs FR-006"
      decision: "porównanie z innymi dotyczy wyników (zgodności z partiami), nie odpowiedzi; zapis odpowiedzi (FR-006) zostaje nice-to-have"
    - topic: "reguła domenowa"
      decision: "ważona zgodność odpowiedzi (za/przeciw/wstrzymuję się) ze stanowiskiem partii; stanowisko klubu = większość (wstrzymanie osobnym stanowiskiem); pominięte pytania poza wynikiem; wynik tylko przy ≥ połowie odpowiedzi; wagi ustala admin"
    - topic: "rodzaj produktu i skala"
      decision: "aplikacja webowa; 5–50 użytkowników (średnio 20) → medium; termin 2026-11-04 (best case) / 2026-12-06 (worst case); po godzinach"
    - topic: "uzupełnienie braków (kontrola krzyżowa)"
      decision: "AI = nice-to-have (FR-011, admin zatwierdza); pełny panel admina; formuła: suma wag zgodnych ÷ suma wag odpowiedzianych, za↔wstrzymuję się = 0,25, wagi 1–3 od admina; remis w klubie = brak stanowiska"
    - topic: "zakres MVP"
      decision: "pełny przepływ 1–7 + dane + panel admina, 4 tygodnie; użytkownik świadomie wybrał dłuższy harmonogram zamiast zawężenia"
    - topic: "harmonogram po ponownej ocenie"
      decision: "4–5 tygodni, cel 4 XI 2026 (fallback 6 XII); FR-007 (statystyki porównawcze) obniżone do nice-to-have"
  frs_drafted: 11
  quality_check_status: accepted
---

# Shape notes — Z kim mi po drodze

## Seed idea (verbatim)

Latarnik Wyborczy jako rozbudowa demokratia.pl (Angular + MySQL, nowy projekt). Quiz preferencji wyborczych: pytania oparte na głosowaniach w Sejmie (API Sejmu) i na deklaracjach partii. System liczy zgodność użytkownika z partiami; użytkownik zapisuje swoje wyniki; admin zarządza pytaniami i stanowiskami ze wskazaniem źródła. Cel: ukończony projekt na termin 1 (4 XI 2026), ok. 10 h tygodniowo.

Nierozstrzygnięte: co już działa w demokratia.pl (logowanie, testy, dokumentacja); kryteria doboru pytań i partii; sposób wyznaczania stanowiska klubu z głosowań; weryfikacja stanowisk z deklaracji; stan testów w repozytoriach.

## Vision & Problem Statement

Pain: wyborca szukający partii zgodnej ze swoimi poglądami nie ma dobrego sposobu, by ją znaleźć. Dane o faktycznym zachowaniu partii (głosowania w Sejmie) są publiczne, ale nieczytelne dla zwykłego człowieka; porównywanie ich z deklaracjami i programami to paraliż decyzyjny.

Cost today (podane przez użytkownika): błędny wybór, czas, rezygnacja z głosowania, niedokładny wybór. Obecnie wyborca korzysta z narzędzi bez AI albo robi to sam, manualnie.

Insight: zgodność z partią jest liczona z faktycznych głosowań w Sejmie, a nie tylko z deklaracji.

Rola AI: AI nie jest wymaganiem produktu (must-have). Jest nice-to-have do pisania uzasadnień i streszczeń głosowań (FR-011).

Uwaga o skali: spodziewana liczba użytkowników to min 5, średnio 20, max 50. Przy 100× tej skali reguła domenowa się nie zmienia; zmieniłyby się tylko statystyki porównawcze (FR-007), które przy ~20 uczestnikach mają bardzo małą próbę.

## User & Persona

Główna persona: niezdecydowany wyborca w okresie wyborczym — osoba uprawniona do głosowania, która jeszcze nie wie, na kogo zagłosuje.

Moment: okres wyborczy, gdy musi zdecydować, na kogo głosować (wyprowadzone z wybranej persony; użytkownik nie opisał momentu osobno).

## Access Control

Dwie role: **użytkownik** i **admin**.

- Quiz jest dostępny **bez konta** (anonimowo).
- **Konto jest potrzebne**, aby: zapisywać swoje wyniki, eksportować wyniki do obrazów oraz (opcjonalnie) porównywać się z innymi.
- **Admin** zarządza pytaniami i stanowiskami partii ze wskazaniem źródła.
- Niepodane (patrz Open Questions): sposób rejestracji/logowania, sposób nadawania roli admina, zasady prywatności porównań z innymi.

## Success Criteria

Pierwszy przepływ MVP (zablokowany przez użytkownika):

1. Wejście na podrodze.demokratia.pl
2. Wybór quizu
3. Rozwiązanie quizu (co najmniej 8 pytań, bez górnego limitu)
4. Otrzymanie wyniku
5. (opcjonalnie) Założenie konta, by wyeksportować plik graficzny z rezultatem
6. (opcjonalnie) Zapisanie wyniku quizu na koncie
7. (opcjonalnie) Porównanie wyniku z innymi uczestnikami, jeśli użytkownik jest zarejestrowany

### Primary
- Użytkownik (także bez konta) wybiera quiz, rozwiązuje co najmniej 8 pytań (bez górnego limitu) i otrzymuje wynik zgodności z partiami (przepływ 1–4 działa od początku do końca).

### Secondary
- Eksport wyniku do pliku graficznego (krok 5).
- Porównanie z innymi uczestnikami (krok 7, FR-007) — obniżone do nice-to-have przy ponownej ocenie harmonogramu.
- Nice-to-have w FR: zapis odpowiedzi razem z wynikiem (FR-006), eksport PNG (FR-008), AI do szkiców uzasadnień (FR-011).
- Zapis wyniku na koncie (krok 6, FR-005) i wiele quizów do wyboru (krok 2, FR-002) pozostają must-have.

### Guardrails
- Każde stanowisko partii ma wskazane źródło.
- Neutralność wobec partii: wszystkie partie liczone tym samym algorytmem i na tych samych zasadach.
- Prywatność wyników użytkownika.

## Timeline acknowledgment

Acknowledged on 2026-10-03: 4-week MVP requires sustained dedication; user accepted.

Kontekst: termin 1 (4 XI 2026), ok. 10 h tygodniowo; od 2026-10-03 zostaje ok. 4,5 tygodnia (~40–50 h). Szacunek użytkownika: 4 tygodnie na pełny przepływ 1–7 plus dane i panel admina. Zero zapasu — ryzyko przekroczenia terminu przy opóźnieniu któregokolwiek z kosztownych elementów (stanowiska klubów z głosowań Sejmu, weryfikacja deklaracji).

Ponowna ocena (2026-10-03, po odkryciu, że demokratia.pl nie ma kont): użytkownik szacuje teraz 4–5 tygodni na wszystkie must-have'y i celuje w termin 4 XI 2026 (fallback: 6 XII 2026). Aby zmieścić się w terminie, FR-007 (statystyki porównawcze) przesunięto do nice-to-have. Zapisano `mvp_weeks: 5` (górna granica przedziału); od 3 X do 4 XI zostaje ok. 4,5 tygodnia, więc termin nadal nie ma zapasu.

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

Fakt podany przez użytkownika: **demokratia.pl nie ma mechanizmu logowania ani zakładania kont** — konta (FR-001) są nową pracą, nie reuse. Szacunek 4 tygodni z Fazy 3 powstał przed tą informacją.

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
  > Socrates: Counter-argument considered: "panel admina można zastąpić prostszym wprowadzaniem danych." Resolution: FR bez zmian; czy MVP potrzebuje pełnego panelu, czy prostszego wprowadzania danych — do rozstrzygnięcia (Open Questions).
- FR-010: Admin can add and modify party positions with a source. Priority: must-have
  > Socrates: Counter-argument considered: "weryfikacja stanowisk z deklaracji bywa subiektywna." Resolution: FR bez zmian; kryteria weryfikacji deklaracji pozostają otwarte.
- FR-011: Admin can use AI to draft vote summaries and justifications, and must approve them before publication. Priority: nice-to-have
  > Socrates: Counter-argument considered: "AI może wprowadzić błędne lub stronnicze uzasadnienia." Resolution: FR zawiera wymóg zatwierdzenia przez admina przed publikacją; nice-to-have, poza rdzeniem MVP.

## Business Logic

Aplikacja liczy dla każdej partii ważoną zgodność między odpowiedziami użytkownika (za / przeciw / wstrzymuję się) a stanowiskiem partii — ustalonym z większości klubu w głosowaniach Sejmu albo z jej deklaracji, zawsze z uzasadnieniem pokazanym użytkownikowi — i pokazuje wynik tylko wtedy, gdy użytkownik odpowiedział na co najmniej połowę pytań.

**Wejścia.** Odpowiedzi użytkownika na pytania quizu (za / przeciw / wstrzymuję się; pytanie można pominąć); stanowiska partii wobec tych pytań wraz ze źródłem i uzasadnieniem; waga ważności każdego pytania (skala 1–3), ustalana przez admina przy tworzeniu pytania.

**Stanowisko partii.** Dla pytań opartych na głosowaniach Sejmu stanowiskiem klubu jest większość klubu; gdy większość wstrzymała się, wstrzymanie jest osobnym stanowiskiem; przy podziale klubu po równo (np. 50/50) klub nie ma stanowiska i pytanie nie liczy się dla tej partii. Dla pytań opartych na deklaracjach stanowisko pochodzi z deklaracji. W obu przypadkach użytkownik widzi uzasadnienie.

**Wynik.** Zgodność z każdą partią z quizu: suma wag pytań ze zgodną odpowiedzią podzielona przez sumę wag pytań, na które użytkownik odpowiedział i dla których partia ma stanowisko. Zgodność pełna = ta sama odpowiedź (za / przeciw / wstrzymuję się); rozbieżność za↔wstrzymuję się liczy się jako 0,25 pełnej zgodności; za↔przeciw = 0. Pominięte pytania nie biorą udziału w wyniku. Jeśli użytkownik pominął więcej niż połowę pytań, wynik nie jest pokazywany (brak wyniku).

## Non-Functional Requirements

- Odpowiedzi użytkownika bez konta nie są trwale zapisywane: po zakończeniu quizu w danych operatora nie zostaje ślad odpowiedzi tej osoby.
- Użytkownik może usunąć swoje konto wraz ze wszystkimi wynikami.
- Zapisane wyniki widzi wyłącznie ich właściciel; inni użytkownicy widzą co najwyżej zagregowane statystyki (por. FR-007), nigdy cudze indywidualne wyniki.
- Produkt jest w pełni użyteczny na dwóch ostatnich wersjach głównych przeglądarek, także mobilnych.
- Wynik zgodności pojawia się w czasie < 2 s po odpowiedzi na ostatnie pytanie.
- Quiz i wynik działają także wtedy, gdy API Sejmu jest niedostępne.
- Każde pokazane stanowisko partii ma widoczną datę źródła lub głosowania.

## Non-Goals

- Brak automatycznego importu wszystkich głosowań Sejmu — admin wprowadza konkretne głosowania na potrzeby pytań (zakres funkcjonalny).
- Brak publicznych profili i udostępniania indywidualnych wyników innym użytkownikom — inni widzą co najwyżej zagregowane statystyki (zgodne z NFR prywatności).
- AI nie jest wymaganiem MVP — tylko nice-to-have (FR-011) do szkicowania uzasadnień i streszczeń głosowań przez admina, z obowiązkowym zatwierdzeniem człowieka.
- Brak pełnej zgodności z WCAG-AA oraz brak wersji językowych innych niż polska (zakres niefunkcjonalny).

## Quality cross-check

Status: accepted (2026-10-03). Wszystkie pozycje bramki obecne: Access Control, Business Logic (jedno zdanie + formuła), Project artifacts, Timeline-cost acknowledgment, Non-Goals. Preserved behavior: n/a (greenfield).

Uwaga (nie jest brakiem bramki): szacunek 4–5 tygodni nadal nie ma zapasu względem ok. 4,5 tygodnia do 4 XI 2026 — patrz Open Questions oraz `## Timeline acknowledgment`.

## Forward: tech-stack

- Użytkownik wskazał z góry: Angular + MySQL (preferencja do późniejszego kroku wyboru stosu; nie wchodzi do sekcji PRD).
- Zewnętrzne źródło danych: API Sejmu (głosowania).

## Open items raised by user (unresolved)

- Co już działa w demokratia.pl (logowanie, testy, dokumentacja) — częściowo rozstrzygnięte: brak logowania i kont; testy i dokumentacja nadal nieznane
- Kryteria doboru pytań i partii
- Sposób wyznaczania stanowiska klubu z głosowań — rozstrzygnięte w Fazie 5 (większość klubu; wstrzymanie osobnym stanowiskiem; podział po równo = brak stanowiska)
- Weryfikacja stanowisk z deklaracji — nadal otwarte (kryteria weryfikacji; ryzyko subiektywności)
- Stan testów w repozytoriach
- Rola AI — rozstrzygnięte: nie jest must-have; nice-to-have do szkiców uzasadnień i streszczeń (FR-011), admin zatwierdza
- Jak użytkownik zakłada konto / loguje się i jak nadawana jest rola admina? (zależy od tego, co już działa w demokratia.pl) (z Fazy 2)
- Porównywanie wyników z innymi: czy wyniki są domyślnie prywatne, kto i co widzi? (z Fazy 2)
- Czy wagi ważności pytań (ustalane przez admina) wpływają na FR-007 (porównanie) i na neutralność wobec partii? (z Fazy 5)
- Termin — rozstrzygnięte: celem MVP jest 2026-11-04; 2026-12-06 to fallback (worst case). Szacunek 4–5 tygodni vs ok. 4,5 tygodnia do 4 XI: brak zapasu.
- Docelowy ruch (qps) i wolumen danych — niepodane (z Fazy 6)
- Jak prezentować wynik zgodności, by nie sugerować fałszywej precyzji (FR-003)? (z rundy Sokratesa)
- Priorytet FR-005/FR-006: przy braku zapisanych odpowiedzi zapisany wynik nie jest weryfikowalny po zmianie stanowisk (z rundy Sokratesa)
