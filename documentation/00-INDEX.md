# Pirates Chronicles — Dokumentacja Projektu

**Wersja:** 0.14.0.0 | **Ostatnia aktualizacja:** 2026-09-03

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
