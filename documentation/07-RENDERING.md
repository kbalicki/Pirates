# 07 — Rendering

Wszystkie renderery w `src/game/render/`.

## Architektura renderingu

```
MainMapScene.update()
    │
    ├── WorldRenderer.sync()          ← synchronizacja sprite'ów z WorldState
    │   ├── EntityViewFactory         ← tworzenie/recykling sprite'ów
    │   └── DepthSort                 ← sortowanie Z-order
    │
    ├── TileMapBuilder                ← proceduralny tilemap (jednorazowo)
    │
    ├── CameraController.update()     ← smooth follow + zoom
    │
    ├── CloudRenderer.update()        ← warstwy chmur
    │
    ├── WindCompassRenderer.update()  ← róża wiatrów
    │
    ├── SeagullRenderer.update()      ← animowane mewy
    │
    ├── MinimapRenderer.update()      ← minimapa
    │
    └── FxManager                     ← efekty wizualne (eksplozje, trafienia)
```

## WorldRenderer

**Główna funkcja:** `sync(scene, worldState)`

- Iteruje po `worldState.entities`
- Tworzy brakujące sprite'y (via EntityViewFactory)
- Aktualizuje pozycje, rotacje, klatki animacji
- Usuwa sprite'y dla nieistniejących entities
- Sprite statku: 8-kierunkowy spritesheet (headingToDir8)

## TileMapBuilder

**Funkcja:** `buildTileMap(scene, landmasses, assetPack)`

### Parametry mapy

| Parametr | Wartość |
|----------|---------|
| Mapa | 3200 × 2400 px |
| Rozmiar kafelka | 32 × 32 px |
| Siatka | 100 × 75 kafelków |
| Klasyfikacja | 9-punktowy sampling |

### Algorytm klasyfikacji terenu

Dla każdego kafelka — 9 punktów (3×3 siatka):
1. Test `pointInLandmass()` dla każdego punktu
2. Zliczenie: ile punktów na lądzie?

| Wynik | Klasyfikacja |
|-------|-------------|
| 9/9 | ląd |
| 5-8/9 | brzeg (blob encoding) |
| 1-4/9 | płycizna/piasek |
| 0/9 | morze |

### Blob Tilepack Encoding

Kafelki brzegowe używają 8-bitowej maski kierunkowej:
```
NW  N  NE
 W  ·  E
SW  S  SE
```
Każdy bit = sąsiad na lądzie. 256 kombinacji → mapowanie na tileset.

### Dekoracje

- Palmy: losowo na kafelkach lądowych (proceduralne)
- Budynki miast: wg pozycji portów
- Rafy: wg danych geograficznych

## CameraController

**Funkcja:** `update(playerPos, delta)`

### Parametry

| Parametr | Wartość |
|----------|---------|
| Smooth follow lerp | 0.08 |
| Zoom lerp | 0.10 |
| Min zoom | 0.75 (far) |
| Max zoom | 3.375 (close) |
| Zoom krok | ×1.5 per scroll |

### Tryby zoom

- **Far (0.75):** widok strategiczny, duża część mapy
- **Normal (1.5):** standardowy gameplay
- **Close (3.375):** detale, pixel art w pełnej krasie

### Bounds clamping

Kamera nie wychodzi poza granice mapy (0,0 do 3200,2400).

## CloudRenderer

**Funkcja:** `update(windDirection, windStrength, camera)`

- 23–38 warstw chmur (losowe przy inicjalizacji)
- Prędkość proporcjonalna do wiatru
- Różne głębokości (parallax)
- Culling: +100px margines poza viewport
- Alpha: 0.3–0.6 (półprzezroczyste)

## WindCompassRenderer

**Funkcja:** `update(windDirection, windStrength)`

- Pozycja: prawy górny róg HUD
- Elementy:
  - Róża wiatrów (statyczna tekstura `windrose.png`)
  - Igła kompasu (obrót = kierunek wiatru, `compass_needle.png`)
- Wskazuje aktualny kierunek wiatru
- Siła wiatru wpływa na rozmiar/intensywność igły

## SeagullRenderer

**Funkcja:** `update(camera, wind)`

- Sprite'y mew latających nad mapą
- 2 klatki animacji: skrzydła w górę / w dół
- Ruch: dryfowanie z wiatrem + losowe zmiany kierunku
- Respawn: gdy mewa wyleci poza viewport

## MinimapRenderer

**Funkcja:** `update(worldState, camera)`

- Lewy dolny róg HUD
- Rysuje kontury lądów (z caribbean_geo.json)
- Pozycja gracza: punkt/strzałka
- Pozycje portów: kolorowe kropki (kolor frakcji)
- Viewport kamery: prostokąt

## FxManager

- Efekty wizualne tworzone na żądanie
- Typy: eksplozje, trafienia armatnie, rozbryzgi wody
- Każdy FX: sprite z animacją → auto-destroy po zakończeniu
- Depth sorting: nad statkami, pod HUD

## DepthSort

```typescript
depthSort(entity: EntityState): number
```

- Sortowanie Y-axis (obiekty niżej na ekranie = bliżej kamery)
- Statki: Y + offset
- Efekty: nad statkami
- HUD: stały depth (najwyżej)

## Asset Packi

### classic
- Proceduralny tileset (blob tiles)
- Sprite'y placeholder (kolorowe kształty)

