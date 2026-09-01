# AI Asset Generation — Pirates Chronicles

Subprojekt generowania assetów graficznych do gry Pirates Chronicles przy użyciu AI (Stable Diffusion, ComfyUI, LoRA).

## Cel

Stworzenie kompletnego zestawu sprite'ów, kafelków, ikon i efektów w stylu **Amiga/C64 pixel art** — wiernych estetyce oryginalnego Sid Meier's Pirates! (1987).

## Status

> ⚠️ **Przyczyna słabych wyników ustalona (2026-09-01).** LoRA `amigapxl_pirates_v1` była trenowana na **pełnych zrzutach ekranu** z Amigi i C64, a nie na wyciętych pojedynczych obiektach. Nauczyła się więc kompozycji całego ekranu gry: przy prompcie o pojedynczy statek zwraca mapę z wyspami, kilkoma statkami i paskiem HUD. Zachowanie potwierdzone przy sile LoRA 0.8 i 0.45; prompt negatywny tego nie usuwa, bo bias jest kompozycyjny, nie leksykalny.
>
> **Ścieżka, która działa dzisiaj:** checkpoint `pixel-art-diffusion-v1` **bez** LoRA amigapxl daje czysto izolowane obiekty na jednolitym tle. Przetestowana ikona 64×64 wyszła gotowa do użycia bez poprawek.
>
> **Prawdziwa naprawa:** retrening LoRA na wyciętych pojedynczych sprite'ach z przezroczystym tłem — zadanie w [TODO.md](../TODO.md).

> ✅ **Zrobione (2026-09-02): `amigapxl_pirates_v2`.** Nowy zbiór (82 wycięte obiekty na płaskim tle), 820 kroków, 1 h na GTX 1060. **51/51 wygenerowanych assetów to pojedynczy obiekt na płaskim tle — zero ekranów gry i HUD-u.** Zalecana siła 0,7. Pełny opis, porównanie v1/v2/bez-LoRA i rekomendacje: [docs/LORA_V2_RETRAIN.md](docs/LORA_V2_RETRAIN.md). Wyniki: `ai-assets/output/lora_v2/`.

### Dane treningowe
- Lokalizacja: `C:\GIT\PiratesChronicles\temp\Pirates Amiga assets`
- Źródło: Ręcznie posegregowane screenshoty z Amiga i C64 Pirates!
- Pobrane z Google Images

### Wytrenowane modele
- `amigapxl_pirates_v1_ep8.safetensors` (19MB) — LoRA epoch 8
- `amigapxl_pirates_v1_ep10.safetensors` (19MB) — LoRA epoch 10
- Lokalizacja: `C:\AI\ComfyUI\models\loras\`

## Narzędzia lokalne (C:\AI)

| Narzędzie | Ścieżka | Port | Opis |
|-----------|---------|------|------|
| **ComfyUI** | `C:\AI\ComfyUI\` | 8188 | Node-based workflow Stable Diffusion |
| **Kohya_ss** | `C:\AI\kohya_ss\` | — | GUI do treningu LoRA/Dreambooth |

### Modele SD dostępne
- `dreamshaper_8.safetensors` (2.0GB) — Ogólny model generowania
- `pixel-art-diffusion-v1.safetensors` (2.0GB) — Specjalizowany pixel art
- `sd_xl_base_1.0.safetensors` (6.5GB) — SDXL base
- `PixelArtRedmond15V-PixelArt-PIXARFK.safetensors` (LoRA, 26MB) — Pixel art LoRA

### Uruchomienie

Najprościej przez skill **`comfyui`** (poziom użytkownika) — zawiera start bez blokowania sesji, dobór modeli i diagnostykę.
Generowanie z linii poleceń: `node sd-pipeline/tools/comfy.mjs` — patrz [sd-pipeline/README.md](../sd-pipeline/README.md).

```bash
# ComfyUI
cd C:\AI
start_comfyui.bat                    # http://127.0.0.1:8188

