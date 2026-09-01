# Playbook — generowanie assetów do gry

Ogólna obsługa ComfyUI (start serwera, CLI, dobór modelu, rozwiązywanie problemów) jest w skillu **`comfyui`** — wywołaj go, zanim zaczniesz generować. Ten playbook opisuje to, co dotyczy **wyłącznie Pirates Chronicles**.

## Stan pipeline'u — przeczytaj, zanim zaczniesz

Zbadane i potwierdzone testami 2026-09-01 na GTX 1060 6GB:

### LoRA `amigapxl_pirates_v1` generuje całe ekrany gry, nie sprite'y

Własna LoRA projektu (`amigapxl_pirates_v1_ep8/ep10.safetensors`) była trenowana na **zrzutach ekranu z Amigi i C64** (`temp/Pirates Amiga assets`), a nie na wyciętych pojedynczych obiektach. W efekcie nauczyła się kompozycji całego ekranu: przy prompcie „pojedynczy statek" zwraca mapę z wyspami, kilkoma statkami i paskiem HUD na dole.

Sprawdzone: przy sile 0.8 i 0.45 zachowanie jest takie samo. Prompt negatywny („no user interface, no map") **tego nie usuwa** — bias kompozycyjny jest wyuczony, nie leksykalny.

**Co z tego wynika:**
- LoRA nadaje się do referencji palety i „klimatu Amigi", nie do produkcji izolowanych sprite'ów.
- Da się z niej wyciąć pojedyncze statki — te na wygenerowanych ekranach wyglądają przyzwoicie.
- Prawdziwa naprawa to **retrening na wyciętych pojedynczych obiektach z przezroczystym tłem**. To zadanie leży w `TODO.md`.

### Ścieżka, która działa dzisiaj

Checkpoint `pixel-art-diffusion-v1.safetensors` **bez** LoRA amigapxl daje czysto izolowane obiekty na jednolitym tle. Przetestowana ikona 64×64 („wooden treasure chest with gold coins", seed 777) wyszła nadająca się do gry bez poprawek.

```bash
node sd-pipeline/tools/comfy.mjs gen \
  --workflow icon_64x64 \
  --prompt "wooden treasure chest with gold coins" \
  --out temp/gen --name icon_chest --seed 777 \
  --set 1.ckpt_name=pixel-art-diffusion-v1.safetensors \
  --set 5.steps=28
```

### Szablony mają wbudowane kadrowanie

Każdy workflow w `sd-pipeline/workflows/` ma zaszyty prompt pozytywny wokół `{prompt}`. `ship_sprite.json` narzuca `side view` — prompt „top-down view" zostanie przez to nadpisany i dostaniesz widok z boku. **Przeczytaj szablon, zanim się zdziwisz.** Kadrowanie zmienia się przez `--set <id>.text=...` albo przez nowy szablon.

## Workflow'y

| Szablon | Wyjście | LoRA | Do czego |
|---|---|---|---|
| `icon_64x64` | 64×64 | – | ikony ekwipunku i UI — **najlepiej sprawdzona ścieżka** |
| `tile_32x32` | 32×32 | – | kafelki mapy (bezszwowe) |
| `ship_sprite` | 512×512 | – | sprite'y statków (widok z boku, zaszyty w szablonie) |
| `map_bg` | 512×512 | – | tła i tekstury morza |
| `cloud_sprite` | 512×512 | – | chmury na jednolitym błękicie |
| `pirate_lora` | 512×512 | ✅ amigapxl | styl Amigi — patrz zastrzeżenie wyżej |

## Od wygenerowanego pliku do assetu w grze

1. **Obejrzyj wynik** narzędziem Read. Plik, którego nie otworzyłeś, nie jest zweryfikowany.
2. **Odrzuć i powtórz** z innym seedem, jeśli wynik jest słaby. Generacja 512×512 to ~20–30 s — taniej wygenerować pięć wariantów niż ratować jeden w edytorze.
3. **Docelowe rozmiary:** ikony 64×64, kafelki 32×32, sprite'y miast 384×256, arkusze statków 256×256 na klatkę.
4. **Skompresuj przed commitem** — `sharp` jest w devDependencies:
   ```bash
   node -e "require('sharp')('in.png').png({quality:80,effort:10}).toFile('out.png')"
   ```
   Typowa redukcja 50–85%. **Nigdy nie kompresuj plików w `public/assets/sprites/originals/`** — to kopie zapasowe.
5. **Umieść** w `public/assets/sprites/` (albo odpowiednim podkatalogu), oryginał wrzuć do `originals/`.
6. **Zarejestruj** w `src/game/scenes/PreloadScene.ts`.
7. **Zaktualizuj** `documentation/09-ASSETS.md`.

## Katalogi

| Ścieżka | Zawartość | Git |
|---|---|---|
| `sd-pipeline/workflows/` | szablony workflow (API format) | ✅ |
| `sd-pipeline/prompts/` | banki promptów per kategoria | ✅ |
| `sd-pipeline/tools/` | `comfy.mjs` i skrypty pomocnicze | ✅ |
| `sd-pipeline/assets_raw/` | surowe wyjścia | PNG ignorowane, metadane JSON śledzone |
| `sd-pipeline/assets_game/` | wyselekcjonowane, gotowe do gry | ✅ |
| `temp/` | eksperymenty, zrzuty ekranu | ignorowany |
| `public/assets/sprites/originals/` | nieskompresowane oryginały | ✅ |

Do eksperymentów generuj do `temp/`. Do `sd-pipeline/assets_game/` przenoś dopiero to, co przeszło ocenę.

## Metadane

`comfy.mjs` zapisuje obok każdego PNG plik JSON z workflow, promptem, seedem, LoRA i parametrami samplera. **Nie usuwaj go** — bez seeda nie odtworzysz udanego wyniku, a to jedyny sposób, żeby dogenerować spójną serię (np. osiem kierunków tego samego statku).
