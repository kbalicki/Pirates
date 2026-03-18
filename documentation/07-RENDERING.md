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
