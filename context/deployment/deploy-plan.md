# Pierwsze wdrożenie produkcyjne: vh.pl Wizytówka (plan B: Cloudflare)

## Context

`infrastructure.md` zamknął decyzję: **vh.pl Wizytówka** (cPanel Node.js App + MySQL), Cloudflare jako plan B. Spike na `spike.demokratia.pl` potwierdził łańcuch SSH/rsync z GitHub Actions, SPA z fallbackiem `.htaccess`, API Node 24 pod Passengerem i rollback przez `rollback_to`. Stack (`tech-stack.md`): Angular 21 front-end only, npm, GitHub Actions, self-host; back end jeszcze nie istnieje.

Cel: pierwsze **produkcyjne** wdrożenie na **nowej subdomenie** `demokratia.pl` — obecny szkielet Angulara + minimalne `GET /api/health` — przez produkcyjny workflow, a nie spike'owy. Spike (`spike.demokratia.pl`) zostaje nietknięty. Zatwierdzony plan trafia do `context/deployment/deploy-plan.md`.

Poza zakresem: baza MySQL (nie jest potrzebna dla health-checku; powstanie z nowym losowym hasłem przy back endzie, zamyka to otwartą decyzję nr 6), logowanie, funkcje PRD, auto-deploy po merge, pomiar opóźnienia po bezczynności (osobny krok po wdrożeniu), RODO/lokalizacja danych (przed zapisem danych osobowych).

## Bramki człowieka (przed uruchomieniem workflow; agent tego nie robi)

1. **cPanel, subdomena:** nowa subdomena (nazwa do wyboru przez użytkownika, np. `quiz.demokratia.pl`) ze **stałym** docrootem, np. `quiz-site/live`. Sprawdzić, że AutoSSL wystawił certyfikat. (Skoro `spike.demokratia.pl` działa, DNS tej domeny jest w tym samym cPanelu.)
2. **cPanel, Setup Node.js App:** Node 24, root `quiz-api/app` (stały, bez `releases/`+symlink), URL `<subdomena>/api` (bez `https://`), startup `app.js`. Zmienne `DB_*` na razie niepotrzebne. Zanotować ścieżkę `…/nodevenv/<app>/24/bin/activate` z góry strony.
3. **Klucz SSH:** wystarczy ponownie użyć dedykowanego klucza ze spike'u (to samo konto), chyba że użytkownik woli nowy (Git Bash, `ssh-keygen -t rsa -b 4096 -N ""`, Import Key → Authorize; nie ponawiać nieudanych logowań).
4. **GitHub → Settings → Environments → `production`:** dodać sekrety środowiska `VHPL_HOST`, `VHPL_USER`, `VHPL_SSH_KEY`, `VHPL_KNOWN_HOSTS` (`ssh-keyscan -t ed25519`), `VHPL_SPA_DIR`, `VHPL_API_DIR`, `VHPL_NODE_ACTIVATE` (absolutne ścieżki `/home/<user>/…`, bez końcowego ukośnika) oraz zmienną `VHPL_SITE_URL` (włącza smoke check). Sekrety środowiska przesłaniają spike'owe sekrety repozytorium, więc spike się nie psuje. Opcjonalnie required reviewer na środowisku (zależy od planu GitHub dla tego repo; jeśli niedostępne, bramką zostaje ręczne `workflow_dispatch`).

Klucze i hasła nie trafiają do repo ani do czatu.

## Zmiany w repo (agent, na gałęzi `spike/vhpl-deploy`)

Wzorzec: przeniesienie sprawdzonego kodu ze `spike/` do stałych lokalizacji, bez zmiany logiki wdrożenia.

