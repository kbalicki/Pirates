# Pirates Chronicles — Dokumentacja Projektu

**Wersja:** 0.33.0.0 | **Ostatnia aktualizacja:** 2026-09-05

---

## Spis dokumentów

| # | Dokument | Opis |
|---|----------|------|
| 01 | [Game Design Document](01-GAME-DESIGN.md) | Wizja gry, mechaniki, inspiracja Sid Meier's Pirates! |
| 02 | [Architektura](02-ARCHITECTURE.md) | Warstwy aplikacji, przepływ danych, wzorce projektowe |
| 03 | [Dane statyczne](03-CORE-DATA.md) | Statki, porty, frakcje, towary, ery historyczne |
| 04 | [Systemy gry](04-CORE-SYSTEMS.md) | Nawigacja, pogoda, ekonomia, walka, czas, reputacja |
| 05 | [Modele danych](05-DATA-MODELS.md) | TypeScript: WorldState, EntityState, Commands, Events |
| 06 | [Sceny i UI](06-SCENES-UI.md) | Sceny Phaser, flow gry, HUD, menu |
| 07 | [Rendering](07-RENDERING.md) | Tilemapy, sprite'y, kamera, chmury, efekty wizualne |
| 08 | [Persistence](08-PERSISTENCE.md) | System zapisu (IndexedDB), migracje, format danych |
| 09 | [Zasoby gry](09-ASSETS.md) | Sprite'y, audio, fonty, ikony, asset packi |
| 10 | [Poradnik deweloperski](10-DEVELOPMENT.md) | Uruchomienie, build, testy, konwencje kodu |
| 11 | [Roadmapa rozwoju](11-ROADMAP.md) | Plan rozwoju gry, moduły, fazy implementacji |
| 12 | [Klasy statków](12-SHIP-CLASSES.md) | 9 klas statków — parametry, takielunek, zastosowanie |
| 13 | [Pipeline 3D assets](13-3D-ASSET-PIPELINE.md) | Meshy.ai → spritesheet |

## Powiązane zasoby

- [AI Asset Generation](../ai-assets/README.md) — Subprojekt generowania assetów AI
- [SD Pipeline](../sd-pipeline/README.md) — Workflow ComfyUI + Tiled Diffusion
- [Changelog](../src/changelog.ts) — Historia zmian w kodzie
- [TODO / handoff](../TODO.md) — Bieżący stan prac, dług techniczny, kolejność releasów

## Konwencje

- Dokumentacja w języku polskim
- Sygnatury funkcji w formacie TypeScript
- Stałe i wartości liczbowe dokładnie z kodu źródłowego
- Każdy dokument jest samowystarczalny (nie wymaga czytania innych)

## Notatki z sesji

- [SESSION-2026-09-01.md](SESSION-2026-09-01.md) — v0.9.8.1 → v0.10.0.0: wiatr, testy, uszkodzenia, pojedynki
- [SESSION-2026-09-02.md](SESSION-2026-09-02.md) — v0.9.9.1 → v0.12.0.0: dialogi, łupy, starzenie, emerytura, questy, skarby
- [SESSION-2026-09-04.md](SESSION-2026-09-04.md) — v0.23.0.0 → v0.24.0.0: pętla pieniężna handlu, wycena przy każdym ruchu towaru, reputacja przy ladzie, magazyn na wynajem
- [SESSION-2026-09-04B.md](SESSION-2026-09-04B.md) — v0.24.0.0 → v0.25.0.0: proporczyk ładunku, informator w tawernie, przemyt na nazwisko (i dlaczego sufit bogactwa został odrzucony po raz drugi)
- [SESSION-2026-09-04C.md](SESSION-2026-09-04C.md) — v0.25.0.0 → v0.26.0.0: dostawa ubywa z magazynu, cztery przebiegi dziennego ticku, zamówienie na relief
- [SESSION-2026-09-04D.md](SESSION-2026-09-04D.md) — v0.26.0.0 → v0.27.0.0: głód widać w mieście, ludność z dokładnością do 0,1, miejski spichlerz
- [SESSION-2026-09-04E.md](SESSION-2026-09-04E.md) — v0.27.0.0 → v0.28.0.0: plotki z żywego świata (i odkrycie, że zdarzenia świata nigdy nie trafiały w żaden port)
- [SESSION-2026-09-04F.md](SESSION-2026-09-04F.md) — v0.28.0.0 → v0.29.0.0: zdarzenie, które gracz spotyka; trzy pola bez odbiorcy
- [SESSION-2026-09-05.md](SESSION-2026-09-05.md) — v0.29.0.0 → v0.30.0.0: znaki zdarzeń na mapie, pokój kończący wojnę
- [SESSION-2026-09-05B.md](SESSION-2026-09-05B.md) — v0.30.0.0 → v0.31.0.0: wojna, w której się urodziłeś, i `warBite`
- [SESSION-2026-09-05C.md](SESSION-2026-09-05C.md) — v0.31.0.0 → v0.32.0.0: statek, który ma nazwisko i rozkład; ułamek trasy zamiast pozycji
- [SESSION-2026-09-05D.md](SESSION-2026-09-05D.md) — v0.32.0.0 → v0.33.0.0: raport na mapie (rachuba, nie pozycja) i konwój
- [SESSION-2026-09-05E.md](SESSION-2026-09-05E.md) — v0.33.0.0 → v0.34.0.0: ona się dowiaduje — walka, którą przeżyła, odpowiadana w porcie
- [SESSION-2026-09-05F.md](SESSION-2026-09-05F.md) — v0.34.0.0 → v0.35.0.0: ona ucieka — do jednego z własnych dwóch końców, kursem o najlepszej prędkości uzyskanej
