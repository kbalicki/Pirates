# 10 — Poradnik deweloperski

## Wymagania

- Node.js 18+
- npm 9+
- (Opcjonalnie) Python 3.13+ z PyTorch (do generowania assetów)

## Instalacja i uruchomienie

```bash
# 1. Klonowanie repo
git clone <repo-url>
cd PiratesChronicles

# 2. Instalacja zależności
npm install

# 3. Dev server (port 3000)
npm run dev
```

**Ważne:**
- Zawsze restartuj na porcie 3000
- Przed uruchomieniem zabij wszystkie procesy node: `taskkill //F //IM node.exe`
- Nie zostawiaj wielu instancji serwera

## Skrypty npm

| Skrypt | Opis |
|--------|------|
| `npm run dev` | Serwer Vite z hot-reload (port 3000) |
| `npm run build` | Build TypeScript + Vite → `dist/` |
| `npm run preview` | Podgląd builda produkcyjnego |
| `npm test` | Uruchom testy (vitest) |
| `npm run test:watch` | Testy w trybie watch |

## Struktura kodu — konwencje

### Separacja warstw

```
src/core/  → ZERO importów z Phaser. Czysta logika gry.
src/game/  → Warstwa Phaser. Importuje z core/ i persistence/.
src/persistence/ → IndexedDB. Importuje z core/model/.
```

**Nigdy nie importuj Phaser w `src/core/`!** To kluczowa zasada architektury.

### TypeScript

- Strict mode (`tsconfig.json`)
- Branded ID types dla bezpieczeństwa typów (EntityId, PortId, etc.)
- Immutable state — spreads, nie mutacje
- Funkcje czyste w systemach gry

### Fonty

- Zawsze używaj `UI_FONT` lub `txt()` z `src/game/ui/textStyle.ts`
- Nigdy nie hardkoduj fontów
- `txt()` auto-skaluje rozmiar ×1.3

### Nazewnictwo

- Pliki: PascalCase (np. `WorldEngine.ts`, `NavigationSystem.ts`)
- Typy: PascalCase (np. `WorldState`, `EntityState`)
- Funkcje: camelCase (np. `updateNavigation`, `executeBuy`)
- Stałe: UPPER_SNAKE (np. `TICK_MS`, `DIRECTION_REVERSION_RATE`)
- ID: camelCase string (np. `"spain"`, `"sloop"`, `"sugar"`)

## Dodawanie nowej funkcjonalności

### Nowy system gry

1. Utwórz `src/core/systems/NowySystem.ts`
2. Eksportuj czystą funkcję: `updateNowy(state, ...) → state`
3. Zintegruj w `WorldEngine.apply()` (w odpowiedniej kolejności)
4. Dodaj testy w `src/core/systems/__tests__/`

### Nowa komenda gracza

1. Dodaj typ do `src/core/model/Commands.ts`
2. Dodaj reducer w `src/core/engine/reducers.ts`
3. Dodaj mapowanie klawiszy w `src/game/input/InputMapper.ts`

### Nowa scena

1. Utwórz `src/game/scenes/NowaScene.ts` (extends `Phaser.Scene`)
2. Zarejestruj w `src/game/GameApp.ts`
3. Dodaj transitions w odpowiednich scenach

Nie rejestruj scen „na zapas". Scena bez wejścia to martwy kod — dwie takie atrapy (`SaveLoadScene`, `DialogueScene`) przeleżały w repo pół roku, myląc dokumentację.

### Zmiana `WorldState`

Każde nowe pole w `WorldState` **wymaga migracji** w `src/persistence/Migrations.ts`:

1. Podnieś `CURRENT_WORLD_VERSION`
2. Dodaj wpis w mapie `MIGRATIONS` pod nowym numerem
3. Uzupełnij pole wartością domyślną — nigdy nie nadpisuj istniejących danych

Pętla migracji rzuca wyjątkiem przy brakującym kroku, więc pominięcie tego psuje wszystkie stare zapisy.

### Nowy tekst w UI

Klucze i18n dodaje się **równolegle** do `src/core/i18n/locales/en.ts` i `pl.ts`. Brakujący klucz polski cicho spada na angielski.

### Nowy asset pack

1. Utwórz katalog `public/assets/packs/nazwa/`
2. Dodaj wpis w `src/game/settings/AssetPack.ts`
3. Umieść assety wg struktury istniejących packów

## Testowanie

```bash
# Uruchom wszystkie testy
npm test

# Testy w trybie watch
npm run test:watch

# Konkretny plik
npx vitest run src/core/systems/__tests__/NavigationSystem.test.ts
```

Framework: **Vitest 4.0.18** (kompatybilny z Jest API). Stan: **489 testów w 13 plikach**.

| Plik | Co pokrywa |
|---|---|
| `core/systems/__tests__/NavigationSystem.test.ts` | nawigacja, wiatr, diagram polarny |
| `core/systems/__tests__/WeatherSystem` (w powyższym) | martwa strefa, ciągłość krzywej, skalowanie siłą |
| `core/systems/__tests__/CombatSystem.test.ts` | kadencja przeładowania |
| `core/systems/__tests__/BoardingSystem.test.ts` | abordaż i straty |
| `core/systems/__tests__/FleetSystem.test.ts` | flota, prędkość, wzrok, UI |
| `core/systems/__tests__/SailSystem.test.ts` | poziomy żagli i przejścia |
| `core/systems/__tests__/EconomyTickSystem.test.ts` | ekonomia dzienna i efekty wydarzeń |
| `core/systems/__tests__/DamageSystem.test.ts` | stopnie uszkodzeń, tonięcie, brak zakleszczenia na mapie |
| `core/systems/__tests__/ShipRepairSystem.test.ts` | naprawa na morzu, sufity, ratowanie rozbitków |
| `core/systems/__tests__/DuelSystem.test.ts` | pojedynki: riposty, kondycja, AI, determinizm |
| `core/systems/__tests__/DialogueSystem.test.ts` | warunki, efekty, walidacja drzew, drzewo gubernatora |
| `core/systems/__tests__/PlunderSystem.test.ts` | podział łupów, wiek kapitana, punktacja końcowa |
| `core/systems/__tests__/QuestSystem.test.ts` | maszyna questów, mapy skarbów, kopanie, zasadzki |
| `persistence/__tests__/Migrations.test.ts` | łańcuch migracji v1 → v9 |

