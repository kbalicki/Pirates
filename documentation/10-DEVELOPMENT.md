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
- Przed uruchomieniem zwolnij port 3000 **po PID**, nigdy po nazwie obrazu:
  `netstat -ano | grep ":3000 .*LISTENING" | awk '{print $5}' | sort -u | xargs -r -I{} taskkill //F //PID {}`
- **Nigdy `taskkill //F //IM node.exe`** — `//IM` ubija każdy `node.exe` na maszynie
  (bramki MCP, serwery innych projektów). I **nigdy `taskkill` na przeglądarce**:
  puppeteer ma `browser.close()`, a otwarte karty użytkownika to jego praca
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

### sweep-constants.mjs — dwie liczby o jednej rzeczy (v0.87.0)

```bash
node scripts/sweep-constants.mjs            # wszystkie wymiary
node scripts/sweep-constants.mjs px days     # tylko te
```

Wypisuje **jedną tabelę na wymiar**, posortowaną po wartości: każdą nazwaną
stałą liczbową w `src/` plus każdy goły literal wpisany do zmiennej, której
nazwa deklaruje wymiar (te są oznaczone `*`). Wymiar bierze się **z nazwy** —
`_DAYS`, `_TICKS`, `_TONS`, `_RANGE`/`_RADIUS`/`_DIST`, `_GOLD`/`_PRICE`,
`_CREW`, `_YEARS`, `_SHARE`/`_RATIO` — bo nic innego w tym repo nie zapisuje
jednostki, i w tym jest cały problem.

Trzy wydania z rzędu znalazły ten sam kształt ręcznie: v0.84.0 w cyfrach
zakładek, v0.85.0 w progu zrywania kontaktu, v0.86.0 w zasięgu bosaka. To jest
przemiatanie, które znajduje je wszystkie naraz.

**Jak czytać wynik.** Bierz sąsiadujące wiersze i pytaj, czy to nie są dwie
nazwy jednej rzeczy — a potem czytaj komentarze nad nimi, bo tam siedzi
twierdzenie, i to twierdzenie się psuje. Tabela oznaczona **"BOTH layers"** jest
znaleziskiem sama w sobie: `core/` nie umie zaimportować liczby z `src/game/`,
więc może o niej tylko **pisać prozą** — i tak właśnie `PredationSystem`
napisał, że gracz widzi 700, przy lunecie sięgającej 65.

Uwaga na fałszywe trafienia: `px` miesza piksele areny (bitwa) z pikselami
świata (mapa), a `RAID_DISTANCE_FEE` jest złotem za odległość, nie odległością.
Stałe strażnika, które z tego wyszły, są w `src/core/__tests__/dimensions.test.ts`.

---

### measure-battle.mjs — czy przeciwnik jest w kadrze (v0.85.0)

Arena bitwy ma **trzy ekrany** szerokości, a kamera chodzi za graczem. Ten skrypt
przejeżdża bitwę i co 60 klatek pyta żywą scenę o odległość, o to, czy przeciwnik
mieści się w `cameras.main.worldView`, oraz o oba zegary zrywania kontaktu.

```bash
node scripts/measure-battle.mjs 4 --policy=hold            # kapitan stoi
node scripts/measure-battle.mjs 4 --policy=run             # kapitan ucieka
node scripts/measure-battle.mjs 1 --kinds=navy --policy=hold
```

To on zamknął pozycję „arena jest za duża” z listy zadań. Przed v0.85.0, przy
stojącym kapitanie: przeciwnika nie było w kadrze przez **11,3 %** klatek, dystans
przez całe dwie minuty nie spadł poniżej 425 px, a zegar dalekiego dystansu
chodził **przez całą bitwę** (119 988 ms). Po — **0 %**, także przy kapitanie
uciekającym na pełnych żaglach we wszystkich czterech archetypach.

**Uwaga:** nie edytuj plików w `src/` w trakcie przebiegu. HMR Vite przeładuje
stronę i puppeteer przerwie z `Execution context was destroyed`.

