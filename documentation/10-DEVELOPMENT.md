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
node scripts/drive.mjs "http://localhost:3000/?defend=cartagena&soldiers=300" out.png "g,g,g,t,t,t,l,t"
node scripts/drive.mjs "http://localhost:3000/?skip" out.png "Enter,2" --scene=PortScene:{"portId":"port_royal"}
node scripts/drive.mjs "http://localhost:3000/?relief=cartagena" out.png "s,s,s,s,Enter" --scene=PortScene:{"portId":"cartagena"}
```

**Dlaczego pompowanie jest konieczne:** karta headless (i każda w tle) dławi
`requestAnimationFrame`, więc pętla Phasera stoi, `delayedCall` nigdy nie odpala i
gra wygląda na zamrożoną. To nie jest błąd gry. Paczki po ≤60 klatek — kilkaset
w jednym `evaluate` wiesza renderer i CDP przerywa po 45 s.

Skrypt wypisuje na koniec `scenes`, `gold`, `citiesCaptured`, `courtship`,
`quests`, `flags`, ostatnie wpisy logu i błędy strony (`pageerror`, konsola),
a od v0.15.0 także:

| Pole | Co pokazuje |
|---|---|
| `towns` | porty z `capturedDay` albo garnizonem: właściciel, ludzie, obrona |
| `reliefs` | eskadry odbijające w drodze: cel, korona, dni, żołnierze |
| `staleFlags` | porty, których **narysowana** flaga nie zgadza się z właścicielem — dokładnie ten błąd, przed którym broni odświeżanie flag w `MainMapScene` |

Nawigacja czeka na `domcontentloaded`, nie `networkidle0`: socket HMR Vite i
strumień audio gry trzymają otwarte żądanie tak długo, jak żyje strona, więc
`networkidle0` zawsze wyczekiwał swój timeout i przerywał przebieg, zanim ten
się zaczął. Boot pokrywa `--wait`.

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
| `?zoom=z10` | Startowy poziom zoomu (`z1`..`z14`). Od v0.30.0 działa **za pierwszym razem** — wcześniej zapis szedł prosto do `localStorage`, a `initZoomSetting()` odczytuje go w `BootScene`, czyli wcześniej |
| `?era=<id>` | Era historyczna dla `?skip` (`silver_empire`, `merchants_smugglers`, `new_colonists`, `war_for_profit`, `buccaneer_heroes`, `pirates_sunset`). Trzy z nich otwierają się w środku wojny (v0.31.0) |
| `?hunt=<port>` | Kapitan w tawernie tego miasta z pościgiem informatora na stole (v0.32.0) |
| `&meet=1` | Zamiast tego na wodzie dokładnie tam, gdzie **jego mapa** stawia nazwany statek — razem z `?hunt=`. Od v0.33.0 wybiera statek **z eskortą**, jeśli jest w zasięgu |
| `&harried=N` | Nazwanemu statkowi N nieodpowiedzianych strachów, jedną przeprawę przed portem, z raportem już na mapie (v0.34.0). Pierwszy dzienny tick robi to, do czego doprowadziłaby walka: cumuje, wychodzi później, bierze konsortę, a przy N ≥ 2 zmienia szlak — podczas gdy złoty kurs i romb dalej opisują trasę, o której kapitanowi powiedziano |
| `&chase=1` | Kapitan 90 jednostek za jej rufą, ona z jednym strachem na koncie, czyli uciekająca przed każdym (v0.35.0). Jedyny świat debugowy, w którym mapa jest bez znaczenia: patrzy się na jej kurs, jej żagle, na to, który z własnych dwóch portów wybrała, i na eskorty zawracające na gracza |
| `?skip&notoriety=N` | Nazwisko, zanim zostało zapracowane (v0.36.0), 0-100. Wszystko, co czyta notoriety — uciekający kupcy, przemyt do przystani pirackiej, łowcy — jest inaczej o godzinę łupiestwa dalej |
| `?marque=<port>` | Kapitan przy biurku gubernatora z **cudzym** listem kaperskim w kieszeni (v0.37.0): reputacja 40 u korony tego miasta, list Anglii w ręku i wojna Anglii z tą koroną. Jedyny ekran tego wydania, który może się zepsuć po cichu — oferta ma dwa teksty, a ten drugi nazywa koronę, którą oddajesz |
| `?storm=1` / `?storm=N` | Świat już w szkwale (v0.38.0). Prawdziwy trwa 120-600 ticków i jest losowany z prawdopodobieństwem rzędu 1e-5 na tick, więc czekanie na niego nie jest testowaniem. `N` ustawia licznik w tickach — `?storm=150` pozwala zobaczyć, jak szkwał **przechodzi** (toast + wpis w dzienniku). `W` stawia żagle, `S` refuje |
| `?current=1` | Statek **dryfujący pod gołymi masztami** w Cieśninie Florydzkiej (v0.41.0). Prąd 4 węzły przeciw dwunastu fregaty, więc statek bez ani metra płótna i tak robi drogę na NE — czyli cała różnica między prądem a wiatrem, na jednym ekranie. `C` przełącza rysowanie prądów, `W` stawia żagle |
| `?fog=1` | Gęsta mgła nad statkiem (v0.40.0). Mgła wymaga trzech rzeczy naraz — ciszy, małych godzin i ławicy akurat tutaj — więc czekanie na nią nie jest testowaniem. Parametr zbija wiatr do 0,04, ustawia zegar na 04:00 i **przeszukuje pierwsze sześć tygodni kalendarza** za nocą, której ławica leży nad statkiem; nie rusza statku, bo pole szumu jest kluczowane nocą, a przesuwanie statku umiałoby go wsadzić na plażę. Po ~360 tickach dochodzi 10:00 i mgła się podnosi — z toastem i wpisem w dzienniku. Nie mylić z `pc_fog` w localStorage, które przełącza **mgłę wojny** |
| `?plate=<port>` | **Flota skarbowa już na morzu** (v0.46.0), z kapitanem w poprzek jej kursu. `<port>` to jedna z czterech przystani srebra (`vera_cruz`, `porto_bello`, `nombre_de_dios`, `cartagena`; domyślnie Puerto Bello). Świat stempluje siedemnastodniowe wypłynięcie, przewija zegar **za okres ładowania** i stawia gracza tam, gdzie ona jest — bo `createEventWorld` sam z siebie zostawiłby ją w porcie przez pierwsze pięć dni, czyli pokazywałby oczekiwanie zamiast konwoju. `&wait=1` stawia go zamiast tego pod Hawaną, z newsem na czarcie i nią jeszcze za horyzontem: to druga połowa tej samej decyzji. `&zoom=z2` pokazuje całą drogę z pierścieniem na Hawanie |
| `?hurricane=<port>` | Statek **w środku huraganu** stojącego nad tym miastem (v0.39.0). `?event=hurricane&port=` wystawia samo zdarzenie i zostawia statek tam, gdzie postawił go świat oblężenia — czyli zwykle daleko. Tu wszystko jest naraz na ekranie: krążący wiatr, ciemniejsza zasłona, linia HUD, ubywający kadłub i takielunek. **Uwaga: żagle startują zwinięte** — `MainMapScene.create()` zawsze buduje `new SailSystem(0)` i ignoruje `entity.sailLevel`, więc `?storm=` też nie startuje „pod pełnymi żaglami". `W` je stawia. W huraganie gołe maszty **nie ratują** i to jest cały sens. **Od v0.45.0 świat ten wystawia prawdziwą DROGĘ** (`stageStormRoad`): trzy miasta z `pickNeighbours`, czyli tej samej funkcji, której używa generator, i pięć dni — środek tabelowego pasma 3-7. Oko przechodzi nad nimi po kolei, a kreskowana droga i pierścień są na czarcie. Bez tego świat debugowy pokazywał zachowanie **sprzed** tej wersji: jedno miasto, sześćdziesiąt dni, oko, które nigdy nie drgnęło. Pierścień ma 260 jednostek promienia — żeby go zobaczyć w całości, dodaj `&zoom=z1` |
| `?debug=1` | Tryb debug (wyłącza mgłę wojny) |
| `?battle=1` | Bitwa testowa z losowym przeciwnikiem |
| `?battle=trader\|navy\|pirate\|hunter` | Bitwa testowa z konkretnym typem |
| `?siege=cartagena` | Szturm na miasto, z fregatą, konsortą i listem kaperskim |
| `?relief=cartagena` | Miasto już zdobyte, eskadra królewska dociera dzisiaj |
| `&garrison=N` | Ilu ludzi stoi na murach (domyślnie 120) — razem z `?relief=` |
| `&soldiers=N` | Wielkość eskadry (domyślnie 100) — `&soldiers=600` gwarantuje utratę miasta |
| `?defend=cartagena` | Rozgrywalna bitwa obronna od razu, bez czekania na eskadrę |
| `&ally=1` | Bronisz cudzej kolonii (list kaperski dodany), a nie własnego miasta |
| `&garrison=N` `&soldiers=N` | Ludzie na murach (domyślnie 60) i wielkość wyprawy (domyślnie 140) — razem z `?defend=` |
| `?intercept=cartagena` | Wyprawa w połowie przeprawy, gracz stoi dokładnie na niej — do przechwycenia na morzu |
| `&soldiers=N` | Wielkość wyprawy (domyślnie 200) — razem z `?intercept=` |
| `?commission=port_royal` | Gubernator z kolonią pod desantem i listem kaperskim w kieszeni gracza |
| `?home=port_royal` | Kapitan żonaty z córką tamtejszego gubernatora, poobijana flota i pełna ładownia |
| `?blockade=havana` | Fregata na stanowisku pod tym portem, kordon dzień przed zaciśnięciem |
| `?famine=tortuga` | Kapitan stoi w mieście, którego dostawca jest pod czarną banderą; miasto od dwóch tygodni głoduje |
| `&stand=cover` | Stoi zamiast tego w porcie, który przejął cudze kursy — razem z `?famine=` |
| `?skills=navigation:10,medicine:0` | Kapitan, który wydał punkty gdzie indziej (v0.47.0). Działa z `?skip` i `?battle=`. Trzy z pięciu umiejętności nic nie robiły do tego wydania, a jedyną drogą do konkretnego zestawu było przejście tworzenia postaci ręcznie |
| `?ship=galleon` | Start w tym kadłubie (v0.48.0). Jedyny sposób, żeby poczuć sondowania: startowy slup zanurza 1,5 m i przechodzi wszędzie |
| `?wounded=40` | Tylu ludzi już leży pod pokładem — lazaret widać dopiero przez kilkanaście dni po walce, więc bez tego nie da się go obejrzeć |
| `?event=hurricane&port=havana` | Dowolne z 15 zdarzeń świata na dowolnym mieście, statek postawiony tak, że dialog zbliżania otwiera się sam. Od v0.30.0 zdarzenie **i wszystkie zasiane** trafiają do `knownEventIds`, więc widać też znaki na mapie |

## Deploy produkcyjny

Cel: **pirates.k4.pl** (hosting statyczny).

```bash
npm run build
# ⚠ NAJPIERW wyczyść stare bundle na serwerze — Vite hashuje nazwy plików,
#   więc bez czyszczenia katalog puchnie i można trafić na nieaktualny index.html
scp -r dist/* user@server:/path/to/webroot/
```