- `api/app.js`, `api/package.json` (+ `.gitignore`): z `spike/api/app.js` zostawić tylko `GET /api/health` (`status`, `node`, `uptimeSeconds`), usunąć `db-check`, `scrypt-check` i zależność `mysql2`; `process.env.PORT || 3000` bez zmian (zweryfikowane w spike'u). Bez zależności `npm install` jest no-opem, ale krok zostaje na przyszłość. Odświeżyć `package-lock.json`.
- `deploy/vhpl/.htaccess`: `git mv spike/htaccess/.htaccess` (fallback SPA z wyłączeniem `/api/`).
- `scripts/measure-latency.sh`: `git mv spike/scripts/measure-latency.sh` (potrzebny do pomiaru kryterium 6).
- `.github/workflows/deploy-vhpl.yml`: kopia `spike-vhpl-deploy.yml` z zmianami: nazwa `Deploy to vh.pl (manual)`, `concurrency.group: vhpl-deploy`, `environment: production` w jobie, ścieżki `api/` i `deploy/vhpl/.htaccess` (walidacja „commit zawiera deploy/vhpl” dla rollbacku), nagłówek bez „spike”. Zachować: walidację ścieżek `/home/<user>/…`, `rsync --delete` SPA z wyjątkami `/api/ /.well-known/ /cgi-bin/ /error_log`, rsync API bez `--delete`, `npm install --omit=dev` w aktywowanym środowisku (nie `npm ci`), `touch tmp/restart.txt`, smoke check (`/api/health` + głęboki link `/quiz/1`). Zostaje `workflow_dispatch` z `rollback_to`.
- Usunąć `spike/` i `.github/workflows/spike-vhpl-deploy.yml` (historia zostaje w git; `spike-plan.md` w `context/changes/` zostaje jako zapis). Uwaga: rollback do commitów sprzed zmiany wymagałby starego workflow, więc `rollback_to` działa dla commitów zawierających `deploy/vhpl/`.
- `context/foundation/infrastructure.md`: dopisać krótki status pierwszego wdrożenia i zaktualizować „Getting Started” na nowe ścieżki (`api/`, `deploy/vhpl/`, środowisko `production`). Edycja w miejscu, bez kopii.
- `context/deployment/deploy-plan.md`: ten plan jako ścieżka audytowa, po zatwierdzeniu.
- Nie obejmuję niezacommitowanych zmian użytkownika (`CLAUDE.md`, `angular.json` z `analytics: false`, `.claude/`); do osobnej decyzji.

## Wdrożenie (po potwierdzeniu bramek 1–4)

1. Lokalnie: `npm ci && npm run build`, sprawdzić `dist/z-kim-mi-po-drodze/browser/index.html`; `node api/app.js` + `curl localhost:3000/api/health`.
2. Commit na `spike/vhpl-deploy` (z linią Co-Authored-By), push, PR → `main` (opis z linią Claude Code). Wymaga potwierdzenia przez użytkownika przed push/PR. Po bindzie PR: `get_status`, ewentualnie `bind_pr`.
3. Po merge workflow `deploy-vhpl.yml` jest na `main`. Uruchomić go z `main` (`gh workflow run deploy-vhpl.yml --ref main`, jeśli `gh` jest zalogowane; inaczej użytkownik w UI), zatwierdzić środowisko `production`, obserwować przebieg.
4. Produkcja jest ruszana dopiero tym krokiem; destrukcyjne operacje (usuwanie katalogów/aplikacji w cPanelu, zmiana haseł) zostają po stronie człowieka.

## Weryfikacja

- `curl -I https://<subdomena>/` → 200, HTTPS ważny; `/quiz/1` → 200 i `index.html` (fallback SPA).
- `curl https://<subdomena>/api/health` → `{"status":"ok","node":"v24…"}`.
- **Restart (dotąd niepotwierdzony):** uruchomić workflow drugi raz bez zmian i sprawdzić, że `uptimeSeconds` spadło do ~0.
- `<docroot>/api/.htaccess` (zarządzany przez cPanel) nadal istnieje po `rsync --delete`; nie wypisywać jego zawartości (hasło DB w jawnym tekście, o ile zmienne ustawiono).
- Rollback: uruchomić workflow z `rollback_to` = SHA poprzedniego commita zawierającego `deploy/vhpl/` i zmierzyć czas (cel < 5 min); potem wrócić do bieżącego commita.
- Logi: `ssh vhpl tail <API_DIR>/stderr.log` (tylko odczyt), zapisać ścieżkę w „Operational Story”.
- Nie odpytywać w pętli (429 po ~25 szybkich żądaniach).
- Zaakceptowane ryzyko do zamknięcia później: `measure-latency.sh` w pierwszym tygodniu implementacji (próg planu B: > 2 s).

## Wyzwalacze wycofania/plan B

Jak w `infrastructure.md`: opóźnienie po bezczynności > 2 s bez obejścia, blokada SSH z GitHub Actions, niestabilność LVE, RODO. Awaryjny rollback: `rollback_to`, albo przywrócenie kopii 2×/dobę z panelu (człowiek).
