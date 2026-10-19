---
project: Z kim mi po drodze
researched_at: 2026-10-18
recommended_platform: vh.pl Wizytówka (hosting współdzielony, cPanel Node.js App + MySQL)
runner_up: Cloudflare (Workers + static assets)
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Angular 21 (front-end only, statyczny SPA, bez SSR)
  runtime: Node.js 24.x (back end na cPanel Node.js App, build w CI) / przeglądarka (SPA); API i baza MySQL jeszcze nie zaimplementowane
---

> **Status decyzji: ZAMKNIĘTA przez użytkownika, 2026-10-18.** Wybrano **vh.pl Wizytówka**, a **Cloudflare jako plan B**. To decyzja użytkownika, nie lidera punktowego: macierz agent-friendly premiuje Cloudflare (27 do 17 pkt), a użytkownik rozstrzygnął na korzyść kosztu, MySQL w cenie, znajomości platformy i krótkiego terminu, po spike'u, który potwierdził działanie całego łańcucha. **Zaakceptowane ryzyko:** opóźnienie po bezczynności (kryterium 6 ze spike'u) nie zostało zmierzone; użytkownik zamknął decyzję bez tego pomiaru. Wyzwalacze przejścia na plan B są w sekcji „Recommendation".

## Recommendation

**Wdrożyć na vh.pl Wizytówka (decyzja użytkownika, 2026-10-18). Plan B: Cloudflare.**

Użytkownik wybrał vh.pl, choć Cloudflare wygrał macierz agent-friendly (24/24 surowo, 27 po wagach, wobec 12/24 i 17 dla vh.pl). Uzasadnienie: koszt marginalny około 0 zł (pakiet 49 zł netto/rok jest już opłacony), MySQL w cenie (preferencja ze stacka spełniona bez zmiany `tech-stack.md`), znajomość platformy, jeden region PL i krótki termin (MVP 2026-11-04). Spike potwierdził łańcuch: SSH kluczem z GitHub Actions, SPA z fallbackiem `.htaccess`, API Node 24 z zapisem i odczytem w MySQL, scrypt około 50 ms, rollback przez `rollback_to` (wg użytkownika). Cena: mniejsze wsparcie dla agenta (brak platformowego CLI, MCP i `llms.txt`) oraz ręczne bramki w cPanelu.

**Zaakceptowane ryzyko:** opóźnienie po bezczynności nie zostało zmierzone. Zmierzyć w pierwszym tygodniu implementacji (`scripts/measure-latency.sh`, jedno żądanie na raz).

**Wyzwalacze przejścia na plan B (Cloudflare):**
1. pierwsze żądanie po bezczynności konsekwentnie > 2 s (cel PRD) i brak obejścia,
2. vh.pl blokuje wdrożenia z GitHub Actions (SSH, limity, blokada IP),
3. limity zasobów aplikacji Node (LVE, 300 procesów) powodują niestabilność,
4. warunki RODO lub lokalizacja danych vh.pl okażą się nie do przyjęcia.

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

#### 1. Cloudflare (lider punktowy, plan B)

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

