# Trening LoRA — Pirates Style

## Dane treningowe

**Lokalizacja:** `C:\GIT\PiratesChronicles\temp\Pirates Amiga assets`

### Zawartość
- ~350+ obrazów z gry Sid Meier's Pirates! (Amiga i C64)
- Formaty: PNG, JPG, GIF
- Typy: screenshoty rozgrywki, mapy, sprite'y, porty, walki
- Ręcznie posegregowane z Google Images
- Katalogi: `rejected/` (odrzucone), `plansza gry/`, `kohya_dataset/`, `training_ready/`

### Preprocessing (istniejący)
Skrypt `C:\AI\preprocess_training_data.py`:
- Filtruje GIF-y i screenshoty z bitew
- Przycina paski UI (górny/dolny)
- Normalizuje do 512×512
- Usuwa duplikaty (perceptual hashing)

## Konfiguracja treningu

**Narzędzie:** Kohya_ss (`C:\AI\kohya_ss\`)
**Konfiguracja:** `C:\GIT\PiratesChronicles\temp\Pirates Amiga assets\kohya_config.json`
**Skrypt:** `train_lora.bat`

### Parametry dotychczasowe

| Parametr | Wartość | Uwaga |
|----------|---------|-------|
| Model bazowy | SD 1.5 | pixel-art-diffusion-v1 |
| Typ | LoRA | SDXL LoRA jako alternatywa |
| Epoki | 10 | ep8 i ep10 dostępne |
| Learning rate | 1e-4 | standard |
| Batch size | 1 | GTX 1060 (6GB) limitation |
| Resolution | 512 | standard SD 1.5 |
| Optimizer | AdamW 8-bit | bitsandbytes |
| xformers | tak | memory efficient attention |

### Wytrenowane modele
- `amigapxl_pirates_v1_ep8.safetensors` (19MB) → `C:\AI\ComfyUI\models\loras\`
- `amigapxl_pirates_v1_ep10.safetensors` (19MB)

## Problemy do rozwiązania

### 1. Jakość danych treningowych
- Mieszanka rozdzielczości (niska + wysoka)
- GIF-y w dataset (powinny być usunięte)
- Brak spójnego stylu (Amiga + C64 + reedycje)
- Mapy i UI zaśmiecają model

**Rozwiązanie:**
- Posegregować na osobne datasety per typ (sprite, mapa, UI)
- Usunąć wszyskie GIF-y
- Przyciąć do samych sprite'ów (bez UI)
- Dodać ręczne captiony opisujące content

### 2. Sprzęt
- GTX 1060 6GB — ogranicza batch size do 1
- Trening trwa długo
- Brak możliwości trenowania SDXL LoRA

**Rozwiązanie:**
- xformers + 8-bit optimizer (już włączone)
- Ewentualnie: cloud GPU (Colab, RunPod)

### 3. Styl wynikowy
- Model generuje "coś pirackie" ale nie pixel art
- Zbyt dużo detali, za mało retro feel

**Rozwiązanie:**
- Lepszy model bazowy (pixel-art-diffusion-v1 zamiast ogólnego SD)
- Stronger LoRA weight (0.8-1.0)
- Post-processing: reduce palette, downscale nearest-neighbor
- Regularization images (porównawcze, żeby model nie zapomniał bazowego stylu)

## Plan poprawy treningu

1. **Przeczyszczenie datasetu**
   - Usunięcie GIF-ów
   - Segregacja: sprite'y / mapy / UI / screenshoty
   - Przycięcie do samych sprite'ów gdzie możliwe
   - Normalizacja rozdzielczości (512×512 center crop)

2. **Lepsze captiony**
   - Ręczne captiony dla kluczowych obrazów
   - Template: `"pixel art, amiga style, [content description], 16-bit, top-down view"`
   - BLIP/WD captioning jako baza + ręczna korekta

3. **Nowy trening**
   - Model bazowy: pixel-art-diffusion-v1
   - Więcej epok (20-30) z early stopping
   - Learning rate: 5e-5 (niższy, stabilniejszy)
   - Reg images: ogólne pixel art (żeby model nie zapomniał stylu)
   - Zapisywanie co 5 epok do porównania

4. **Testowanie**
   - Grid testowy: różne LoRA weights (0.4, 0.6, 0.8, 1.0)
   - Porównanie epok (10, 15, 20, 25, 30)
   - Benchmark prompty (statek, mapa, port, postać)

## Alternatywne podejścia

### Retro Diffusion (retrodiffusion.ai)
- Specjalizowane narzędzie do generowania pixel art
- Nie wymaga treningu LoRA
- Ograniczona kontrola nad stylem

### img2img
- Zamiast trenowania LoRA: użyj oryginalnych sprite'ów jako input
- img2img z pixel-art-diffusion-v1
- Denoising 0.3-0.5 (zachowanie struktury, zmiana detali)

### ControlNet
- Canny edge detection na oryginalnych sprite'ach
- Generacja z zachowaniem kształtów ale w nowym stylu