# Kohya (trening LoRA)
cd C:\AI\kohya_ss
gui.bat
```

## Struktura subprojektu

```
ai-assets/
├── README.md              # Ten plik
├── docs/
│   ├── WORKFLOW.md        # Instrukcje workflow ComfyUI
│   ├── TRAINING.md        # Instrukcje treningu LoRA
│   └── ASSET-SPEC.md      # Specyfikacja docelowych assetów
├── workflows/             # Pliki workflow ComfyUI (.json)
├── prompts/               # Banki promptów per typ assetu
├── scripts/               # Skrypty automatyzacji
├── output/                # Wygenerowane assety (raw)
│   └── .gitkeep
└── final/                 # Zatwierdzone assety (gotowe do gry)
    └── .gitkeep
```

## Docelowe assety

### Kafelki terenu (32×32 px)
- [ ] Morze (deep, medium, shallow) + animacja
- [ ] Ląd (trawa, piasek, ziemia, skała)
- [ ] Brzeg (blob encoding — 256 wariantów)
- [ ] Rafy koralowe
- [ ] Plaża
- [ ] Dżungla / las

### Sprite'y statków (96×64 px per klatka, 8 kierunków)
- [ ] Sloop (5 wariantów frakcyjnych)
- [ ] Brigantine (5 wariantów)
- [ ] Merchantman (5 wariantów)
- [ ] Frigate (5 wariantów)
- [ ] Galleon (5 wariantów)
- [ ] Warianty uszkodzeń (podarte żagle, dym, ogień)
- [ ] Animacja tonięcia

### Sprite'y miast (top-down, różne rozmiary)
- [ ] Wioska (small)
- [ ] Miasteczko (medium)
- [ ] Miasto (large)
- [ ] Stolica (capital)
- [ ] Fort / twierdza
- [ ] Warianty architektoniczne per frakcja

### Portrety NPC (64×64 lub 128×128)
- [ ] Gubernator (5 frakcji × warianty)
- [ ] Barmanka / barman
- [ ] Kupiec
- [ ] Stoczniowiec
- [ ] Pirat (różne typy)
- [ ] Córki gubernatorów (warianty)
- [ ] Członkowie rodziny (brat, siostra, ciotka, wujek)

### Ikony (64×64 px)
- [x] 64 ikon (skarby, broń, jedzenie, nawigacja) — do poprawienia jakości

### Efekty
- [ ] Eksplozja armatnia (spritesheet)
- [ ] Dym / ogień
- [ ] Rozbryzg wody
- [ ] Deszcz, mgła
- [ ] Pioruny

### UI
- [ ] Ramki dialogowe (parchment style)
- [ ] Przyciski
- [ ] Paski HP/morale
- [ ] Ramki portretów
- [ ] Mapa skarbu (szablon)

## Pipeline generowania

```
1. Prompt engineering
   → Banki promptów per typ assetu

2. ComfyUI workflow
   → Model bazowy + LoRA Pirates
   → Generacja w wyższej rozdzielczości (512×512)

3. Post-processing
   → Downscale nearest-neighbor do docelowej rozdzielczości
   → Usunięcie tła (transparency)
   → Korekta palety (Amiga 32-color)
   → Konwersja do spritesheet

4. Quality check
   → Wizualna weryfikacja
   → Test w grze

5. Integracja
   → Kopia do public/assets/packs/
```

## Paleta kolorów (Amiga OCS)

Oryginalna paleta Amiga (32 kolory) — docelowa dla spójności wizualnej:
- Morze: odcienie niebieskiego (#000044 → #4488CC)
- Ląd: zielenie (#004400 → #88CC44) + brązy (#442200 → #CC8844)
- Piasek: beże (#CCAA66 → #EECC88)
- Postaci: ciepłe odcienie skóry + kolorowe mundury per frakcja

## Do zrobienia (priorytetowo)

1. **Poprawić model LoRA** — więcej danych treningowych, lepsze parametry
2. **Przetestować nowe modele SD** (community recommendations)
3. **Ustalić workflow per typ assetu** (tile, sprite, icon, portrait)
4. **Stworzyć reference sheet** — paleta + przykłady z oryginału
5. **Batch generation** — automatyczny pipeline dla wszystkich assetów
