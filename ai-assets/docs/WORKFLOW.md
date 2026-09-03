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

---

## Pipeline obowiązujący (2026-09-03) — supersedes powyższe

> Fragmenty „usuwanie tła" i „ograniczenie palety" powyżej są **przestarzałe**.
> Globalny chroma-key (`r>240 and g>240 and b>240`) zjada białe żagle w środku
> statku i zostawia szarą obwódkę. Nie używać.

### 1. Generowanie — `ai-assets/workflows/sprite_isolated.json`

```bash
node sd-pipeline/tools/comfy.mjs gen \
  --workflow ai-assets/workflows/sprite_isolated.json \
  --prompt "wooden treasure chest with gold trim, closed lid" \
  --seed 31337 --name chest --out temp/gen
```

Trzy różnice wobec `sd-pipeline/workflows/*` — każda naprawia realny błąd:

| Co | Dlaczego |
|---|---|
| LoRA jawna w grafie (`amigapxl_pirates_v2` @ 0.7) | `pirate_lora.json` miał zaszyty **v1 @ 0.8**; `comfy.mjs` nadpisuje `LoraLoader` tylko gdy podasz `--lora`, więc bez tej flagi LoRA działała po cichu. Tak powstał mylący `temp/comfy-test/lora_ship_12345.png` opisany w JSON-ie jako `"lora": null`. Generacja **bez** LoRA: `--set 9.strength_model=0 --set 9.strength_clip=0`. |
| Ogon promptu = captiony zbioru v2 + `small in frame with wide empty margin` | `transparent background` nic nie daje (SD nie generuje alfy) a psuje kompozycję. Margines w prompcie usuwa najczęstszą wadę: obiekt obcięty krawędzią kadru. |
| **Brak `ImageScale` w grafie** | Skalowanie 512→64 *przed* wycięciem tła miesza kolor tła z krawędzią obiektu — stąd 1972 kolory w `icon_chest_777.png`. Downscale robi dopiero post-processing, już na obrazie z alfą. |

### 2. Post-processing — `ai-assets/scripts/postprocess_asset.py`

```bash
python ai-assets/scripts/postprocess_asset.py temp/gen -o temp/out \
  --size 64 --hard --palette 24 --tol 45
```

Kolejność: wykrycie tła z ramki → **flood fill od krawędzi** (nie globalny key,
więc białe żagle w środku zostają) → łatanie dziur i kasowanie odprysków →
miękka alfa + dekontaminacja koloru krawędzi → trim do bboxa → skalowanie do
`--content` canvasu → kwantyzacja palety (`--palette 24` / `amiga`) → wyśrodkowanie
na canvasie `--size` → PNG-32 + `postprocess_report.json`.

Wymaga tylko Pillow + numpy + scipy (są w systemowym Pythonie i w venv ComfyUI).

### 3. Kryteria akceptacji (liczbowe, w raporcie)

Skrypt odrzuca asset, gdy: tło ramki nie jest jednolite (to scena, nie obiekt) ·
obiekt dotyka krawędzi kadru · `alpha_min != 0` (nic nie wycięto) ·
`alpha_max < 255` · krycie canvasu poza `--min-coverage`/`--max-coverage` ·
po odcięciu tła zostało >92 % kadru · liczba kolorów > `--max-colors`.
`--strict` daje kod wyjścia 1 — nadaje się do bramki w skrypcie wsadowym.
