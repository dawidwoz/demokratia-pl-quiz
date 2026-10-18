---
project: Z kim mi po drodze
researched_at: 2026-10-18
recommended_platform: Cloudflare (Workers + static assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Angular 21 (front-end only, statyczny SPA, bez SSR)
  runtime: Node.js (build) / przeglądarka; back end (API + MySQL) jeszcze nie istnieje
---

> **Status decyzji: ODROCZONA.** Po kontroli antybiasowej użytkownik odpowiedział „zdecyduje później" i nie zaakceptował ani nie odrzucił lidera. Cloudflare jest liderem punktowym, a nie decyzją użytkownika. Przed `/10x-implement` i Plan Mode deploy trzeba zamknąć „Open Decisions" poniżej.

## Recommendation

**Lider punktowy: Cloudflare (Workers + static assets). Decyzja nie została jeszcze podjęta.**

Cloudflare zdobył najwięcej punktów (24/24 surowo, 27 po wagach z wywiadu): `wrangler` obejmuje deploy, rollback i logi, dokumentacja ma `llms.txt` i źródła w GitHubie, jest oficjalny MCP, a po stronie platformy koszt dla 5–50 użytkowników to 0 (statyczne zasoby bez limitu, 100k żądań/dzień na Workers). Ocena zakłada bazę D1 (SQLite), bo Cloudflare nie hostuje MySQL; preferencja MySQL ze stacka jest wtedy niespełniona. Wywiad: koszt = minimalizuj, współlokalizacja preferowana, jeden region, trwałe połączenia = nie wiem, znajomość = vh.pl „Wizytówka".

## Platform Comparison

P = Pass (2 pkt), ~ = Partial (1 pkt), F = Fail (0). Wagi: CLI 3, Managed 3, Docs 2, Deploy API 3, MCP 1 (max 24). Korekty z wywiadu: koszt (+2 dla ~0 USD, −2 dla >12 USD/mies., drobne korekty za ryzyka licencji/limitów), znajomość (+1 vh.pl, tylko rozstrzyganie remisów), współlokalizacja (+2 MySQL w cenie, +1 zarządzany Postgres/SQLite lub MySQL prowadzony samodzielnie), region (Netlify −1: plan Free na stałe w Ohio).

| Platforma | CLI | Managed | Docs | Deploy API | MCP | Surowo | Po wagach |
|---|---|---|---|---|---|---|---|
| Cloudflare | P | P | P | P | P | 24 | 27 |
| Vercel | P | P | P | ~ | P (beta) | 21 | 23 |
| Render | ~ | P | P | P | P | 21 | 20 |
| Netlify | ~ | P | P | ~ | P | 18 | 19 |
| Railway | P | ~ | P | ~ | ~ | 17 | 18 |
| vh.pl Wizytówka | ~ | P | F | ~ | F | 12 | 17 |
| Fly.io | P | ~ | P | ~ | ~ | 17 | 15 |

Twardy filtr: odpowiedź „nie wiem" przy trwałych połączeniach nie usuwa platform wyłącznie serverless (PRD i `tech-stack.md` nie wymagają real-time ani zadań w tle: `has_realtime: false`, `has_background_jobs: false`). Wszystkie platformy obsługują statyczny build Angulara. Dla vh.pl twardy filtr (Node/TypeScript) został zaliczony po potwierdzeniu przez użytkownika „Setup Node.js App" w cPanelu (2026-10-18).

### Shortlisted Platforms

#### 1. Cloudflare (Recommended, decyzja odroczona)

- Statyczny SPA jako Workers static assets, komenda `wrangler deploy` (komendy Pages i Workers nie są zamienne). Rollback `wrangler rollback [version-id]` (do 100 ostatnich wersji), logi `wrangler tail` (niezweryfikowane osobno) i Workers Logs.
- Koszt: plan Free to 100k żądań/dzień i 10 ms CPU na wywołanie; Paid od 5 USD/mies. D1: 5 GB, 5M odczytów wierszy/dzień na Free. Hyperdrive Free: 100k zapytań/dzień.
- Dokumentacja: `llms.txt` per produkt, źródła w `cloudflare/cloudflare-docs`. MCP: API MCP (`mcp.cloudflare.com/mcp`, wzorzec Code Mode) i Docs MCP; strona nie oznacza ich jako beta, ale też nie potwierdza GA.
- Słabość: brak hostowanego MySQL, runtime to V8 z warstwą zgodności z Node (`nodejs_compat`, `tls` częściowo), limit CPU w planie Free.

#### 2. Vercel

- Najlepszy DX dla Angulara i funkcji TS; Hobby: 1M wywołań funkcji, 100 GB transferu, 0 USD. Funkcje w `fra1`/`arn1`/`cdg1` (domyślnie `iad1`, brak Warszawy).
- Hobby to licencja niekomercyjna: darmowy quiz bez reklam i płatności wydaje się zgodny, ale nie byłby, gdyby deweloper był za projekt opłacany lub dodano reklamy.
- Brak natywnego MySQL (Marketplace: Postgres, Redis). `vercel rollback` (Instant Rollback) ma status beta w changelogu i na Hobby cofa tylko do poprzedniej produkcji. `vercel logs` bez prawdziwego tail (`--follow` wycofane), Hobby trzyma logi runtime 1 godzinę. MCP `mcp.vercel.com` (OAuth), start oznaczony jako public beta, obecny status niepotwierdzony. WebSockets: public beta, 300 s na Hobby.
- Różnica względem lidera: Vercel wygrywa DX, przegrywa na MySQL/Postgres-only, rollbacku i licencji.

#### 3. Render

- Static site za 0 USD (CDN), API jako Node web service we Frankfurcie, najlepsze API wdrożeń (`render deploys create --wait --confirm -o json`, deploy hooks, rollback przez API), `llms.txt` i `.md` dla każdej strony, oficjalny MCP.
- Koszt około 13–15 USD/mies. (Starter 7 USD + Postgres Basic 6 USD + dysk), więc dużo gorzej dla celu „minimalizuj koszt". Brak zarządzanego MySQL (tylko Docker private service z dyskiem, backupy `mysqldump` ręcznie). Free web service usypia się po 15 min i ma ~1 min cold start; free Postgres wygasa po 30 dniach. Bandwidth Hobby: 5 GB/mies. (źródło trzecie, do weryfikacji).
- Różnica względem lidera: Render płaci za gotowe API i Frankfurt kosztem ~13–15 USD/mies. i bez MySQL.

### Considered, not shortlisted

- **vh.pl Wizytówka (17 pkt, 6. miejsce; poza krótką listą wg punktacji, ale realna opcja):** 49 zł netto/rok (60,27 zł brutto), 5 GB NVMe, 2 rdzenie/2 GB RAM, nielimitowane bazy MySQL, SSH/SFTP, LiteSpeed z `.htaccess`, backupy 2×/dobę przez 31 dni, już opłacony i znany. **Potwierdzone przez użytkownika 2026-10-18 w jego cPanelu:** jest „Setup Node.js App" z wieloma wersjami Node (wymienione: 10.24.1, 24.21.0, 22.23.3) oraz nielimitowana liczba subdomen. Dzięki temu vh.pl przechodzi twardy filtr stacka (Node/TypeScript), a PHP nie jest konieczne. Punktacja nie zmienia się (Node nie wpływa na pięć kryteriów), ale znika główna przeszkoda. Nadal: dokumentacja tylko jako renderowane strony (`llms.txt` zwraca 404), brak MCP, rollbacku i stagingu, brak platformowego CLI (wdrożenie przez SSH/rsync). Niezweryfikowane: Git/cron i SSH z kluczem na tym pakiecie, jak działa restart aplikacji Node po wdrożeniu, limity zasobów dla aplikacji Node (limit 300 procesów, LVE), typ SSL, wersja MySQL/MariaDB, zdalny dostęp do MySQL z GitHub Actions, lokalizacja DC (tylko źródło trzecie: Gdańsk/Gdynia), RODO.
- **Netlify (19 pkt):** świetna obsługa SPA, ale plan Free to twardy limit 300 kredytów (przekroczenie wstrzymuje wszystkie strony), funkcje na stałe w Ohio na Free, brak MySQL (Netlify Database to Postgres, GA od 2026-04-28), brak udokumentowanego rollbacku w CLI.
- **Railway (18 pkt):** zarządzany szablon MySQL (jednowęzłowy obraz Docker, utrzymujesz go sam po zmianach), EU West w Amsterdamie, szacunkowo 8–12 USD/mies. (własna kalkulacja), rollback tylko w dashboardzie, SPA wymaga własnego Dockerfile z Caddy.
- **Fly.io (15 pkt):** brak darmowego planu, brak zarządzanego MySQL (Managed Postgres od 38 USD/mies., status ambiguous), około 15–20 USD/mies. przy samodzielnym MySQL, nieudokumentowany rollback.

## Anti-Bias Cross-Check: Cloudflare

### Devil's Advocate — Weaknesses

1. **Workers to nie Node.** `mysql2` po TCP wymaga `nodejs_compat`, a `tls` jest tylko częściowo obsługiwane. Hyperdrive MySQL (start 2025-04-08) nie ma oficjalnie potwierdzonego GA; połączenie `mysql2` ≥ 3.13.0 z Hyperdrive nie zostało przetestowane.
2. **Preferencja MySQL jest niespełniona.** Albo D1 (SQLite, inny dialekt), albo zewnętrzny MySQL przez Hyperdrive (PlanetScale około 39 USD/mies. wg niezweryfikowanego źródła), co przekreśla cel kosztowy.
3. **Limit 10 ms CPU w planie Free** prawdopodobnie koliduje z haszowaniem haseł przy rejestracji i logowaniu; wymusza plan Paid (5 USD/mies.) albo słabszy algorytm.
4. **Dwa zestawy komend (Pages i Workers).** `wrangler pages deploy` i `wrangler deploy` nie są zamienne, a część tutoriali dotyczy Pages. Agent może użyć złej komendy.
5. **Nauka platformy przy twardym terminie.** Do 2026-11-04 zostało 17 dni, back end nie istnieje, a deweloper zna vh.pl, nie Cloudflare.

### Pre-Mortem — How This Could Fail

Jedyny deweloper wybrał Cloudflare, bo było darmowe i przyjazne agentom. Plan: Angular jako statyczne zasoby, API w Hono, MySQL przez Hyperdrive. W drugim tygodniu okazało się, że `mysql2` po TCP działa niestabilnie, a GA Hyperdrive MySQL nie było oficjalnie potwierdzone. Deweloper przeszedł na D1 i przepisał zapytania pod SQLite, tracąc około czterech dni z siedemnastu. Potem rejestracja zaczęła zwracać błędy przekroczenia limitu CPU, bo haszowanie hasła nie mieściło się w 10 ms, więc trzeba było przejść na plan Paid. Agent, korzystając ze starego tutorialu, wywołał `wrangler pages deploy` zamiast `wrangler deploy` i wdrożył aplikację do osobnego projektu bez bindingu D1. Produkcja pokazywała pusty quiz. Termin 4 XI minął. Fallback z 6 XII dowieziono na vh.pl, gdzie deweloper postawił PHP i MySQL, które znał od początku.

### Unknown Unknowns

- Bez `run_worker_first = ["/api/*"]` (wymaga Wranglera ≥ 4.20.0) żądania do API dostają `index.html` z SPA zamiast trafić do Workera.
- Ścieżka buildu w tym projekcie to `dist/z-kim-mi-po-drodze/browser` (brak `outputPath` w `angular.json`), a przewodnik Cloudflare dla Angulara generuje `dist/browser`. Konfiguracja musi wskazywać właściwą ścieżkę.
- Region D1 i lokalizacja danych nie zostały zweryfikowane, a konta i wyniki użytkowników to dane osobowe (RODO).
- Rollback nie cofa zmian schematu bazy.
- Workers Logs działają na Workers, nie na Pages, więc nowy projekt powinien od razu używać Workers.

## Anti-Bias Cross-Check: vh.pl Wizytówka (alternatywa, 2026-10-18)

Kontrola wykonana na życzenie użytkownika dla stosu Angular 21 (statyczny SPA) + API Node (cPanel „Setup Node.js App") + MySQL na hostingu współdzielonym. Punkty oznaczone „typowe dla cPanel/CloudLinux" pochodzą z ogólnej wiedzy o tej klasie hostingu, nie z dokumentacji vh.pl, i wymagają weryfikacji.

### Devil's Advocate — Weaknesses

1. **Brak rollbacku, stagingu i wersjonowania.** Wdrożenie przez rsync nadpisuje pliki. Zły deploy API albo SPA to ręczne odtwarzanie z poprzedniego katalogu lub z kopii (2×/dobę, 31 dni, przywracanie przez panel).
2. **Operacje wyłącznie w panelu.** Utworzenie aplikacji Node, wersja Node, zmienne środowiskowe (klucz JWT, hasło do bazy) i restart są typowo w UI cPanela. Agent nie ma CLI ani API (żadnego nie znaleziono), więc każda zmiana konfiguracji to bramka dla człowieka.
3. **Aplikacja Node pod Passengerem i limitami LVE** (typowe dla cPanel/CloudLinux): uruchamiana przy pierwszym żądaniu, może być usypiana, dzieli limit 300 procesów i 2 GB RAM z PHP/SSH/cron. Pierwsze logowanie po przerwie może przekroczyć cel PRD „wynik < 2 s".
4. **Moduły natywne i `npm install` na serwerze.** Biblioteki wymagające kompilacji (np. natywny bcrypt) mogą nie zbudować się na hostingu współdzielonym; trzeba wybierać czysty JS/WASM (`mysql2`, haszowanie w czystym JS).
5. **Wdrożenia z GitHub Actions zależą od SSH z kluczem** na tym pakiecie, czego nie zweryfikowano (raport: nie znaleziono artykułów o SSH/Git; checkmarki Git i cron na pakiecie niepotwierdzone).

### Pre-Mortem — How This Could Fail

Deweloper został przy vh.pl, bo znał hosting, płacił za niego i miał w cenie MySQL. Statyczny Angular działał od pierwszego dnia, więc zespół uznał ryzyko za niskie. API Node zostało dodane w ostatnim tygodniu: `app.listen(3000)` nie działało pod Passengerem, a restart aplikacji po każdym deployu wymagał klikania w cPanelu, więc automatyczne wdrożenia z GitHub Actions nigdy nie zostały dokończone. Haszowanie haseł natywną biblioteką nie zbudowało się na serwerze i trzeba było zmienić bibliotekę. Po pierwszym ruchu z mediów aplikacja po przerwie odpowiadała kilka sekund na logowanie, a nieudany deploy w środku dnia nadpisał działającą wersję bez możliwości szybkiego powrotu. Backup sprzed dwunastu godzin przywracano ręcznie przez panel, tracąc zapisane wyniki użytkowników. Agent nie pomógł, bo jedyne instrukcje były w renderowanych stronach pomocy bez `llms.txt`, a kroki w cPanelu musiał wykonywać człowiek.

### Unknown Unknowns

- Aplikacje Node w cPanel (typowe dla CloudLinux Node Selector) startują przez plik startowy i nie wybierają portu samodzielnie. Kod z `app.listen(port)` wymaga dostosowania do hosta. Do weryfikacji w `Setup Node.js App`.
- `node_modules` bywa linkiem do środowiska zarządzanego przez panel, a instalacja idzie przyciskiem „Run NPM Install" albo przez SSH w odpowiednim środowisku. Skrypt wdrożenia musi to uwzględniać.
- Zdalny dostęp do MySQL jest opcjonalny (port 3306 przez SSL); aplikacja Node na tym samym hostingu łączy się lokalnie, ale migracje z GitHub Actions wymagają tunelu SSH (raport: dostęp z IP GitHub niepotwierdzony).
- Lokalizacja centrum danych (źródło trzecie: Gdańsk/Gdynia) i warunki powierzenia danych (RODO) nie zostały zweryfikowane, a konta i wyniki to dane osobowe.
- Domena `demokratia.pl` jest osobnym projektem: kto zarządza jej DNS i czy `podrodze.demokratia.pl` można skierować na vh.pl, nie zostało sprawdzone.

Wynik kontroli: ryzyka vh.pl są głównie operacyjne i konfiguracyjne (panel, restart, brak rollbacku), a nie technologiczne jak u Cloudflare (runtime, baza). Są też tańsze i bliższe temu, co deweloper już zna. Jedyny sposób na ich zmniejszenie przed decyzją to krótki spike: minimalne API Node + MySQL uruchomione na vh.pl i wdrożone z GitHub Actions.

### Operational Story (vh.pl, jeśli wybrany)

- **Preview deploys**: brak natywnych; osobna subdomena (nielimitowane) na staging, wdrażana tym samym skryptem.
- **Secrets**: zmienne środowiskowe aplikacji Node w cPanelu (UI, ręcznie przez człowieka); klucz SSH i dane SFTP jako GitHub Secrets.
- **Rollback**: ręczny; poprzedni build w osobnym katalogu, przełączany dowiązaniem, plus kopie 2×/dobę przez 31 dni. Brak komendy platformowej.
- **Approval**: konfiguracja aplikacji Node, zmiana zmiennych i przywracanie kopii wykonuje człowiek w cPanelu; agent może uruchamiać wdrożenie plików przez SSH/rsync po skonfigurowaniu.
- **Logs**: do weryfikacji (logi aplikacji Node i serwera w panelu lub przez SSH); brak MCP i CLI.

## Operational Story

Zakres tego badania nie objął wszystkich osi; pola oznaczone „do weryfikacji" mają być zamknięte w Plan Mode deploy.

- **Preview deploys**: do weryfikacji w Plan Mode deploy (nie zbadano wersji/preview URL na Workers ani ochrony preview).
- **Secrets**: token API Cloudflare (zakres „Edit Cloudflare Workers", jeden projekt) i `CLOUDFLARE_ACCOUNT_ID` jako GitHub Secrets dla `cloudflare/wrangler-action@v4`; sekrety Workera (np. klucz JWT) przez `wrangler secret put` (komenda spoza tego badania, do potwierdzenia). Tokeny nie trafiają do repo ani do `.mcp.json`.
- **Rollback**: `wrangler rollback [version-id]` (do 100 ostatnich wersji); nie cofa schematu bazy, więc migracje D1/MySQL muszą być wstecznie zgodne.
- **Approval**: człowiek zatwierdza wdrożenie na produkcję, rotację głównego sekretu, usunięcie bazy lub projektu; agent może uruchamiać wdrożenia na koncie z tokenem o minimalnym zakresie. Destrukcyjne operacje wykonuje człowiek w dashboardzie.
- **Logs**: `wrangler tail` (niezweryfikowane osobno) i Workers Logs; API MCP Cloudflare (`mcp.cloudflare.com/mcp`) jako opcja, gdy CLI przestanie wystarczać.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| `mysql2`/TCP na Workers niestabilne albo niedostępne | Devil's advocate | M | H | Zdecydować o D1 vs MySQL przed implementacją; krótki spike z Hyperdrive przed zobowiązaniem |
| Preferencja MySQL niespełniona, zmiana na D1 (SQLite) | Devil's advocate | H | M | Jawna decyzja o zmianie preferencji; zapytania przez warstwę repozytorium |
| Zewnętrzny MySQL przez Hyperdrive podnosi koszt (np. PlanetScale ~39 USD/mies.) | Devil's advocate | M | M | Wybrać D1 albo wziąć darmową/tanią bazę po zweryfikowaniu cen |
| Limit 10 ms CPU w planie Free przy haszowaniu haseł | Devil's advocate | H | M | Zmierzyć na spike'u; budżet 5 USD/mies. na plan Paid |
| Agent używa `wrangler pages deploy` zamiast `wrangler deploy` | Devil's advocate / Pre-mortem | M | H | Zapisać regułę w `lessons.md` (`/10x-lesson`) i `AGENTS.md`; skrypt npm opakowujący deploy |
| Nauka nowej platformy zjada czas przed terminem 2026-11-04 | Pre-mortem | H | H | Zdecydować do początku implementacji; rozważyć vh.pl jako plan awaryjny |
| `/api/*` zwraca `index.html` bez `run_worker_first` | Unknown unknowns | M | M | `run_worker_first = ["/api/*"]` i Wrangler ≥ 4.20.0 |
| Zła ścieżka buildu (`dist/browser` vs `dist/z-kim-mi-po-drodze/browser`) | Unknown unknowns | M | L | Ustawić `assets.directory` jawnie i sprawdzić po buildzie |
| Region D1/danych niezweryfikowany (RODO) | Unknown unknowns | M | H | Sprawdzić opcje lokalizacji przed zapisem danych osobowych |
| Rollback nie cofa schematu bazy | Unknown unknowns | M | M | Migracje wstecznie zgodne; kopia przed migracją |
| Status GA: Hyperdrive MySQL (nieoficjalnie), MCP Cloudflare (bez etykiety), `tls` częściowo; sprawdzone 2026-10-18 | Research finding | M | M | Ponowna weryfikacja przed produkcją |
| Vercel: licencja Hobby niekomercyjna, Instant Rollback w beta | Research finding | L | M | Dotyczy tylko wyboru Vercel; sprawdzić warunki przed wdrożeniem |
| vh.pl: brak rollbacku, stagingu i platformowego CLI; wdrożenie przez SSH/rsync | Research finding | H | M | Trzymać poprzedni build w osobnym katalogu i przełączać dowiązaniem; skrypt wdrożenia w GitHub Actions |
| vh.pl: Node.js potwierdzony przez użytkownika, ale restart aplikacji i limity procesów (LVE, 300) niezweryfikowane | Research finding | M | M | Spike: uruchomić minimalne API Node + MySQL na hostingu przed zobowiązaniem |
| vh.pl: dokumentacja bez `llms.txt` i bez MCP | Research finding | H | L | Zapisać potrzebne kroki w `AGENTS.md`/`lessons.md` zamiast polegać na dokumentacji |
| vh.pl: konfiguracja aplikacji Node, zmienne i restart tylko w panelu, bez CLI/API | Devil's advocate | H | M | Spike wdrożenia; udokumentować kroki ręczne jako bramki człowieka w planie wdrożenia |
| vh.pl: aplikacja Node usypiana/limity LVE, wolne pierwsze logowanie (cel PRD < 2 s) | Devil's advocate | M | M | Zmierzyć czas odpowiedzi po przerwie na spike'u |
| vh.pl: moduły natywne (np. bcrypt) mogą się nie zbudować na hostingu | Devil's advocate | M | M | Używać bibliotek czystego JS/WASM; sprawdzić na spike'u |
| vh.pl: SSH z kluczem dla GitHub Actions niezweryfikowane | Devil's advocate | M | H | Sprawdzić w cPanelu przed wyborem; plan B: SFTP i ręczny restart |
| vh.pl: aplikacja Node pod Passengerem nie wybiera portu (kod `app.listen`) | Unknown unknowns | M | M | Sprawdzić wymagania pliku startowego w „Setup Node.js App" |
| vh.pl: DNS `demokratia.pl` i RODO (lokalizacja DC, powierzenie danych) niezweryfikowane | Unknown unknowns | M | H | Potwierdzić, kto zarządza DNS, oraz warunki RODO u vh.pl przed zapisem danych osobowych |

## Open Decisions

1. **Platforma:** Cloudflare (lider punktowy), Vercel, Render albo vh.pl (poza krótką listą). Użytkownik zdecyduje później.
2. **Baza danych:** D1 (SQLite) kontra zewnętrzny MySQL kontra Postgres. Zmiana preferencji MySQL wymaga aktualizacji `tech-stack.md` (`/10x-tech-stack-selector`).
3. **vh.pl:** ROZSTRZYGNIĘTE 2026-10-18 (zgłoszone przez użytkownika): „Setup Node.js App" jest dostępne, subdomeny nielimitowane. vh.pl wraca do porównania jako pełnoprawna opcja ze stackiem TS/Node i MySQL, bez zmiany `tech-stack.md`. Do sprawdzenia przed wyborem: (a) SSH z kluczem i Git Version Control w cPanelu (potrzebne do wdrożeń z GitHub Actions), (b) czy aplikacja Node wytrzyma 300-procesowy limit i jak się ją restartuje po wdrożeniu, (c) dostęp do MySQL (lokalnie z aplikacji Node na tym samym hostingu).
4. **Kompromis do rozstrzygnięcia przez użytkownika:** punktacja agent-friendly premiuje Cloudflare (CLI, rollback, `llms.txt`, MCP), a wywiad premiuje vh.pl (koszt marginalny około 0 zł, MySQL w cenie, znajomość, jeden region PL, 17 dni do terminu). Punktacja nie zmieniła się po potwierdzeniu Node, ale ryzyko schedule'owe Cloudflare (nauka platformy, D1/MySQL, limit CPU) i ryzyka vh.pl (brak rollbacku/stagingu, wdrożenie rsync, mniej wsparcia dla agenta) mają różny charakter. Kontrola antybiasowa dla vh.pl została wykonana (sekcja „Anti-Bias Cross-Check: vh.pl Wizytówka"); jej wynik: ryzyka vh.pl są operacyjne i do zmierzenia krótkim spike'iem (API Node + MySQL wdrożone z GitHub Actions), a nie architektoniczne.

## Getting Started

Komendy dotyczą Cloudflare i nie były uruchamiane; przed użyciem sprawdź je w bieżącej dokumentacji. Wrangler nie jest zainstalowany w repo (brak w `devDependencies`), a lokalny Node to v25.9.0, wymagania Wranglera wobec wersji Node nie były weryfikowane.

1. Zbuduj SPA: `npm run build`. Wynik trafia do `dist/z-kim-mi-po-drodze/browser` (projekt `z-kim-mi-po-drodze`, brak `outputPath` w `angular.json`).
2. Dodaj `wrangler.toml` z nazwą Workera, `compatibility_date` i sekcją `[assets]`: `directory = "./dist/z-kim-mi-po-drodze/browser"` oraz `not_found_handling = "single-page-application"` (zwraca `/index.html` z kodem 200 dla tras Angulara).
3. Bramka ręczna: załóż konto Cloudflare i utwórz token API ograniczony do „Edit Cloudflare Workers" (jeden projekt, bez DNS i rozliczeń); zapisz `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` jako GitHub Secrets.
4. Wdrożenie: `npx wrangler deploy` (nie `wrangler pages deploy`). W GitHub Actions: `cloudflare/wrangler-action@v4` po `npm run build` przy merge do `main`.
5. Po dodaniu back endu: `run_worker_first = ["/api/*"]` (Wrangler ≥ 4.20.0), binding D1 albo Hyperdrive zależnie od decyzji o bazie, a przed zapisem danych osobowych sprawdź region danych.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