- **vh.pl Wizytówka (17 pkt, 6. miejsce wg punktacji; WYBRANA przez użytkownika po spike'u):** 49 zł netto/rok (60,27 zł brutto), 5 GB NVMe, 2 rdzenie/2 GB RAM, nielimitowane bazy MySQL, SSH/SFTP, LiteSpeed z `.htaccess`, backupy 2×/dobę przez 31 dni, już opłacony i znany. **Potwierdzone przez użytkownika 2026-10-18 w jego cPanelu:** jest „Setup Node.js App" z wieloma wersjami Node (wymienione: 10.24.1, 24.21.0, 22.23.3) oraz nielimitowana liczba subdomen. Dzięki temu vh.pl przechodzi twardy filtr stacka (Node/TypeScript), a PHP nie jest konieczne. Punktacja nie zmienia się (Node nie wpływa na pięć kryteriów), ale znika główna przeszkoda. Nadal: dokumentacja tylko jako renderowane strony (`llms.txt` zwraca 404), brak MCP, rollbacku i stagingu, brak platformowego CLI (wdrożenie przez SSH/rsync). Niezweryfikowane: Git/cron i SSH z kluczem na tym pakiecie, jak działa restart aplikacji Node po wdrożeniu, limity zasobów dla aplikacji Node (limit 300 procesów, LVE), typ SSL, wersja MySQL/MariaDB, zdalny dostęp do MySQL z GitHub Actions, lokalizacja DC (tylko źródło trzecie: Gdańsk/Gdynia), RODO.
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

## Anti-Bias Cross-Check: vh.pl Wizytówka (wybrana platforma, 2026-10-18)

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

## Spike Results: vh.pl Wizytówka (2026-10-18)

Plan i kryteria: `context/changes/vhpl-deploy-spike/spike-plan.md`; kod na gałęzi `spike/vhpl-deploy`. Subdomena testowa `spike.demokratia.pl`, wdrożenie z GitHub Actions (SSH/rsync). Źródło wyników: pomiar curl wykonany przez agenta (kryteria 2, 3, 4, 7), przebieg workflow zgłoszony przez użytkownika (1, 5, 8), konfiguracja cPanela (9).

| # | Kryterium | Wynik | Uwagi |
|---|---|---|---|
| 1 | SSH kluczem z runnera, bez promptów | Pass | Wymagało czystego klucza (patrz „Wnioski") |
| 2 | Głęboki link SPA | Pass | `/quiz/1` zwraca 200 i `index.html` |
| 3 | API po HTTPS | Pass | `/api/health` 200, Node v24.21.0 |
| 4 | MySQL z aplikacji | Pass | zapis i odczyt, wiersz id=2, dane z poprzedniego testu zachowane |
| 5 | Pełna automatyzacja z restartem | Partial | workflow przechodzi bez klikania w cPanelu przy wdrożeniu; rejestracja aplikacji i konfiguracja URL to bramka ręczna, restart przez `tmp/restart.txt` nie został osobno potwierdzony |
| 6 | Opóźnienie po bezczynności | Niezmierzone | pierwsze żądanie po starcie 0,7 s, kolejne 0,1–0,4 s; brak pomiaru po 30 min |
| 7 | scrypt | Pass | 49–59 ms (cel < 500 ms) |
| 8 | Rollback | Pass (wg użytkownika) | przez `rollback_to`: przebudowa i wdrożenie wskazanego commita; czas nie podany, cel < 5 min |
| 9 | Sekrety poza repo | Pass | `DB_*` w cPanelu, klucz SSH i ścieżki w GitHub Secrets |

### Wnioski ze spike'u

- **Układ `releases/` + dowiązanie `current` nie działa z cPanelowym Node selectorem.** cPanel zapisał rozwiązaną ścieżkę wydania jako root aplikacji i nazwał od niej środowisko Node, więc ruchome dowiązanie zostawiało aplikację przypiętą do pierwszego wydania. Wdrożenie jest teraz w miejscu do stałych katalogów (docroot `spike-site/live`, root aplikacji `spike-api/app`).
- **Konfiguracja Passengera i zmienne `DB_*` leżą w `<docroot>/api/.htaccess`, zarządzanym przez cPanel i poza repo.** `rsync --delete` musi je omijać (`--exclude /api/`). Plik zawiera hasło do bazy jawnym tekstem w katalogu domowym.
- **Rejestracja nowej aplikacji Node to ręczna bramka człowieka** w cPanelu (root, URL, startup, zmienne). Dwie aplikacje pod tym samym adresem najprawdopodobniej się blokowały (hipoteza); zadziałało dopiero po usunięciu starej i poprawnym zapisie URL.
- **Nieinteraktywna sesja SSH nie ma `node` ani `npm` w `PATH`.** Trzeba aktywować środowisko aplikacji (`source …/nodevenv/<app>/24/bin/activate`), a `npm install` zamiast `npm ci`, bo cPanel linkuje `node_modules`.
- **Rollback wymaga przebudowy** (kilka minut, nie jest atomowy), bo nie ma przełączalnych wydań.
- **Limit żądań 429 `rate limited`** pojawił się po około 25 szybkich żądaniach z jednego adresu; źródło limitu nie zostało ustalone. W testach obciążeniowych i monitoringu odpytuj rzadko.
- **Windows OpenSSH** odrzucał klucz skopiowany ręcznie (`Load key … Operation not supported on socket`); pomogło wygenerowanie nowego klucza w Git Bashu. Po wielu nieudanych próbach logowania serwer chwilowo zerwał połączenie (`Connection reset`), co wskazuje na ochronę przed próbami włamań.

## First Production Deploy: quiz.demokratia.pl (2026-10-19)

Workflow `.github/workflows/deploy-vhpl.yml` (środowisko `production`, ręczny `workflow_dispatch`), plan: `context/deployment/deploy-plan.md`. Wdrożono szkielet Angulara i `GET /api/health`. Źródło wyników: pomiar curl wykonany przez agenta po wdrożeniu, przebieg workflow zgłoszony przez użytkownika.

| Sprawdzenie | Wynik |
|---|---|
| `/` | 200, `index.html` |
| `/quiz/1` (głęboki link SPA) | 200 |
| `/api/health` | 200, `{"status":"ok","node":"v24.21.0"}`, 0,08 s |
| Restart po wdrożeniu (`uptimeSeconds` blisko 0 po deployu bez zmian) | niepotwierdzony osobno: po ponownym uruchomieniu workflow `uptimeSeconds` wyniosło 11 s |
| Smoke check w workflow | pominięty mimo ustawionego `VHPL_SITE_URL`; do wyjaśnienia (zmienna musi być w Variables środowiska `production`, nie w Secrets) |

Wnioski:
- **Zielony workflow nie dowodzi, że API działa.** Kroki wdrożenia sprawdzają tylko istnienie katalogów i wynik rsync; stan aplikacji sprawdza dopiero smoke check. Bez ustawionej zmiennej `VHPL_SITE_URL` krok jest pomijany.
- **Kolejność bramek: rejestracja aplikacji w cPanelu, potem wdrożenie, a po każdej zmianie rejestracji (Save, Destroy i ponowna rejestracja) trzeba uruchomić workflow jeszcze raz.** Obserwowane objawy: najpierw `/api/health` zwracało 404 z LiteSpeed (aplikacja niepodpięta pod `/api`), po poprawce rejestracji 503 (Passenger nie uruchamia aplikacji), a dopiero ponowne wdrożenie dało 200. Przyczyna 503 nie została zweryfikowana w `stderr.log`; hipoteza: pusty root aplikacji lub odtworzone środowisko po ponownej rejestracji.
- Nowa subdomena `demokratia.pl` tworzona w cPanelu działa bez zmian w DNS (jak `spike.demokratia.pl`).

## Operational Story

Dotyczy wybranej platformy (vh.pl). Pola oznaczone „do potwierdzenia" mają być zamknięte w Plan Mode deploy.

- **Preview deploys**: brak natywnych. Osobna subdomena (nielimitowane) z własnym docrootem i własną aplikacją Node, wdrażana tym samym workflow z innymi sekretami; w spike'u nietestowane (do potwierdzenia).
- **Secrets**: zmienne `DB_*` ustawia człowiek w aplikacji Node w cPanelu; cPanel zapisuje je jawnym tekstem w `<docroot>/api/.htaccess` w katalogu domowym, poza repo (plik nigdy nie trafia do repo ani do czatu). Dedykowany klucz SSH do wdrożeń (bez hasła, osobny od kluczy osobistych), `known_hosts`, ścieżki katalogów i ścieżka `bin/activate` są w GitHub Secrets. Rotacja: nowe hasło w MySQL Databases i aktualizacja zmiennej w aplikacji.
- **Rollback**: workflow z `rollback_to` buduje i wdraża wskazany commit w miejscu (zweryfikowane w spike'u wg użytkownika; czas nie podany, cel < 5 min), plus kopie 2×/dobę przez 31 dni z panelu. Brak komendy platformowej i brak przełączania atomowego; migracje bazy nie cofają się same.
- **Approval**: człowiek rejestruje i zmienia aplikację Node w cPanelu (root, URL, startup, zmienne), zmienia hasła, przywraca kopie i kasuje katalogi. Wdrożenie plików to workflow GitHub Actions uruchamiany ręcznie (`workflow_dispatch`); przejście na auto-deploy po merge do `main` (zgodnie z `tech-stack.md`) dopiero po stabilizacji.
- **Logs**: do potwierdzenia ścieżki; aplikacja Node pisze do `stderr.log` w katalogu aplikacji (cPanel), logi serwera w panelu. Agent czyta przez SSH (`tail`) tylko do odczytu; brak CLI platformy i MCP.

### Operational Story: plan B (Cloudflare)

Zakres badania nie objął wszystkich osi; pola oznaczone „do weryfikacji" miałyby być zamknięte przy ewentualnym przejściu na plan B.

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
| vh.pl: brak rollbacku platformowego, stagingu i CLI; wdrożenie przez SSH/rsync | Research finding | H | M | Rollback przez `rollback_to` (przebudowa, w spike'u działa); układ z dowiązaniem `current` odrzucony, bo nie działa z cPanelowym Node selectorem; staging na osobnej subdomenie |
| vh.pl: Node.js działa (spike), ale restart przez `tmp/restart.txt` nie został osobno potwierdzony, a limity LVE/300 procesów nie były mierzone pod obciążeniem | Research finding | L | M | Potwierdzić restart po kolejnym wdrożeniu (`uptimeSeconds` w `/api/health`); obserwować limity zasobów |
| vh.pl: dokumentacja bez `llms.txt` i bez MCP | Research finding | H | L | Zapisać potrzebne kroki w `AGENTS.md`/`lessons.md` zamiast polegać na dokumentacji |
| vh.pl: konfiguracja aplikacji Node, zmienne i restart tylko w panelu, bez CLI/API (potwierdzone w spike'u: rejestracja aplikacji i URL to ręczna bramka) | Devil's advocate | H | M | Opisać kroki ręczne jako bramki człowieka w planie wdrożenia; jednorazowo przy tworzeniu aplikacji |
| vh.pl: hasło do bazy jawnym tekstem w `<docroot>/api/.htaccess` i łatwo je ujawnić przy wklejaniu | Research finding | M | H | Nigdy nie kopiować tego pliku do repo ani czatu; wypisywać z filtrem `sed`; rotacja hasła po ujawnieniu |
| vh.pl: ochrona przed próbami logowania SSH i limit żądań (429) mogą zablokować IP | Research finding | M | M | Nie ponawiać nieudanych logowań; rzadkie odpytywanie; zapisać procedurę odblokowania przez wsparcie vh.pl |
| vh.pl: opóźnienie po bezczynności NIEZMIERZONE, ryzyko zaakceptowane przez użytkownika bez pomiaru (Passenger może usypiać aplikację; pierwsze żądanie po starcie trwało 0,7 s) | Devil's advocate | M | M | Zmierzyć w pierwszym tygodniu implementacji (`scripts/measure-latency.sh`); próg planu B: pierwsze żądanie po bezczynności > 2 s bez obejścia |
| vh.pl: moduły natywne (np. bcrypt) mogą się nie zbudować na hostingu | Devil's advocate | L | M | Używać wbudowanego `crypto.scrypt` (49–59 ms w spike'u) i bibliotek bez kompilacji |
| vh.pl: wdrożenie SSH z klucza w GitHub Actions i blokady IP po nieudanych logowaniach | Devil's advocate | L | H | W spike'u działa; dedykowany klucz bez hasła, pinowany `known_hosts`, nie ponawiać nieudanych logowań; plan B: SFTP i ręczny restart |
| vh.pl: aplikacja Node pod Passengerem i port (`app.listen`) | Unknown unknowns | L | L | Zweryfikowane w spike'u: `process.env.PORT \|\| 3000` działa pod Passengerem |
| vh.pl: DNS `demokratia.pl` i RODO (lokalizacja DC, powierzenie danych) niezweryfikowane | Unknown unknowns | M | H | Potwierdzić, kto zarządza DNS, oraz warunki RODO u vh.pl przed zapisem danych osobowych |

## Open Decisions

1. **Platforma: ROZSTRZYGNIĘTE 2026-10-18.** vh.pl Wizytówka, Cloudflare jako plan B (decyzja użytkownika, po spike'u). Wyzwalacze planu B: sekcja „Recommendation".
2. **Baza danych: ROZSTRZYGNIĘTE.** MySQL na vh.pl, więc bez zmiany `tech-stack.md`. Wersja MySQL/MariaDB niezweryfikowana; sprawdzić przed użyciem funkcji zależnych od wersji.
3. **Node.js na vh.pl: ROZSTRZYGNIĘTE.** „Setup Node.js App" jest dostępne (Node 24.21.0 działa), subdomeny nielimitowane.
4. **Kompromis agent-friendly kontra koszt i znajomość: ROZSTRZYGNIĘTE przez użytkownika** na korzyść vh.pl, ze świadomością braku CLI, MCP i `llms.txt` oraz ręcznych bramek w cPanelu.
5. **OTWARTE: pomiar opóźnienia po bezczynności** (kryterium 6). Zrobić w pierwszym tygodniu implementacji; wynik > 2 s bez obejścia uruchamia plan B.
6. **OTWARTE: hasło do testowej bazy** (`vh19328_spike`) zostało ujawnione w rozmowie. Do potwierdzenia przez użytkownika, że zostało zmienione; produkcyjna baza ma dostać nowe, losowe hasło.
7. **OTWARTE: domena.** Kto zarządza DNS `demokratia.pl` i czy `podrodze.demokratia.pl` można skierować na vh.pl; warunki RODO i lokalizacja danych vh.pl (źródło trzecie: Gdańsk/Gdynia) do potwierdzenia przed zapisem danych osobowych.
8. **OTWARTE: auto-deploy po merge** (`ci_default_flow` w `tech-stack.md`). Workflow jest na razie ręczny (`workflow_dispatch`); zmienić dopiero po stabilizacji.

## Getting Started

Kroki sprawdzono w spike'u (2026-10-18) i przeniesiono do produkcyjnego workflow `.github/workflows/deploy-vhpl.yml` (środowisko GitHub `production`, ręczny `workflow_dispatch`). Kod: `api/` (aplikacja Node), `deploy/vhpl/.htaccess` (fallback SPA), `scripts/measure-latency.sh`. Plan pierwszego wdrożenia: `context/deployment/deploy-plan.md`. Dotyczy Angular 21 (`dist/z-kim-mi-po-drodze/browser`, brak `outputPath` w `angular.json`) i Node 24.21.0 na hostingu; CI buduje z Node 22. Katalogi i subdomenę wybierz sam.

1. **cPanel (jednorazowo, ręcznie):**
   - Utwórz subdomenę ze **stałym** docrootem (względna ścieżka, np. `<site>/live`).
   - Utwórz bazę MySQL i użytkownika.
   - W „Setup Node.js App" zarejestruj aplikację ze **stałym** rootem (np. `<api>/app`), URL `<subdomena>/api` (domena i ścieżka bez literówek i bez `https://`), startup `app.js`, Node 24, oraz zmienne `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`. Nie używaj układu `releases/` z dowiązaniem `current`: cPanel zapisuje rozwiązaną ścieżkę i przypina aplikację do pierwszego wydania.
   - Dwie aplikacje pod tym samym URL przeszkadzały sobie nawzajem (hipoteza); starą usuń (Destroy) przed rejestracją nowej.
2. **Klucz SSH do wdrożeń:** wygeneruj dedykowany, bez hasła, w Git Bashu (`ssh-keygen -t rsa -b 4096 -f ~/.ssh/<nazwa> -N ""`), wgraj część publiczną w SSH Access → Import Key → Authorize. Przetestuj lokalnie: `ssh -i ~/.ssh/<nazwa> -o IdentitiesOnly=yes -o BatchMode=yes <user>@<host> pwd`. Nie ponawiaj nieudanych logowań (serwer chwilowo zrywa połączenia).
3. **GitHub Secrets (sekrety środowiska `production`):** `VHPL_HOST`, `VHPL_USER`, `VHPL_SSH_KEY` (cały klucz prywatny), `VHPL_KNOWN_HOSTS` (wynik `ssh-keyscan -t ed25519 <host>`), `VHPL_SPA_DIR` (docroot, ścieżka bezwzględna `/home/<user>/...` bez ukośnika na końcu), `VHPL_API_DIR` (root aplikacji, osobny i niezagnieżdżony), `VHPL_NODE_ACTIVATE` (bezwzględna ścieżka `…/nodevenv/<app>/<node>/bin/activate`). Opcjonalna zmienna środowiska `VHPL_SITE_URL` włącza smoke check na końcu biegu.
4. **Wdrożenie:** workflow wykonuje build w CI, `rsync --delete` SPA do docrootu (z wyjątkami `/api/`, `/.well-known/`, `/cgi-bin/`, `/error_log`), `rsync` API do roota aplikacji (bez `--delete`, z pominięciem `node_modules`, `tmp`, `stderr.log`), `npm install --omit=dev` w aktywowanym środowisku i `touch tmp/restart.txt`. Uruchamiasz go ręcznie (plik musi być na `main`, żeby GitHub pokazał „Run workflow").
5. **Rollback:** uruchom ten sam workflow z `rollback_to` ustawionym na 40-znakowy SHA commita zawierającego `deploy/vhpl/` i `api/`; zostanie zbudowany i wdrożony od nowa.
6. **Weryfikacja:** `/` i głęboki link (np. `/quiz/1`) zwracają 200 i aplikację, `/api/health` zwraca `{"status":"ok", "node":"v24…"}`, a `uptimeSeconds` po wdrożeniu jest bliskie 0.
7. **Czego nie robić:** nie kopiuj `<docroot>/api/.htaccess` do repo ani czatu (zawiera hasło do bazy jawnym tekstem), nie odpytuj strony w pętli (po około 25 szybkich żądaniach pojawiło się 429), nie używaj `npm ci` na serwerze (kasuje `node_modules` linkowane przez cPanel).

**Plan B (Cloudflare):** na wypadek wyzwalaczy z sekcji „Recommendation". Użyj `wrangler deploy` (nie `wrangler pages deploy`), `[assets] directory` wskazujący `dist/z-kim-mi-po-drodze/browser` i `not_found_handling = "single-page-application"`, a dla API `run_worker_first = ["/api/*"]` (Wrangler ≥ 4.20.0). Te komendy nie były uruchamiane; sprawdź je w bieżącej dokumentacji, bo Wrangler nie jest w `devDependencies`, a lokalny Node to v25.9.0.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