Od v0.86.0 bitwa potrafi **sama** otworzyć `DuelScene` (przeciwnik idzie na
abordaż), więc `endedAt: "scene gone"` w wyniku pomiaru nie musi znaczyć końca
walki. Najszybsza droga do tego stanu: `?battle=navy&crew=12` — dwunastu ludzi
przeciwko trzydziestu to przewaga ponad `BOARDER_CREW_RATIO`, a załoga poniżej
połowy etatu spełnia warunek osłabionego pokładu od pierwszej klatki.

### audit-layout.mjs — jedna scena, która rzuci, nie zabiera raportu

Od v0.85.0 każda scena jest w `try`/`catch`. Printer od początku umiał pokazać
`row.error`, ale w pliku **nie było żadnego `catch`**, więc przebieg szesnastu
scen kończył się bez jednej linijki, jeśli czwarta rzuciła. Narzędzie, które
umie zaraportować błąd, ale nie umie go złapać, nie raportuje nic.

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
| `?intercept=cartagena` | Wyprawa w połowie przeprawy, gracz stoi dokładnie na niej — do przechwycenia na morzu. Od v0.73.0 zdarzenie stempluje `passage` równe całej rozpiętości: eskadra, która się uzbraja, **nie jest na czarcie**, a ten harness ma ją pokazać z dziesięcioma dniami zapasu |
| `&soldiers=N` | Wielkość wyprawy (domyślnie 200) — razem z `?intercept=` |
| `?commission=port_royal` | Gubernator z kolonią pod desantem i listem kaperskim w kieszeni gracza |
| `?home=port_royal` | Kapitan żonaty z córką tamtejszego gubernatora, poobijana flota i pełna ładownia |
| `?blockade=havana` | Fregata na stanowisku pod tym portem, kordon dzień przed zaciśnięciem |
| `?patron=tortuga` | Kapitan stoi przy tej ladzie **na cudzy papier** (v0.56.0): niesie komisję korony bijącej się w tej samej wojnie co ta korona, więc nagłówek mówi, skąd wąski spread, a gubernator ma dla niego obronę do wynajęcia. W zwykłej grze 18,8% dni i nigdy pierwszego |
| `?alliance=cartagena` | Dwie korony robiące wspólną sprawę i wspólna wyprawa, którą to wystawia (v0.55.0): kapitan leży pół przeprawy od tej kolonii, angielski desant idzie na nią, a jeden kadłub linii ma banderę francuską. W zwykłej grze sojusz wymaga, żeby dwie korony wypowiedziały wojnę tej samej trzeciej — to 28,8% dni, ale nigdy pierwszy |
| `?famine=tortuga` | Kapitan stoi w mieście, którego dostawca jest pod czarną banderą; miasto od dwóch tygodni głoduje |
| `&stand=cover` | Stoi zamiast tego w porcie, który przejął cudze kursy — razem z `?famine=` |
| `&hated` (v0.68.0) | Razem z `?famine=`: kapitan jest **wrogiem** tej korony (−70). Gubernator, którego ludzie nie jedli, ma wówczas własne powitanie zamiast wołania o straż — i to jest dokładnie ten ekran, na który instrukcja wysyła kapitana z zrujnowanymi notowaniami |
| `?skills=navigation:10,medicine:0` | Kapitan, który wydał punkty gdzie indziej (v0.47.0). Działa z `?skip` i `?battle=`. Trzy z pięciu umiejętności nic nie robiły do tego wydania, a jedyną drogą do konkretnego zestawu było przejście tworzenia postaci ręcznie |
| `?ship=galleon` | Start w tym kadłubie (v0.48.0). Jedyny sposób, żeby poczuć sondowania: startowy slup zanurza 1,5 m i przechodzi wszędzie |
| `?event=<typ>&port=<port>&ashore=1` | Staje **w mieście** zamiast na wodzie przed nim (v0.72.0). Nagłówek czyta się przy tablicy w tawernie i na karcie miasta, a nie z pokładu |
| `?event=...&days=<n>&aged=<n>` | Zdarzenie trwa `days` dni i zaczęło się `aged` dni temu (v0.72.0). Każdy świat debugowy w `PreloadScene` otwiera się **pierwszego poranka** swojego zdarzenia, czyli w jedynym dniu, o którym v0.72.0 nie jest. `?event=campaign&port=port_royal&ashore=1&days=18&aged=17` daje tablicę mówiącą „Eskadra Anglii jest dzień drogi od Port Royale”, przy `vars.days` wciąż stojącym na 18. Dla huraganu `&aged=` dokłada też **drogę** (trzy miasta), bo bez niej oko nie ma się po czym przesuwać |
| `?event=reconquest\|campaign&aged=` | Od v0.73.0 te dwa światy stemplują też `vars.passage` (4 dni), więc tablica ma **pięć** faz, nie trzy: `aged=0` → „Hiszpania zbroi wyprawę w Gibraltarze, by odbić Hawanę — desant za 18 dni”, `aged=14` → „idzie odbić Hawanę — 4 dni drogi”, `aged=17` → „dzień drogi”, `aged=18` → „desant dziś”. Bez stempla świat chodzi ścieżką starego zapisu i faza uzbrajania jest nieosiągalna z URL-a |
| `?owed=200` | Podział łupu spóźniony o tyle dni (v0.71.0). Sześćdziesiąt dni żeglugi dzieli każdy świeży start od tego ekranu, więc bez tego nie da się go zobaczyć na żądanie. Łącz z `?famine=<port>`, który stawia kapitana w porcie: `?famine=havana&owed=200` daje sufit morale na 0,2 i tawernę, która **odmawia kolejki** i mówi dlaczego |
| `?crew=16` | Tylu ludzi na flagowcu (v0.49.0). Każdy kadłub w grze jest obsadzony na 2-3× swojego minimum, więc braku rąk nie da się dosięgnąć ze zwykłego startu. `?skip&ship=galleon&crew=16` to przypadek podręcznikowy |
| `?fleet=merchantman` (v0.77.0) | Ten kadłub (albo kilka po przecinku) **za rufą**, obsadzony i załadowany w jednej trzeciej. Ładownia eskadry jest całą mechaniką wydania, a drugiego kadłuba nie ma się w pierwszej minucie świata debugowego. Od tego wydania `?ship=`, `?crew=`, `?fleet=`, `?skills=` i `?wounded=` działają też na ścieżce `?event=...&ashore=1`, czyli na **jedynym** wejściu, które stawia kapitana w mieście — bez tego nie dało się obejrzeć przez nie ani lady, ani kajuty |
| `?wounded=40` | Tylu ludzi już leży pod pokładem — lazaret widać dopiero przez kilkanaście dni po walce, więc bez tego nie da się go obejrzeć |
| `?famine=<port>` (v0.64.0) | Od tego wydania harness stawia w tym mieście **prawdziwe zdarzenie `famine`** i przelicza ceny portu, więc lada pokaże drogą żywność i wodę przy normalnym tytoniu. Wcześniej opróżniał półki i stemplował `hunger`, ale zdarzenia nie było — czyli jedyna rzecz, którą głód robi z cenami, była niewidoczna w harnessie zbudowanym po to |
| `?hail=cartagena` | Przyjaźny kupiec w zasięgu zawołania, niosący tablicę ogłoszeń tego miasta (v0.62.0). Ze zwykłej gry nie da się tego dosięgnąć na żądanie: nośnik musi być przyjazny, musi jeszcze trzymać wieść, której kapitan nie zna, i musi być w `HAIL_RANGE` w chwili, gdy chodzi kontrola. Jej tablica jest dopełniana z innych miast do trzech pozycji, bo jednopozycyjna nie pokazałaby podziału |
| `?battle=1\|trader\|navy\|pirate\|hunter` | Bitwa morska wprost. **Uwaga na odległość startową:** przeciwnik pojawia się w losowym rogu ekranu, **425 px** od gracza, przy zasięgu dział 320 — czyli poza strzałem i za progiem zegara zrywającego kontakt. Do v0.85.0 była to bitwa, która nie mogła się zacząć |
| `?encounter=<port>` (v0.84.0) | Ten sam kupiec, co `?hail=`, ale **14** jednostek od gracza zamiast 24 — czyli wewnątrz `ENCOUNTER_RANGE` (18), więc `ShipEncounterScene` otwiera się sama. Załadowana, żeby wiersz manifestu (v0.25.0) miał co powiedzieć. **Ta scena była nieprzejechana przez pięć wydań z jednego powodu: nie było do niej wejścia** |
| `?approach=<port>` (v0.84.0) | Statek na redzie miasta, cztery jednostki od nabrzeża, więc `PortApproachScene` otwiera się sama. Sam `getPortWaterPos` nie wystarczy: mapa mierzy zbliżanie do pozycji **przyciągniętej do brzegu** z promieniem 6, a stanowisko do blokady leży czterdzieści jednostek dalej |
| `?duel=7&foe=4` (v0.84.0) | Pojedynek bez niczego przed nim; pierwsza liczba to szermierka kapitana, druga przeciwnika (0-10, `createDuel` przycina). Dojście do niego w grze to znaleźć statek, zbić go i wejść na pokład |
| `?pardon=cartagena` | Kapitan, którego ta korona chce powiesić (–80 u Hiszpanii, sława 60), stoi w mieście, którego gubernator objął rezydencję wczoraj (v0.61.0). Ze zwykłej gry nie da się tam trafić na żądanie: trzeba spalonej kariery **i** jednej z ośmiu rocznych nominacji, która wypadnie na mieście tej samej korony w zasięgu żaglowania |
| `?event=hurricane&port=havana` | Dowolne z 15 zdarzeń świata na dowolnym mieście, statek postawiony tak, że dialog zbliżania otwiera się sam. Od v0.30.0 zdarzenie **i wszystkie zasiane** trafiają do `knownEventIds`, więc widać też znaki na mapie. **Od v0.70.0 `?event=treasure_fleet&port=` stempluje też port zbiórki** (`vars.muster`) — bez niego harness budował flotę skarbową, której żaden czytelnik nie widział, bo wszystko idzie przez `musterPortFor`: kurs, kadłuby i plotka w tawernie |

