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
│   ├── scenes/             # 14 scen gry
│   ├── render/             # Renderery: świat, kamera, woda, chmury, góry, palmy
│   ├── input/              # InputMapper, CommandQueue
│   ├── settings/           # Ustawienia: asset pack, zoom, dźwięk
│   ├── audio/              # MusicManager
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
    ├── updateNpcs()        ← spawn, AI, wymiana newsów
    ├── checkEncounters()   ← spotkania losowe
    ├── consumeResources()  ← jedzenie, woda, morale
    └── [zmiana doby]       ← WorldEventSystem + EconomyTickSystem
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

### Jedna decyzja — jedno miejsce

Kiedy ten sam fakt jest liczony w kilku miejscach, rozjechał się już albo
rozjedzie. Trzy moduły istnieją wyłącznie po to, żeby były **jedynym**
czytelnikiem swojego faktu:

| moduł | fakt | co było przedtem |
|---|---|---|
| `core/systems/HoldSystem.ts` | ile eskadra uniesie i co wiezie | każdy ekran sumował `ship.cargo` sam, a konsorty nie miały ładowni (v0.77.0) |
| `core/services/InputGate.ts` | czy to naciśnięcie już zostało obsłużone | `PortScene` miał własną bramkę na jedną klatkę, reszta gry żadnej (v0.78.0) |
| `core/i18n/plForms.ts` + `plurals.ts` | jak odmienić nazwę i liczebnik | zdanie po zdaniu, ręcznie (v0.69.0, v0.74.0) |
| `core/i18n/names.ts` | pod jakim kluczem zapisana jest nazwa | każdy system stemplował gotowe słowo do zapisu (v0.63.0, dokończone v0.79.0) |
| `core/systems/HoldSystem.ts` → `spillIfDetached` | ile stracisz, gdy kadłub odejdzie | ekran nie liczył tego wcale, a od v0.80.0 nie liczy tego **po swojemu** |
| `core/services/menuCursor.ts` | gdzie ma stać kursor po przerysowaniu i gdzie okno, gdy kursor z niego wyszedł | dwa ekrany odpowiadały na to same, i oba źle (v0.82.0) |
| `UIOverlayScene.HUD_ROW` | gdzie stoi która linia pod kompasem | ustawiane w **dwóch** miejscach, które się rozjechały (v0.82.0) |

`game/ui/keys.ts` owija `emit` wtyczki klawiatury, a `GameApp` zakłada to raz na
**wszystkie sceny** — ekran nie musi wiedzieć, że bramka istnieje, i ekran
napisany za rok dostanie ją za darmo.

## Konfiguracja Phaser

```typescript
{
  type: Phaser.AUTO,
  width: window.innerWidth,    // pełne okno przeglądarki
  height: window.innerHeight,
  pixelArt: true,              // nearest-neighbor scaling
  roundPixels: false,          // patrz uwaga niżej
  antialias: false,
  backgroundColor: "#0c2340",
  physics: { arcade: { gravity: { x: 0, y: 0 } } },  // top-down
  scale: { mode: Phaser.Scale.RESIZE }
}
```

**Pułapka:** `pixelArt: true` wymusza `roundPixels: true` na kamerach niezależnie od configu. Bez `camera.setRoundPixels(false)` w `MainMapScene.create()` statek drga przy ruchu subpikselowym — to była przyczyna jittera naprawionego w v0.9.3.

## Internacjonalizacja (i18n)

- 2 języki: angielski (`en`), polski (`pl`)
- System: `I18n.t(key, vars?)` z interpolacją `{{zmienna}}`
- `{{zmienna:forma}}` — polski przypadek zamawiany przez zdanie (v0.69.0),
  formy w `i18n/plForms.ts`; angielski ignoruje sufiks
- `{{n:rzeczownik}}` — zgoda liczebnika (v0.74.0), formy w `i18n/plurals.ts`;
  tę **angielski czyta razem z polskim**, bo „1 days” jest tak samo złe jak „1 dni”
- **Nazwa w `vars` to klucz, nigdy słowo** (v0.63.0). `vars` wpisu dziennika
  **idzie do zapisu** i jest renderowane przy każdym odczycie, więc nazwa
  rozwiązana w miejscu stemplowania zamraża wpis w języku, w którym powstał —
  i od v0.69.0 jest słowem, którego żadne polskie zdanie nie odmieni.
  `t()` rozwija klucz w kształcie `<rodzina>.<id>.name` przy podstawianiu;
  rodziny wylicza `NAME_KEY` w `I18n.ts`, a klucze robią helpery z `names.ts`
  (`NAME_PREFIXES` trzyma obie listy razem)
