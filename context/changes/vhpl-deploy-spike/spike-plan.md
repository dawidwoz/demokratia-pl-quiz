# Spike: vh.pl Wizytówka — API Node + MySQL wdrożone z GitHub Actions

Źródło: `context/foundation/infrastructure.md` (kontrola antybiasowa vh.pl, 2026-10-18).
Status: plan, nic nie zostało uruchomione.

## Cel

Rozstrzygnąć na faktach, czy vh.pl obsługuje cały łańcuch MVP bez klikania w cPanelu: statyczny Angular, API Node pod „Setup Node.js App", MySQL i automatyczne wdrożenie po merge do `main`. Wynik ma zamknąć decyzję vh.pl kontra Cloudflare.

## Zakres

- Jednorazowy kod do wyrzucenia: `GET /api/health` i jeden zapis/odczyt wiersza w MySQL. Bez logowania, bez funkcji z PRD.
- Adres testowy na subdomenie vh.pl (nielimitowane). Własna domena `podrodze.demokratia.pl` jest poza spikiem, dopóki nie wiadomo, kto zarządza DNS `demokratia.pl`.
- Czas: jeden wieczór (3–4 h). Rekomendowany termin: do 2026-10-21, żeby zostało ~14 dni do 2026-11-04.

## Bramki ręczne (człowiek, nie agent)

1. W cPanelu: utworzyć subdomenę testową, bazę MySQL z użytkownikiem i aplikację w „Setup Node.js App" (wybrać wersję LTS zgodną z zależnościami, np. 22 lub 24).
2. Wygenerować osobny klucz SSH tylko do wdrożeń i dodać go w cPanelu.
3. W GitHub Secrets ustawić host, użytkownika i klucz SSH. Hasła do bazy i klucze nie trafiają do repo ani do czatu.
4. Zmienne środowiskowe aplikacji (dane do bazy) ustawić w cPanelu.

## Kroki

1. SPA: `npm run build` w CI, wynik w `dist/z-kim-mi-po-drodze/browser`; `rsync` po SSH do katalogu subdomeny; `.htaccess` z regułą przepisywania na `index.html` (LiteSpeed czyta `.htaccess`).
2. API: minimalny serwer Node uruchamiany przez „Setup Node.js App" (sprawdzić w panelu wymagania pliku startowego, bo aplikacja nie wybiera portu samodzielnie). Zależności bez modułów natywnych (`mysql2`; do haszowania wbudowane `crypto.scrypt`).
3. Wdrożenie: workflow GitHub Actions na `push` do `main`: build, rsync SPA i API, instalacja zależności, restart aplikacji. Zapisać, który krok wymaga panelu.
4. Rollback: wdrażać do katalogu z datą i przełączać dowiązanie symboliczne; trzymać poprzedni build.
5. Pomiary i zapis wyników (poniżej).

## Kryteria sukcesu

| # | Kryterium | Pass |
|---|---|---|
| 1 | Logowanie SSH kluczem z runnera GitHub Actions, bez promptów | Workflow kończy się kodem 0, błąd daje niezerowy kod |
| 2 | Przeładowanie głębokiego linku SPA (np. `/quiz/1`) | HTTP 200 i działająca aplikacja |
| 3 | API Node działa na subdomenie po HTTPS | `GET /api/health` zwraca 200 |
| 4 | API łączy się z MySQL na tym samym hostingu | zapis i odczyt wiersza działa |
| 5 | Pełna automatyzacja po merge, w tym restart aplikacji | zero kliknięć w cPanelu; jeśli restart wymaga kliknięcia, wynik = Partial i zapisać jako bramkę człowieka |
| 6 | Opóźnienie po bezczynności ≥ 30 min | pierwsze żądanie < 2 s (cel PRD), kolejne typowo < 300 ms (próg własny; 20 żądań, zapisać p50/p95) |
| 7 | Haszowanie hasła (`scrypt`) | < 500 ms na serwerze, bez błędów budowania |
| 8 | Rollback po złym deployu | powrót do poprzedniej wersji < 5 min bez panelu |
| 9 | Sekrety poza repo | dane do bazy tylko w zmiennych w cPanelu i GitHub Secrets |

Zapisać też: wersję Node, zużycie pamięci, liczbę procesów, metodę restartu, lokalizację logów i czy logi da się czytać przez SSH.

## Reguła decyzji

- **Wybierz vh.pl:** kryteria 1–4 i 6 Pass, a 5, 7, 8 co najmniej Partial z opisanym obejściem.
- **Przejdź do spike'u Cloudflare:** SSH z kluczem niedostępny bez obejścia, API nie uruchamia się pod Node, MySQL niedostępny z aplikacji albo opóźnienie po bezczynności stale > 2 s bez obejścia.
- Po wyniku zaktualizować `infrastructure.md` (macierz, rejestr ryzyk, „Open Decisions") i dopisać reguły do `AGENTS.md`/`lessons.md`.

## Poza zakresem spike'u

Logowanie i role, funkcje z PRD, domena `podrodze.demokratia.pl`, RODO i lokalizacja danych (osobno przed zapisem danych osobowych), obciążenie i testy skali.
