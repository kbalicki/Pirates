# 09 — Zasoby gry (Assets)

## Kierunek artystyczny — pixel art (decyzja 2026-09-04)

**Cała gra ma być pixel artem.** To rozstrzyga pytanie, które blokowało plan
assetowy: dotąd każda ocena wygenerowanych sprite'ów porównywała je z tym, co w
grze *jest* — a to, co jest, to malowany placeholder.

- **`sailship.png` i sprite'y miast są tymczasowe.** Malowane (tusz + akwarela),
  wstawione na czas budowy silnika, **do podmiany**. Nie są wzorcem stylu.
- **Każda z dziewięciu klas statków dostaje własny art.** Dziś wszystkie
  renderują się z jednego arkusza — i to jest prawdziwy powód, dla którego
  „dziewięć klas wychodzi identycznych". Brakuje materiału, a nie treningu.
- **Retrening LoRA v3 czeka na ten materiał.** Godzina GPU bez nowych kadłubów
  niczego nie naprawi; ocena v2 niżej mówi to samo, tylko innymi słowami.

### Ile tego jest

Arkusz statku to **1024×512 RGBA, siatka 4×2 po 256×256**, osiem kierunków
(`WorldRenderer.DIR8_TO_FRAME`: rząd 0 = SW, S, SE, E; rząd 1 = NE, N, NW, W).
Czyli **8 klatek na klasę — 72 klatki na komplet**: pinnace, sloop, barque,
brigantine, fluyt, frigate, fast_galleon, galleon, merchantman.

### Dwie pułapki do rozstrzygnięcia przed rysowaniem

1. **Rozdzielczość.** Statek wyświetla się w okolicach **20-30 px**
   (`0.086 × zoomFactor 0.10-0.33 × zoom kamery`), więc klatka 256×256 jest
   skalowana w dół dziesięciokrotnie. Dla malowanego arta to nieszkodliwe, dla
   pixel artu zabójcze. Rysować blisko rozmiaru wyświetlania (32-64 px na
   klatkę) i przeliczyć skalę w `WorldRenderer`.
2. **`roundPixels` jest wyłączone.** `pixelArt: true` wymusza
   `roundPixels: true`, ale `MainMapScene.create()` **musi** wołać
   `camera.setRoundPixels(false)` — inaczej wraca jitter statku. Ostry pixel art
   chce zaokrąglania, jitter go nie chce. Do przemyślenia: zaokrąglać **scroll
   kamery**, a nie pozycje sprite'ów.

---

## Inventory zasobów

### Sprite'y (`public/assets/sprites/`)

| Plik | Rozmiar | Opis |
|------|---------|------|
| sailship.png | **1024×512 RGBA (4×2 grid, 256×256/klatka)** | 8-kierunkowy statek — **placeholder, malowany, do podmiany na pixel art** |
| ship_player.png | wariant | Statek gracza (bitwa) |
| ship_enemy.png | wariant | Statek wroga (bitwa) |
| ships.png | kolekcja | Referencja |
| windrose.png | - | Róża wiatrów (HUD) |
| compass_needle.png | - | Igła kompasu |
| tilepack.png | 384×320 (12×10, 32×32/tile) | 120 kafelków terenu |

### Ikony (`public/assets/sprites/icons/`)

64 ikony 64×64 px w stylu pixel art:

**Skarby:** chest, map, key, coins, ring, necklace, crown, goblet
**Broń:** sword, cutlass, dagger, cannon, pistol, spear, whip, musket
**Jedzenie:** rum, food, water, barrel, apple, grapes, fish, bread
**Nawigacja:** compass, spyglass, telescope, anchor, wheel, sextant
**Inne:** hat, bell, torch, lantern, letter, scroll, parchment, flag
**+** ~30 kolejnych tematycznych

### Kafelki (`public/assets/tiles/`)

| Plik | Rozmiar | Opis |
|------|---------|------|
| water_anim.png | 1024×640 (8×5, 128×128/klatka) | 40 klatek animacji wody |

### Mapa (`public/assets/map/`)

| Plik | Rozmiar | Opis |
|------|---------|------|
| caribbean_bg.png | 3200×2400 | Tło mapy Karaibów |

### Audio (`public/assets/audio/`)

| Plik | Format | Opis |
|------|--------|------|
| pirate_theme.mp3 | MP3 | Muzyka główna |
| wind_loop.ogg | OGG | Ambient wiatru |
| pirate_adventure.wav | WAV | Muzyka przygodowa |

### Fonty (`public/assets/fonts/`)

| Plik | Font | Użycie |
|------|------|--------|
| DancingScript-VF.ttf | Dancing Script (Variable) | Główny font UI |
| DancingScript-Regular.ttf | Dancing Script (Regular) | Backup |
| PIRAG___.TTF | Pirates | Ikony pirackie |
| TreasureMapDeadhand-yLA3.ttf | Treasure Map | Dekoracyjny |

### UI (`public/assets/ui/`)

| Plik | Opis |
|------|------|
| start_bg.jpg | Tło ekranu startowego |
| parchment_panel.png | Tekstura panelu dialogowego |

## Asset Packi (`public/assets/packs/`)

### classic/
Proceduralny pack — blob tiles, placeholder sprite'y.
Generowany z kodu, minimalne wymagania graficzne.

### generated/
AI-generowany pack (ComfyUI + Stable Diffusion):