- Fallback na angielski przy brakujących kluczach
- Wybór języka w localStorage (`pc_lang`)
- 400+ kluczy tłumaczeń

**Trzy strażnicy w `no_hardcoded_text.test.ts`**, bo tekst trafia na ekran
kilkoma kształtami i każdy strażnik widzi jeden:

1. **polska litera w dowolnym literale** pod `src/game` (v0.60.0) — znajduje
   ekran napisany po polsku;
2. **angielskie słowo w trzecim argumencie `add.text`** (v0.76.0) — znajduje
   ekran napisany po angielsku, którego pierwszy strażnik nie widzi z definicji;
3. **słowa w szablonie podanym do `add.text` albo `setText`** (v0.78.0) —
   znajduje `Wind 43%` i `Flota: 2/3`, których nie widzą dwaj poprzedni.

Wszyscy trzej czytają **źródło scen**, nie tabele locale: dwie zgodne tabele nie
mówią nic o ekranie, który nie pyta żadnej z nich. Wciąż poza zasięgiem: szablon
przypisany najpierw do zmiennej.

**Ósmy strażnik — `hud_rows.test.ts`** (v0.82.0) — o najbardziej niewidzialnym
kształcie, jaki dotąd tu złapano: **jedna rzecz umieszczana w dwóch miejscach**.
Siedem linii pod kompasem było pozycjonowanych raz tam, gdzie powstają, i drugi raz
przy zmianie rozmiaru okna — i kopie się rozjechały co do ostrzeżenia o pogodzie
(`sailY + 104` kontra `sailY + 72`, cztery piksele pod linią eskadry). **Żadna
z tych liczb nie jest sama w sobie zła; defektem jest ich niezgoda**, więc żaden
test zachowania nie mógłby tego zobaczyć. Test trzyma tabelę `HUD_ROW`, jej
kolejność i minimalny odstęp, i pilnuje, że **żadna linia nie niesie własnej
arytmetyki**.

**Siódmy strażnik — `menu_cursor.test.ts`** (v0.82.0) — domyka regułę piątego
z drugiej strony: przerysowanie nie rusza kursora **ani okna**, i menu nie
odpowiada na transakcję inną transakcją. Część czysta (`restoreCursor`,
`offsetRevealing`) jest testowana zachowaniem, a nie skanem; reszta to skan
źródła na `switchTab`, `getContentHeight`, `renderSettings` i `VillageScene`.

**Szósty strażnik — `screen_promises.test.ts`** (v0.81.0) — linia podpowiedzi
jest **twierdzeniem o kodzie**: klawisz, który wymienia, musi być w tej scenie
związany. Zmierzone przy okazji i warte zapisania: **pytanie z v0.80.0 („czy
skan źródła złapałby trzy listy obiecujące ↑↓?") ma odpowiedź NIE** — one wiązały
strzałki poprawnie, wiązanie istniało i nic nie robiło. Skan źródła łapie węższy
kształt: klawisz obiecany, a związany **do czegoś innego** (`sound.hint` obiecywał
←→ nad wiązaniami `A`/`D`). Ten sam plik pilnuje też, żeby żadne `.then` w scenie
nie rysowało ekranu, z którego kapitan już wyszedł.

**Piąty strażnik — `cursor_survives_redraw.test.ts`** (v0.80.0) — nie o tekst,
o to samo czytanie źródła: scena nie da się zbudować bez Phasera, więc reguła
*„przerysowanie widoku, na którym stoisz, nie rusza kursora"* jest pilnowana
skanem `switchView` i `switchTab` na bezwarunkowe zerowanie indeksu. Trzy listy
w grze nie dawały się przewijać **od pierwszego commita**, bo tak właśnie
przesuwa się kursor: zwiększ indeks i przerysuj.

**Czwarty strażnik — `stamped_names.test.ts`** (v0.79.0) — patrzy w drugą stronę:
czyta źródło **każdego z 75 wywołań `addLogEntry`** i przewraca się na `t()`
wewnątrz `vars` albo na gołym `factionId` tam, gdzie zdanie drukuje koronę.
Dwie zgodne tabele nie widzą też zdania złego **w obu** kolumnach — a takie
właśnie było *„A england man-of-war has run down a rover"*.