### Jedno naciśnięcie, jedna akcja

Zmierzone na zbudowanej grze, licznikiem na żywym handlerze:

| naciśnięcie | zdarzeń DOM | wywołań handlera |
|---|---|---|
| `Enter` | 1 | **1** |
| `Shift`+`Enter` | 2 | **3** |
| `Ctrl`+`Enter` | 2 | **3** |

`KeyboardManager.onKeyDown` wkłada zdarzenie do kolejki **i od razu** emituje
`MANAGER_PROCESS`, więc kolejka jest przechodzona raz natychmiast i drugi raz na
kroku klatki; opróżnia ją dopiero `POST_STEP`. `KeyboardPlugin.update` broni się
przed tym **jednym zapamiętanym zdarzeniem** (`prevCode`, `prevTime`,
`prevType`) — co wystarcza na pojedynczy klawisz i **nigdy** nie wystarcza na
parę na przemian, a parę robi wciśnięty modyfikator.

`createInputGate()` pamięta **obiekt zdarzenia**, więc jest dokładny; zakładana
jest raz, w `GameApp`, na wszystkie sceny — owinięty jest `emit`, nie słuchacz.
`scripts/keycount.mjs` mierzy to na żądanie.

**Pułapka:** `game.scene.scenes` jest **puste** zaraz po `new Phaser.Game(config)`
— sceny z konfiguracji czekają w liście oczekujących do startu gry. Cokolwiek
się po nich iteruje, musi poczekać na `game.events.once("ready", ...)`.

