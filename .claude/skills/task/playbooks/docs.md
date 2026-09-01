# Playbook — aktualizacja dokumentacji

Dokumentacja tego projektu potrafiła stać pół roku bez aktualizacji i wysyłać kolejnych agentów na fałszywe tropy: tabela z 5 klasami statków, gdy w grze było 9; wzór wiatru sprzed czterech wydań; sceny opisane, choć dawno usunięte. **Nieaktualny dokument kosztuje więcej niż jego brak.**

Po każdym zadaniu przejdź tę tabelę i zaktualizuj to, co unieważniłeś.

## Co zmieniłeś → co zaktualizować

| Zmiana | Dokument |
|---|---|
| Parametry statku, nowa klasa, amunicja, towar, era, frakcja | `03-CORE-DATA.md` + `12-SHIP-CLASSES.md` |
| Nowy system w `core/systems/`, zmiana wzoru (wiatr, obrażenia, ekonomia) | `04-CORE-SYSTEMS.md` |
| Nowe pole w `WorldState` / `EntityState` / `CaptainState` | `05-DATA-MODELS.md` |
| Nowa scena, zmiana flow, zmiana zawartości menu | `06-SCENES-UI.md` |
| Nowy renderer, zmiana warstw, zmiana głębokości (depth) | `07-RENDERING.md` |
| Nowa migracja, zmiana formatu zapisu, nowy klucz localStorage | `08-PERSISTENCE.md` |
| Nowy asset, zmiana ścieżek, nowy asset pack | `09-ASSETS.md` |
| Nowy skrypt, zmiana procedury buildu/deployu, nowa konwencja | `10-DEVELOPMENT.md` |
| Ukończenie modułu, zmiana kolejności prac | `11-ROADMAP.md` **i** `TODO.md` |
| Zmiana w pipelinie assetów AI | `ai-assets/README.md` + `sd-pipeline/README.md` |
| Zmiana architektury warstw, stacku, configu Phasera | `02-ARCHITECTURE.md` |

Nagłówek wersji w `00-INDEX.md` aktualizuj przy każdym większym przejściu.

## Podział ról: TODO.md vs roadmapa

- **`TODO.md`** — co robimy **teraz**: dług techniczny, kolejność releasów, konkretne zadania z lokalizacjami `plik:linia`. To tu zagląda agent na starcie.
- **`documentation/11-ROADMAP.md`** — **wizja i zakres** modułów, stan ukończonych faz, kamienie milowe. Zmienia się rzadziej.

Nie duplikuj treści między nimi. Roadmapa linkuje do TODO po kolejność, TODO linkuje do roadmapy po zakres.

## Jak pisać

- Po polsku, jak reszta `documentation/`.
- **Stałe i liczby przepisuj dokładnie z kodu.** Nie „około 9 sekund" tylko `CANNON_COOLDOWN_TICKS = 180` (9 s przy 20 tickach/s).
- Wzory podawaj w blokach kodu, z przykładem liczbowym, jeśli wzór jest nieoczywisty.
- Każdy dokument ma być samowystarczalny — czytelnik nie musi znać pozostałych.
- Znaleziony, ale nienaprawiony błąd opisuj w dokumencie **i** w TODO.md, z lokalizacją i sugerowaną poprawką.

## Kontrola przed commitem

Zadaj sobie trzy pytania:
1. Czy któraś tabela w dokumentacji wymienia teraz nieistniejący plik, scenę albo pole?
2. Czy któraś liczba w dokumentacji rozjeżdża się z kodem po mojej zmianie?
3. Czy `TODO.md` nadal opisuje stan sprzed mojego zadania?

Szybkie sprawdzenie odwołań do plików, które usunąłeś:
```bash
grep -rn "NazwaUsunietegoPliku" documentation/ TODO.md README.md
```