```
generated/
├── tiles/
│   ├── water_tile.png
│   └── beach_tile.png
├── sprites/
│   ├── cities/
│   │   ├── city_small.png
│   │   ├── city_medium.png
│   │   └── city_large.png
│   ├── ships/
│   │   ├── ship_sloop.png
│   │   ├── ship_brigantine.png
│   │   ├── ship_frigate.png
│   │   ├── ship_galleon.png
│   │   └── ship_merchant.png
│   ├── clouds/
│   │   ├── cloud_1.png – cloud_6.png
│   ├── seagulls/
│   │   ├── seagull_up.png
│   │   └── seagull_down.png
│   └── sailship_generated.png
```

### stylized/
UI-focused pack:
```
stylized/
└── ui/
    └── parchment_panel.png
```

## Dane statyczne (`public/data/`)

| Plik | Rozmiar | Opis |
|------|---------|------|
| caribbean_geo.json | ~140 KB | Poligony lądowe, współrzędne miast |

Format:
```json
{
  "landmasses": [
    { "id": "cuba", "polygon": [[x,y], ...], "bbox": [x1,y1,x2,y2] }
  ],
  "cities": [
    { "name": "Havana", "x": 1234, "y": 567 }
  ]
}
```

## Pipeline generowania assetów

### SD Pipeline (`sd-pipeline/`)

Workflow'y ComfyUI:
- `icon_64x64.json` — ikony 64×64 (DreamShaper 8, 25 steps)
- `tile_32x32.json` — kafelki seamless 32×32
- `ship_sprite.json` — sprite'y statków 512×512 → 96×64
- `map_bg.json` — tła mapowe

Prompty (`sd-pipeline/prompts/`):
- `icons.txt` — 40 promptów na ikony
- `tiles.txt` — 20 promptów na kafelki
- `ships.txt` — 5 promptów na statki
- `backgrounds.txt` — 6 promptów na tła

### Skrypty generujące (`scripts/`)

| Skrypt | Metoda | Opis |
|--------|--------|------|
| generate_assets_comfyui.py | ComfyUI API | 28 assetów (dekoracje, miasta, flagi) |
| generate_assets_v2.py | ComfyUI + PIL | V2 z usuwaniem tła, flagi 5 nacji |
| generate_assets_v3.py | pixel-art-diffusion | V3 z retry logic, tolerance bg removal |
| generate_caribbean_geo.mjs | Natural Earth + OSM | Geografia karaibska (poligony + miasta) |

## Brakujące assety (TODO)

- Warianty statków per frakcja (flagi, kolory)
- Sprite'y budynków portowych
- Animacje abordażu
- Portrety NPC (gubernator, barmanka, kupiec)
- Efekty pogodowe (deszcz, mgła)
- Sprite'y walki lądowej
- Mapy skarbów (grafika)
- Portrety córek gubernatorów
- Sprite'y rodziny kapitana

## Status generowania assetów

> **UWAGA:** Dotychczasowe próby generowania assetów AI nie dały satysfakcjonujących wyników.
> Dane treningowe: `C:\GIT\PiratesChronicles\temp\Pirates Amiga assets` — ręcznie posegregowane
> screenshoty z Amiga i C64 Pirates!. Cały pipeline wymaga poprawienia.
> Więcej w [AI Assets subprojekt](../ai-assets/README.md).

## LoRA `amigapxl_pirates` — stan na v0.12.1

| Wersja | Zbiór | Wynik |
|---|---|---|
| v1 | pełne zrzuty ekranu z Amigi | generowała **całe ekrany gry z HUD-em** zamiast sprite'ów; prompt negatywny nie pomagał |
| v2 | 82 wycięte obiekty na jednolitym tle | pojedynczy wyśrodkowany obiekt w 51/51 przypadków — **główny problem rozwiązany** |
| v3 | 100 obrazów, przebalansowane | zbudowany, **nietrenowany** — `ai-assets/scripts/build_lora_v3_dataset.py` |

**Co v2 robi dobrze:** ikony ekwipunku (skrzynia, sakiewka, kompas, kordelas, moneta, jolly roger, pistolet, rum, luneta, kotwica, beczka, mapa) i budynki portu. Optymalna siła 0.6-0.75; przy 0.9 detal się rozpada.

**Czego v2 nie robi:**
- **Dziewięć klas statków wygląda tak samo** — w projekcie jest dokładnie jeden sprite statku, więc model nie ma skąd wziąć sylwetki pinasy ani galeonu. Retrening tego nie naprawi; potrzebny nowy materiał źródłowy.
- **Klatki uszkodzeń** — każdy prompt „podarte żagle" / „zerwany maszt" wracał nietkniętym statkiem. Porzucone na rzecz proceduralnej nakładki (`ShipDamageOverlay`).
- **Towary** — bezkształtne bryłki; w zbiorze nie ma cukru, tytoniu ani bawełny.
- **Portrety** — brak wspólnego stylu, jako zestaw się nie kleją.

**Co naprawia v3:** ujęcie z góry (udział klatek top-down 10% → 32%, przy podwojonej wadze `repeats`) i balans kategorii. Nie naprawia różnorodności sylwetek — patrz wyżej.

Pełny raport: [`ai-assets/docs/LORA_V2_RETRAIN.md`](../ai-assets/docs/LORA_V2_RETRAIN.md). Wygenerowane PNG-i leżą poza repo (`.gitignore`), odtwarzalne ze skryptów i `manifest.json`.
