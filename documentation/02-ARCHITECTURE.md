# 02 — Architektura projektu

## Stack technologiczny

| Komponent | Technologia | Wersja |
|-----------|-------------|--------|
| Język | TypeScript (strict) | 5.9.3 |
| Silnik gry | Phaser 3 | 3.87.0 |
| Bundler | Vite | 7.3.1 |
| Baza danych | IndexedDB via `idb` | 8.0.2 |
| Testy | Vitest | 4.0.18 |
| Geo (dev) | @turf/turf | 7.3.4 |
| Screenshots | Puppeteer | 24.37.5 |

## Struktura katalogów

```
src/
├── core/                    # Czysta logika gry — ZERO zależności od Phaser
│   ├── data/               # Dane statyczne (statki, porty, frakcje, towary...)
│   ├── model/              # Typy: WorldState, EntityState, Commands, Events
│   ├── engine/             # WorldEngine, CombatEngine, reducery
│   ├── systems/            # Systemy: nawigacja, pogoda, ekonomia, czas...
│   ├── services/           # Narzędzia: RNG, geometria, pathfinding
│   └── i18n/               # Tłumaczenia (en, pl)
├── game/                    # Warstwa Phaser — rendering, input, UI
│   ├── scenes/             # 11 scen gry
│   ├── render/             # Renderery: świat, kamera, chmury, minimap
│   ├── input/              # InputMapper, CommandQueue
│   ├── settings/           # Ustawienia: asset pack, zoom
│   └── ui/                 # Style tekstu, helpery UI
├── persistence/             # Zapis/odczyt: IndexedDB, migracje
├── main.ts                  # Bootstrap
├── version.ts               # APP_VERSION
└── changelog.ts             # Historia zmian

public/
├── assets/                  # Zasoby gry
│   ├── packs/              # Asset packi (classic, generated, stylized)
│   ├── sprites/            # Sprite'y globalne
│   ├── tiles/              # Animowane kafelki wody
│   ├── fonts/              # Fonty (Dancing Script, Pirates)
│   ├── audio/              # Muzyka i dźwięki
│   └── ui/                 # Tekstury UI
└── data/                    # Dane statyczne (caribbean_geo.json)
```

## Zasada separacji warstw

```
┌─────────────────────────────────────────────────────┐
│  game/ (Phaser)                                     │
│  Rendering, input, sceny, UI                        │
│  IMPORTUJE z core/ i persistence/                   │
├─────────────────────────────────────────────────────┤
│  core/ (Pure TypeScript)                            │
│  Logika gry, modele, systemy                        │
│  NIE IMPORTUJE z game/ ani persistence/             │
├─────────────────────────────────────────────────────┤
│  persistence/ (IndexedDB)                           │
│  Zapis/odczyt, migracje                             │
│  IMPORTUJE z core/model/                            │
└─────────────────────────────────────────────────────┘
```

**Kluczowa zasada:** `src/core/` nie ma żadnych importów z Phaser. Cała logika gry jest testowalna bez silnika graficznego.

## Przepływ danych — główna pętla

```
     Klawiatura
         │
    InputMapper            ← mapuje klawisze na Commands
         │
    CommandQueue            ← buforuje komendy
         │
    WorldEngine.apply()     ← główna symulacja (20 ticków/s)
    ├── reduceCommand()     ← aplikuje komendy do stanu
    ├── advanceTime()       ← postęp czasu
    ├── updateWeather()     ← model pogodowy
    ├── updateNavigation()  ← ruch, kolizje, auto-desant
    ├── checkEncounters()   ← spotkania losowe
    └── consumeResources()  ← jedzenie, woda, morale
         │
         ├── WorldState (nowy, immutable)
         ├── WorldEvent[] (dźwięki, toasty, notyfikacje)
         └── Transition[] (zmiany scen)
         │
    WorldRenderer.sync()    ← aktualizacja sprite'ów
    HUD.update()            ← tekst, liczby
    Camera.update()         ← smooth follow
```

## Wzorce projektowe

### Command Pattern
Wszystkie akcje gracza są komendami (`Commands.ts`):
- `SetSailLevel`, `Turn`, `SetHeading` — nawigacja
- `EnterPort`, `ExitPort` — interakcja z portami
- `TradeBuy`, `TradeSell` — handel
- `FireCannons`, `StartSeaBattle` — walka
- `SaveGame`, `LoadGame`, `NewGame` — persistence

### Immutable State
- Każdy tick produkuje nowy obiekt `WorldState` (spread operators)
- Brak mutacji — łatwe śledzenie zmian, możliwość replay

### Deterministic RNG
- Mulberry32 PRNG z seedem w stanie gry
- Ten sam seed = ta sama rozgrywka
- Stan RNG jest częścią `WorldState`

### Fixed Timestep
- 20 ticków na sekundę (TICK_MS = 50ms)
- Akumulator delta — niezależność od FPS renderowania
- Gwarantuje spójność fizyki niezależnie od wydajności

## Konfiguracja Phaser

```typescript
{
  width: 800,
  height: 600,
  pixelArt: true,              // nearest-neighbor scaling
  physics: { arcade: { gravity: { y: 0 } } },  // top-down
  scale: { mode: Phaser.Scale.FIT, autoCenter: CENTER_BOTH }
}
```

## Internacjonalizacja (i18n)

- 2 języki: angielski (`en`), polski (`pl`)
- System: `I18n.t(key, vars?)` z interpolacją `{{zmienna}}`
- Fallback na angielski przy brakujących kluczach
- Wybór języka w localStorage (`pc_lang`)
- 150+ kluczy tłumaczeń
