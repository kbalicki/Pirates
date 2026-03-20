# 13 — Pipeline 3D Assets (Meshy.ai → Spritesheet)

## Przegląd

Generowanie 3D modeli statków i miast w Meshy.ai, nakładanie tekstur AI, konwersja na spritesheety PNG do użycia w Phaser 2D.

## Format: GLB (binary glTF)

- Standard webowy, natywnie wspierany przez Three.js
- Jeden plik = mesh + materiały + tekstury + animacje
- Meshy.ai eksportuje GLB natywnie
- Najmniejszy rozmiar pliku (binary vs JSON gltf)

## Workflow krok po kroku

### Krok 1: Generowanie modelu w Meshy.ai

1. Otwórz https://meshy.ai
2. Użyj "Text to 3D" lub "Image to 3D"
3. Prompt przykłady:
   - Ship: `"pirate sloop sailing ship, low poly, game asset, side view"`
   - City: `"caribbean colonial port town, low poly, top-down view"`
   - Fort: `"stone fortress with cannon towers, low poly, top-down"`
4. Wybierz styl: "Low Poly" lub "Realistic"
5. Eksportuj jako **GLB**
6. Zapisz do `ai-assets/models/ships/` lub `ai-assets/models/cities/`

### Krok 2: Teksturowanie (opcjonalne)

**Opcja A: Meshy.ai built-in**
- Meshy ma "Texture" tab — automatyczne teksturowanie
- Szybkie, dobre dla prototypów

**Opcja B: ComfyUI + AI**
1. Eksportuj UV map z Blender
2. Użyj ComfyUI z ControlNet (depth/normal map)
3. Prompt: `"wooden pirate ship hull, weathered planks, XVII century"`
4. Wynik → nakładka na UV → re-import do GLB

**Opcja C: Blender ręcznie**
- Otwórz GLB w Blender
- Material painting lub texture projection
- Re-eksportuj GLB

### Krok 3: Konwersja GLB → Spritesheet PNG

Skrypt Node.js + headless Three.js:

```
ai-assets/scripts/glb-to-spritesheet.mjs
```

**Algorytm:**
1. Załaduj GLB modelu via THREE.GLTFLoader
2. Ustaw kamerę ortograficzną nad modelem (top-down dla mapy)
3. Dla 8 kierunków (N, NE, E, SE, S, SW, W, NW):
   a. Obróć model o 45° × i
   b. Renderuj do off-screen canvas (96×64px per frame)
   c. Zapisz pixel data
4. Złóż 8 frame'ów w spritesheet (4×2 grid = 384×128px)
5. Zapisz jako PNG z przezroczystym tłem
6. Skopiuj do `public/assets/sprites/ships/`

**Zależności:**
```bash
npm install three @types/three puppeteer
```

Puppeteer = headless Chrome do renderowania WebGL w Node.js

### Krok 4: Integracja z Phaser

1. Nowy spritesheet ma format identyczny z `sailship.png` (384×128, 8 frames)
2. Ładowanie w PreloadScene:
   ```typescript
   this.load.spritesheet("ship_sloop_3d", "assets/sprites/ships/sloop_3d.png", {
     frameWidth: 96, frameHeight: 64,
   });
   ```
3. WorldRenderer → `createEntitySprite()` wybiera teksturę per ship class
4. Przezroczyste tło (RGBA) — bez blue rect issue

### Krok 5: Per ship class

| Klasa | Model Meshy | Spritesheet |
|-------|------------|-------------|
| Pinnace | small boat | pinnace_3d.png |
| Sloop | pirate sloop | sloop_3d.png |
| Barque | merchant barque | barque_3d.png |
| Brigantine | brigantine | brigantine_3d.png |
| Merchantman | large merchant | merchantman_3d.png |
| Frigate | war frigate | frigate_3d.png |
| Fast Galleon | spanish galleon | fast_galleon_3d.png |
| War Galleon | heavy galleon | war_galleon_3d.png |
| Ship of the Line | ship of the line | ship_of_line_3d.png |

### Miasta (analogicznie)

| Typ | Model | Spritesheet |
|-----|-------|-------------|
| Small (outpost) | huts + palm trees | city_small_3d.png |
| Medium (city) | colonial buildings | city_medium_3d.png |
| Large (capital) | walled town | city_large_3d.png |
| Fort | stone fortress | fort_3d.png |

### Faza 2 (przyszłość): Three.js Hybrid

Dla close-up widoków (bitwy morskie, widok portu):
1. Drugi canvas z Three.js nad Phaser
2. Załaduj te same GLB modele
3. Renderuj w 3D z oświetleniem, cieniami
4. Sync kamera Three.js ↔ Phaser

## Struktura plików

```
ai-assets/
  models/
    ships/
      sloop.glb
      brigantine.glb
      ...
    cities/
      city_small.glb
      city_large.glb
      fort.glb
  scripts/
    glb-to-spritesheet.mjs
  output/
    spritesheets/
      sloop_3d.png
      brigantine_3d.png
      ...
```