Testowane są **wyłącznie moduły z `src/core/` i `src/persistence/`** — czysta logika, zero Phasera. Sceny i renderery weryfikuje się w działającej grze.

## Build produkcyjny

```bash
npm run build
```

Wynik w `dist/`:
- `index.html` — główna strona
- `assets/` — bundled JS, CSS, zasoby
- Gotowe do statycznego hostingu (nginx, Apache, Netlify, etc.)

## Deploy

Build produkcyjny można wrzucić na dowolny serwer statyczny:

```bash
# Build
npm run build

# Upload dist/ na serwer
scp -r dist/* user@server:/path/to/webroot/
```

## Generowanie geografii

```bash
# Regeneracja caribbean_geo.json (wymaga internetu)
node scripts/generate_caribbean_geo.mjs
```

Pobiera dane z Natural Earth + OpenStreetMap Overpass API.

## Generowanie assetów (ComfyUI)

Wymaga uruchomionego ComfyUI na `localhost:8188`:

```bash
# Start ComfyUI (z C:\AI)
start_comfyui.bat

# Generuj assety
python scripts/generate_assets_v3.py
```

Szczegóły w `sd-pipeline/README.md` i `ai-assets/README.md`.

## Screenshoty

```bash
# Screenshot gry (wymaga uruchomionego dev servera)
node scripts/screenshot.mjs <url> <plik-wyjściowy> <czas-ms> <akcja>
```

Argumenty są **pozycyjne**, nie flagowe. Akcje: `none` (domyślna), `step2`, `start_game`, `options`.

```bash
node scripts/screenshot.mjs "http://localhost:3000/?skip&zoom=z10" out.png 6000
node scripts/screenshot.mjs http://localhost:3000 out.png 4000 options
```

### drive.mjs — chodzenie po grze klawiaturą

`screenshot.mjs` dociera tylko do tych stanów, które ma zaszyte w kodzie.
`drive.mjs` doprowadza do dowolnego: pompuje zegar Phasera ręcznie, wciska podane
klawisze i zrzuca stan świata.

```bash
node scripts/drive.mjs <url> [out.png] [klawisze] [--scene=Klucz:json] [--wait=ms]

node scripts/drive.mjs "http://localhost:3000/?siege=cartagena" out.png "Space,Space,Space,l"
node scripts/drive.mjs "http://localhost:3000/?skip" out.png "Enter,2" --scene=PortScene:{"portId":"port_royal"}
```

**Dlaczego pompowanie jest konieczne:** karta headless (i każda w tle) dławi
`requestAnimationFrame`, więc pętla Phasera stoi, `delayedCall` nigdy nie odpala i
gra wygląda na zamrożoną. To nie jest błąd gry. Paczki po ≤60 klatek — kilkaset
w jednym `evaluate` wiesza renderer i CDP przerywa po 45 s.

Skrypt wypisuje na koniec `scenes`, `gold`, `citiesCaptured`, `courtship`,
`quests`, `flags` i ostatnie wpisy logu, plus błędy strony (`pageerror`, konsola).

## Konwencje wydań

### Wersjonowanie

Format **czteroczłonowy** `0.x.y.z` — nie semver.

| Człon | Znaczenie |
|-------|-----------|
| `0` | Przed premierą |
| `x` | Duży moduł (bitwy morskie, ekonomia) |
| `y` | Funkcjonalność w ramach modułu |
| `z` | Poprawki i drobne uzupełnienia |

Każde wydanie wymaga trzech zmian naraz:
1. `package.json` → `version`
2. `src/version.ts` → `APP_VERSION`
3. `src/changelog.ts` → nowy wpis **na górze** tablicy `CHANGELOG`

### Assety

Kompresuj **przed** commitem — `sharp` dla PNG, ffmpeg dla JPEG. Oryginały nieskompresowanych sprite'ów miast leżą w `public/assets/sprites/originals/`.

### Parametry debugowania w URL

| Parametr | Efekt |
|----------|-------|
| `?skip` | Pomija tworzenie postaci |
| `?zoom=N` | Startowy poziom zoomu |
| `?debug=1` | Tryb debug (wyłącza mgłę wojny) |
| `?battle=1` | Bitwa testowa z losowym przeciwnikiem |
| `?battle=trader\|navy\|pirate\|hunter` | Bitwa testowa z konkretnym typem |
| `?siege=cartagena` | Szturm na miasto, z fregatą, konsortą i listem kaperskim |

## Deploy produkcyjny

Cel: **pirates.k4.pl** (hosting statyczny).

```bash
npm run build
# ⚠ NAJPIERW wyczyść stare bundle na serwerze — Vite hashuje nazwy plików,
#   więc bez czyszczenia katalog puchnie i można trafić na nieaktualny index.html
scp -r dist/* user@server:/path/to/webroot/
```
