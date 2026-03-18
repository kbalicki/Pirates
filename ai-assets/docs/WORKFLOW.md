# Workflow generowania assetów

## Przegląd pipeline'u

```
1. Przygotowanie referencji
   → Zebranie screenshotów z oryginału (Amiga/C64)
   → Posegregowanie wg typu (statek, mapa, port, UI)

2. Trening LoRA (opcjonalnie)
   → Kohya_ss z danymi z "Pirates Amiga assets"
   → Fine-tuning na stylu pixel art Amiga

3. Generacja w ComfyUI
   → Workflow per typ assetu
   → Model bazowy + LoRA + prompt engineering

4. Post-processing
   → Downscale nearest-neighbor
   → Usunięcie tła
   → Ograniczenie palety (32 kolory Amiga)

5. Integracja z grą
   → Kopia do public/assets/packs/
   → Test w przeglądarce
```

## ComfyUI — uruchomienie

```bash
# Start
cd C:\AI
start_comfyui.bat
# → http://127.0.0.1:8188

# Stop
stop_comfyui.bat
```

## Workflow'y

### Ikony 64×64 (`workflows/icon_64x64.json`)
- Model: DreamShaper 8
- Steps: 25, CFG: 7.0
- Generacja: 512×512 → downscale nearest-neighbor do 64×64
- Prompt: `"pixel art icon, [item], 16-color palette, black background, game sprite, top-down view"`

### Kafelki 32×32 (`workflows/tile_32x32.json`)
- Seamless tiling (Tiled Diffusion)
- Generacja: 256×256 → 32×32
- Prompt: `"seamless pixel art tile, [terrain], top-down view, amiga style, 16-color"`

### Sprite'y statków (`workflows/ship_sprite.json`)
- Model: pixel-art-diffusion-v1 + LoRA Pirates
- Steps: 30, CFG: 7.5
- Generacja: 512×512 → 96×64
- 8 kierunków (osobne generacje lub spritesheet)

### Tła (`workflows/map_bg.json`)
- Steps: 30, CFG: 7.0
- Generacja: duża rozdzielczość
- Post-processing: downscale + paleta

## Prompte — tips

### Pozytywne keywords
```
pixel art, 16-bit, amiga style, retro game sprite,
top-down view, game asset, clean edges, flat shading,
limited palette, 32-color, crisp pixels, no anti-aliasing
```

### Negatywne keywords
```
blurry, smooth, 3d, photorealistic, gradient,
anti-aliased, modern, high resolution, detailed shading,
watermark, text, signature
```

### Tips
- Generuj w 256×256 lub 512×512, potem downscale nearest-neighbor
- Używaj niskiego CFG (5-7) dla bardziej spójnych wyników
- LoRA weight: 0.6-0.8 (nie za dużo, żeby nie przetrainować)
- Batch: generuj 4-8 wariantów, wybieraj najlepsze
- Seed lock: po znalezieniu dobrego seeda, wariantuj prompt

## Post-processing

### Downscale (nearest-neighbor)
```python
from PIL import Image
img = Image.open("input_512.png")
img = img.resize((64, 64), Image.NEAREST)
img.save("output_64.png")
```

### Usuwanie tła
```python
# Prosty — biały/czarny tło na transparent
from PIL import Image
img = Image.open("sprite.png").convert("RGBA")
data = img.getdata()
new_data = [(r,g,b,0) if r>240 and g>240 and b>240 else (r,g,b,a)
            for r,g,b,a in data]
img.putdata(new_data)
img.save("sprite_transparent.png")
```

### Ograniczenie palety
```python
# Redukcja do 32 kolorów
img = Image.open("sprite.png").convert("P", palette=Image.ADAPTIVE, colors=32)
img.save("sprite_indexed.png")
```

## Modele rekomendowane

| Model | Typ | Użycie |
|-------|-----|--------|
| pixel-art-diffusion-v1 | Checkpoint | Najlepszy dla pixel art |
| DreamShaper 8 | Checkpoint | Ogólny, dobra jakość |
| PixelArtRedmond15V | LoRA | Pixel art styl |
| amigapxl_pirates_v1 | LoRA (custom) | Styl Pirates Amiga |
| SD_PixelArt_SpriteSheet_Generator | Checkpoint | Sprite sheets |
| Pixel Art XL | SDXL | Najlepszy dla true pixel art |
| Retro Diffusion | Narzędzie | Konwersja do pixel art |

## Znane problemy

- Generowany pixel art często ma zbyt wiele detali (nie wygląda retro)
- Anti-aliasing na krawędziach — wymaga post-processingu
- Spójność stylu między różnymi assetami — trudna do utrzymania
- Dotychczasowy LoRA (amigapxl_pirates_v1) — niesatysfakcjonujące wyniki