### generated
- AI-generowane sprite'y (ComfyUI)
- Tiles: water_tile.png, beach_tile.png
- Sprite'y miast: city_small/medium/large.png
- Statki: ship_sloop/brigantine/frigate/galleon/merchant.png
- Chmury: cloud_1 – cloud_6
- Mewy: seagull_up/down.png

### stylized
- UI assets (parchment_panel.png)
- Planowana rozbudowa

## Animacja wody

- `water_anim.png`: 8×5 siatka, 128×128 per klatka, 40 klatek
- Overlay na kafelkach morskich
- Płynna animacja falowania

## Bandery, proporce i proporczyki przy kadłubie NPC

Trzy osobne obrazki nad i pod każdym kadłubem NPC, wszystkie generowane
proceduralnie w `TextureFactory` i wszystkie o **stałym rozmiarze ekranowym**
(`FLAG_SCREEN_SCALE / zoom`) — proporcjonalna flaga przy małym zoomie to dwa
piksele błota, a cały sens tych trzech rzeczy to czytelność z rzutu oka.

| Obiekt | Tekstura | Gdzie | Co mówi | Od |
|---|---|---|---|---|
| bandera | `flag_<faction>` (16×12) | przy kadłubie, `+7/-5` | czyj to statek | v0.19.0 |
| proporzec wojenny | `pennant_war` (10×3, czerwony) | `PENNANT_GAP = 13` **nad** banderą | będzie się bił (`navy`, `pirate`, `pirate_hunter`) | v0.20.0 |
| proporczyk ładunku | `pennant_cargo` (6×2) / `pennant_cargo_rich` (12×3) | `CARGO_GAP = 5` **pod** banderą | jak głęboko siedzi (`ladenTier` 1 / 2) | v0.25.0 |

Wszystkie trzy idą za alfą kadłuba, więc statek gasnący na krawędzi
widoczności zabiera je ze sobą i mgła nie jest zdradzana przez flagę wiszącą
w pustej wodzie. Proporczyk ładunku ma dodatkowy warunek: **znika poza
`CARGO_READ_SHARE = 0.55` zasięgu lunety**, bo z daleka nie widać, jak statek
siedzi w wodzie.

**Dlaczego to są osobne sprite'y, a nie tint kadłuba.** Arkusz `sailship` nie ma
alfy — tint rysował niebieskie prostokąty wokół każdego kadłuba. To był powód
usunięcia tintu frakcyjnego w v0.19.0 i nie zmieni się, dopóki arkusz statków
nie zostanie przerysowany (sekcja 6 w TODO.md).

## MapEventMarkerRenderer — znaki zdarzeń na mapie świata (v0.30.0)

Rysuje jeden znak na miasto dla zdarzeń, o których gracz **słyszał**; listę
wyprowadza `MapEventSystem.knownPortEvents` (zob.
[04-CORE-SYSTEMS.md](04-CORE-SYSTEMS.md)).

| Element | Depth | Rozmiar |
|---|---|---|
| pierścień zamkniętego portu + szpilka | 550 | `radius + 5 px ekranowych`, szpilka `r = 4.5 px` |
| etykieta nazwy zdarzenia | 601 | `txt(12, bold)`, `setScale(1 / zoom)` |

Depth 550 leży **nad** grafiką portów (500) i **pod** ich etykietami (600);
etykieta znaku na 601 jest jedyną rzeczą nad nazwą miasta, i tak ma być, bo
jest tym, po co się patrzy.

**Kolor odpowiada na jedno pytanie** — płynąć tam czy stamtąd. Nie zieleń i
czerwień: mapa niesie już cztery kolory frakcji, z czego dwa są czerwone.

| Wydźwięk | Kolor | Zdarzenia |
|---|---|---|
| `bad` | `0xb03a2e` (rdza) | zaraza, głód, huragan, bunt, napad piratów, najazd |
| `good` | `0xd4a017` (złoto) | odkrycie złota, koniunktura, zbiory, flota skarbów |
| `neutral` | `0x6b7a8f` (łupek) | nowy gubernator, dekret królewski |

### Pułapka: co jest w pikselach ekranowych, a co nie

Wszystkie adnotacje na tej mapie mają **stały rozmiar ekranowy** (dzielone przez
zoom, tak jak `ExpeditionCourseRenderer` i etykiety miast). Ale ikony miast są
jedyną rzeczą rysowaną w **stałym rozmiarze świata** — `CityIconRenderer` skaluje
je do 22 / 15 / 10 jednostek świata według wielkości miasta — więc rosną
ośmiokrotnie na całym zakresie zoomu 1.5×–12×.

Pierwsza wersja stawiała szpilkę 15 pikseli ekranowych nad środkiem miasta i
pierścień o promieniu 17 px: nad wioską przy z2 wyglądało to poprawnie, a przy
Hawanie na z6 szpilka siedziała **wewnątrz** sprite'u, a pierścienia w ogóle nie
było widać. **Cokolwiek ma ominąć sprite miasta, musi być mierzone od sprite'u**:
`townRadius(portKey)` daje połowę jego szerokości w jednostkach świata, a dopiero
odstęp nad nim jest ekranowy.

### Widoczność

Znaki gasną razem z ikonami miast: `alpha = 0` poniżej zoomu 2, liniowo do 1 przy
zoomie 3. Przy przeglądowym zoomie mieści się na ekranie czterdzieści pięć miast
i znaki byłyby dywanem słów na Karaibach, nie mapą.

Klawisz **N** chowa i pokazuje całą warstwę (`pc_marks` w `localStorage`), tak
jak **T** chowa szlaki handlowe.