**Lekcja o notatkach:** wpis z v0.76.0 opisał objaw poprawnie („trzy wywołania,
jeden słuchacz") i **zgadywał** zasięg („to samo dotyczy każdego ekranu z akcją
na Enter"). Zgadnięty zasięg trafił do TODO jako zadanie i był nieprawdziwy.
Objaw zapisuj razem z **warunkiem**, w którym został zobaczony.

### Strażnik widzi jeden kształt

Przemiatanie z v0.76.0 czyta **trzeci argument `add.text`, w cudzysłowie**. Poza
jego zasięgiem są dwa inne wejścia na ten sam ekran: **szablon** (polskie
przemiatanie pomija szablony z założenia) i **`setText`** (czyli sposób, w jaki
odswieża się każda trzymana etykieta). Za nimi stało `Wind 43%` po angielsku
w polskiej grze, `Flota: 2/3` po polsku w angielskiej i dwa kompasy rysujące `kn`
obok gotowego klucza.

**Tekstowi jest wszystko jedno, którym kształtem przyjechał na ekran.** Każdy
strażnik napisany pod jeden kształt ma ślepą plamę wielkości wszystkich
pozostałych.

### Jedna jednostka, i to tona

`ItemDef.weight` miał **dwóch** czytelników i żaden nie był regułą pojemności:
oba porównywały `weight × ilość` z sumą **ton** już załadowanych. To nie jest
literówka, tylko dwie jednostki w jednym porównaniu — i wychodził z tego dławik
na **jedną transakcję**, a nie limit ładowni. Kapitan naciskał „wszystko" sześć
razy i kończył na 39 z 40.

Lekcja jest ta sama co przy `productionMul` z v0.75.0: **pole, które ma jednego
albo dwóch czytelników, jest hipotezą, nie mechaniką** — i zanim się je naprawi,
trzeba zmierzyć, którą stronę naprawiać. Tutaj pomiar (zysk na jednostkę
ładowni: cukier 3, tytoń 9, rum 12, kakao 13) odrzucił naprawę „w górę" i kazał
skasować pole. Odrzucenie po pomiarze jest wynikiem, tak samo jak przemyt
z v0.50.0.

### Ekran, który liczy drugi raz to samo

`SeaBattleScene` wołał `computePrize` **powtórnie**, żeby narysować swoje
linijki — na świecie, w którym pryz był już rozliczony. Uchodziło mu to na sucho
dokładnie tak długo, jak ładownia była flagowca: rozliczenie zwraca nowy świat
zamiast przypisywać, więc drugie liczenie dostawało te same wejścia. W chwili,
w której ładownia urosła o konsorty, drugie wywołanie nic o nich nie wiedziało
i wypisałoby **jako utopiony ładunek, który jest na pokładzie**.

Reguła: **wynik rozliczenia się trzyma, nie przelicza.** Tak samo jak
`defeatFate` z v0.59.0, i z tego samego powodu — ekran opisuje to, co się stało,
a nie liczy tego jeszcze raz.

## Deploy produkcyjny

Cel: **pirates.k4.pl** (hosting statyczny).

```bash
npm run build
# ⚠ NAJPIERW wyczyść stare bundle na serwerze — Vite hashuje nazwy plików,
#   więc bez czyszczenia katalog puchnie i można trafić na nieaktualny index.html
scp -r dist/* user@server:/path/to/webroot/
```

### Nazwa w `vars` to **klucz**, nie tekst (v0.63.0)

`vars` są stemplowane w zdarzeniu i **zapisywane** (reguła z v0.43.0), więc
tekst wstawiony tam raz zostaje w tym języku na zawsze. Stempluj klucz:

```ts
import { portNameKey, factionNameKey, itemNameKey, shipNameKey } from "../i18n/names.ts";

vars: { port: portNameKey(portKey), faction: factionNameKey(crown) }
```

`t()` rozwija klucz o kształcie `port|faction|item|ship.<id>.name` w chwili
podstawiania `{{var}}`, więc każdy renderer nagłówków dostaje to za darmo,
a zmiana języka przepisuje także stary dziennik.

Tekstu gotowego (`portName`, `factionName`, `itemName`, `shipClassName`) używaj
**tylko** tam, gdzie ekran rysuje teraz i nic nie jest zapisywane.

**Tabele danych nie mają już pól `.name`.** Jedyna kopia nazwy jest w `en.ts` /
`pl.ts`. Jeśli piszesz nową tabelę — nie dokładaj drugiej.

Od v0.69.0 jest do tego **drugi powód**: gotowego słowa nie da się odmienić.
Sprawdza to test czytający źródło (`pl_cases.test.ts`) — wywala się na każdym
`{ port: t("port." + key + ".name") }` w całym `src`.

### Polski przypadek zamawia **zdanie**, nie kod wołający (v0.69.0)

`{{port}}` to mianownik i tak zostaje. Zdanie, które potrzebuje innej formy,
pisze ją po dwukropku:

```ts
// pl.ts
"news.famine": "Klęska głodu {{port:in}}. Ceny żywności szybują w górę.",
"siege.title": "Szturm na {{port:acc}}",
"event.departed": "Wypłynięto {{port:from}}",
```

```
{{x:gen}} {{x:dat}} {{x:acc}} {{x:ins}} {{x:loc}}   gołe przypadki
{{x:in}}  {{x:to}}  {{x:from}}                      całe wyrażenia Z PRZYIMKIEM
```

**Przyimek należy do portu, nie do zdania.** Polski wkłada miasto *w*, a wyspę
*na*: `w Hawanie`, ale `na Martynice`; `do Kartageny`, ale `na Barbados`.
Angielskie zdanie ma jeden przyimek dla wszystkich portów, polskie nie może —
dlatego `in`/`to`/`from` są w tabeli **razem z przyimkiem**, a angielski plik
zostaje nietknięty ze swoim `in {{port}}`.

Formy leżą w `src/core/i18n/plForms.ts`. Trzydzieści z czterdziestu pięciu
miast to nazwy, których polski nie odmienia — tam wpis mówi tylko `island: true`
albo nic. Piętnaście odmiennych jest wypisane w całości.

Dokładasz port? **Dopisz mu wiersz** — jest na to test. Bez wiersza formy
spadają na zgadywany przyimek (`w`/`do`/`z`), co jest poprawne dla miasta na
lądzie i błędne dla każdej wyspy.

Dokładasz polskie zdanie z nazwą? Nie pisz `w {{port}}` — jest na to test, który
czyta całą tabelę i szuka dokładnie tego kształtu.

### Przemiatanie szukało **złego języka** (v0.76.0)

`no_hardcoded_text.test.ts` czyta źródło każdej sceny od v0.60.0 i wywala się na
**polskiej literze** w literale. To była dokładnie ta połowa problemu, którą
v0.60.0 miała przed oczami — a angielskiego napisu na ekranie ten test **nie
może zobaczyć z definicji**.

Znalezionych przy dopisaniu drugiej połowy: **siedemnaście**, w tym **siedem
linii podpowiedzi klawiszy** (tworzenie postaci, sloty zapisu, lista opcji,
podejście do portu, kupiec, stocznia, spotkanie na morzu), trzy z czterech
nagłówków kolumn na ladzie kupca, „Calm” na obu kompasach, „Loading…”, „Debug”,
„ESC” i „zoom: ?”.

**Lekcja z v0.60.0 odwrócona: nieprzetłumaczony ekran to ten, który wygląda
poprawnie dla sprawdzającego.** Tam sprawdzającym był autor czytający po polsku;
tu — test szukający polskich liter.

Przemiatanie wywala się teraz na każdym literale podanym wprost jako trzeci
argument `add.text`, który zawiera trzy litery ASCII pod rząd. Strzałka, kropka
i myślnik przechodzą — to nie jest język.

### Cena jednostkowa a rachunek (v0.76.0)

`buyPrice` / `sellPrice` to **cena na ekranie**. Pieniądze liczą `tradeCost`
i `tradeProceeds` — z ceny **niezaokrąglonej** (`askExact` / `bidExact`)
i z zaokrągleniem **raz**, na sumie. Przed v0.76.0 zaokrąglenie biegło dwa razy
i zjadało rozpiętość: na 90 z 315 notowań neutralny, przyjazny i sojusznik dawali
te same dwie liczby.

Dokładasz nowe miejsce, gdzie kapitan płaci za towar? **Nie mnóż ceny
jednostkowej przez ilość** — to jest właśnie ten błąd.

### Liczebnik też zamawia formę: `{{n}} {{n:rzeczownik}}` (v0.74.0)

Polski liczy w trzech kategoriach — `1 tona`, `2 tony`, `5 ton` — a gra znała
jedną. **85 polskich zdań i 69 angielskich** przyszywało liczbę do rzeczownika
w jednym kształcie.

To nie jest przypadek brzegowy. Zmierzone na kodzie, który te liczby produkuje:

| co liczy | ile razy wychodzi **1** |
|---|---|
| `tendSickBay` (lazaret, `max(1, …)`) | **55,5%** linii „wraca N rannych” |
| to samo, zgony | 49,9% |
| `CrewConsumptionSystem` (głód, `max(1, …)`) | **67,1%** toastów |
| `VillageSystem` płaci 2–5 ton złota | **3 z 4** możliwych zdań były błędne |

Najczęstsza wartość liczby była jedyną, której zdanie nie umiało powiedzieć.

```ts
// pl.ts
"weather.chart_storm": "Huragan — {{days}} {{days:day}}",
// en.ts — ta sama składnia, bo „1 days” jest tak samo złe jak „1 dni”
"news.reconquest": "… — {{soldiers}} {{soldiers:soldier}}, {{days}} {{days:day}} out.",
```

Zmienna to **liczba**, forma to **rzeczownik**. Jedenaście rzeczowników leży
w `src/core/i18n/plurals.ts` i — inaczej niż tabela przypadków — **odpowiada też
po angielsku**.

Tabela odmienia **frazy**, nie słowa (`member` to „członek załogi”), a zdanie,
które chce rzeczownika poza rejestrem policzalnym, dostaje własny wpis
(`soldier_ins`, `soldier_dat`, `day_gen`) zamiast wymiaru przypadków — trzydzieści
wierszy dla trzech zdań to zła wymiana.

**Czego tabela nie zrobi:** zgody **czasownika** i **przymiotnika**. To ta sama
pozycja, którą v0.69.0 zostawiła otwartą dla rodzaju. Szesnaście polskich zdań
jest przeredagowanych tak, żeby problem nie powstał:

- czas teraźniejszy z liczbą **na końcu**: `na ląd schodzi 1 człowiek` /
  `schodzi 26 ludzi` (dopełniacz mnogi bierze czasownik w liczbie pojedynczej,
  i „1 człowiek” też);
- niezmienne `mniej` tam, gdzie chciał się zgodzić imiesłów: `3 działa mniej`,
  `5 dział mniej`;
- `zostało {{days}} dni` → `jeszcze {{days}} {{days:day}}` — bo „został 1 dzień”
  potrzebuje innego czasownika, a „jeszcze” nie potrzebuje żadnego.

**Jedno zdanie zostaje z gołym rzeczownikiem i jest poprawne:** `2 z 3 dział
potrzebnych` — po `z` dopełniacz mnogi jest dobry przy każdej liczbie. Test
przemiatający obie tabele ma dla niego **nazwane odstępstwo z uzasadnieniem**,
i wywala się na każdym innym liczniku postawionym przy gołym rzeczowniku.

Piszesz nowe zdanie z liczbą? Użyj `{{n:rzeczownik}}` — jest na to test, który
czyta obie tabele i sprawdza jeszcze, czy rzeczownik zgadza się ze **swoją**
liczbą, a nie z sąsiadem (przebieg mechaniczny wyprodukował w `en.ts`
`{{soldiers}} {{faction}} {{faction:soldier}}`).

### Cena zdarzenia ma **zakres** (v0.64.0)

Nigdy nie czytaj `effects.priceMul` wprost — to jest dokładnie błąd z v0.64.0.

```ts
import { getAggregatedEffects, priceMulFor } from "./EventEffectsSystem.ts";

const effects = getAggregatedEffects(world, portKey);
spotPrice(portKey, item, stock, population, priceMulFor(effects, item));
```

`priceMul` to część **ogólnorynkowa** (tarify, hossa, wybuch wojny),
`itemPriceMul` to część, która ma **temat** (głód i epidemia: żywność i woda;
żniwa: żywność i cukier). Pilnuje tego `EventPriceScope.test.ts`, który czyta
źródło i wywala się na każdym odczycie `.priceMul` poza `EventEffectsSystem`.

Dokładając zdarzenie: jeśli dotyczy jednego towaru — `itemPriceMul`. Klucze to
id towarów i jest na to test, bo klucz, który nic nie nazywa, czyta się jak
reguła i nigdy się nie wykonuje.
