# Retrening LoRA — `amigapxl_pirates_v2`

**Data:** 2026-09-01 · **Sprzęt:** GTX 1060 6 GB (Pascal) · **Narzędzia:** `C:\AI\kohya_ss`, `C:\AI\ComfyUI`

Dokument opisuje, dlaczego pierwsza wersja LoRA była nieużywalna, jak zbudowano nowy zbiór
treningowy, jaką konfiguracją trenowano v2 i co z tego wyszło.

---

## 1. Co było źle w v1

`amigapxl_pirates_v1_ep8/ep10.safetensors` trenowano na **pełnych zrzutach ekranu**
z amigowego i c64-owego *Sid Meier's Pirates!* (`temp/Pirates Amiga assets`).
Captiony opisywały całe ekrany:

```
amigapxl, pixel art, top-down view, retro game navigation map,
caribbean sea, blue ocean, green islands, sailing ship, compass rose,
mountain rocks, port town, amiga graphics, limited palette
```

Model nauczył się więc **kompozycji ekranu gry**, a nie obiektu. Przy prompcie
„pojedynczy statek" zwracał mapę z wyspami, kilkoma statkami i paskiem HUD na dole.
Sprawdzone przy sile 0.8 i 0.45 — bez różnicy. Prompt negatywny („no user interface,
no map") tego nie usuwa, bo bias jest **kompozycyjny, nie leksykalny**.

### Audyt starego pipeline'u

| Element | Ustalenie |
|---|---|
| Skrypty | `C:\AI\preprocess_training_data.py`, `C:\AI\generate_captions.py`, `C:\AI\setup_kohya.bat` |
| Stary dataset | `C:\Users\websy\Documents\Pirates\training_ready` — **katalog już nie istnieje**, przepadł |
| Materiał źródłowy | `C:\GIT\PiratesChronicles\temp\Pirates Amiga assets` — 429 plików, **94 unikalne ekrany** (reszta to duplikaty, sprawdzone hashem percepcyjnym) |
| Wynikowa LoRA | `C:\AI\ComfyUI\models\loras\amigapxl_pirates_v1_ep{8,10}.safetensors` (19 MB) |
| Konfiguracja treningu | **nie zachowała się** — brak `.toml`/`.json`; `C:\AI\kohya_ss\dataset` i `models` są puste |

---

## 2. Dlaczego NIE wycięto obiektów ze screenshotów

Pierwotny plan zakładał wycięcie pojedynczych obiektów ze starych zrzutów. Po przeglądzie
94 unikalnych ekranów okazało się, że materiał jest do tego **nienadający się**:

- ~60 ekranów to okna dialogowe z portretem i ramką tekstu — obiekt tkwi w scenie z tłem pokoju,
- ekrany żeglugi mają statek na tle nieba i morza — wycięcie oznacza ręczne maskowanie,
- statki na mapie nawigacyjnej mają ~16×16 px — po przeskalowaniu do 512 to breja,
- realny zysk: kilkanaście kadrów wymagających ręcznej obróbki każdego.

Trenowanie na takim materiale powtórzyłoby błąd v1 (tło sceny w kadrze).
Zamiast tego zbudowano dataset z **gotowych wycinków, które projekt już ma**.

---

## 3. Nowy zbiór treningowy

Skrypt: [`ai-assets/scripts/build_lora_v2_dataset.py`](../scripts/build_lora_v2_dataset.py)
Wyjście: `C:\AI\kohya_ss\dataset\pirates_v2\img\2_amigapxl` — **82 obrazy 512×512 + 82 captiony**

| Źródło | Sztuk | Uwagi |
|---|---|---|
| `public/assets/sprites/pirate_icons.jpg` | 48 | arkusz 8×6 ikon pixel-art; siatka wykryta automatycznie (komórka 146×143 px, skok 177,14 × 159,8) |
| `public/assets/sprites/sailship.png` | 8 × 2 tła | 8 kierunków statku, widok z góry |
| `public/assets/sprites/originals/*.png` | 6 × 2 tła | sprite'y miast i fortów (izometria) |
| `windrose.png`, `cloud_spite.png`, `crew_party.png` | 3 × 2 tła | róża wiatrów, chmura, grupa marynarzy |

### Przezroczystość → jednolite tło

SD/kohya nie trenuje na kanale alfa. Każdy sprite z alfą przycięto do bboxa, przeskalowano
do 78 % kadru i wklejono **wyśrodkowany** na płaskim tle. Użyto dwóch teł, żeby model
nauczył się, że tło jest dowolne i płaskie, a tematem jest obiekt:

- `#473430` (brąz — ten sam, co tło arkusza ikon),
- `#F3F1EC` (biel).

Ikony pixel-art skalowano **NEAREST** (zachowanie ostrych pikseli), sprite'y malowane — LANCZOS.

### Captiony

Format stały, token wyzwalający na pierwszym miejscu (`--keep_tokens 1`, więc przetrwa
`--shuffle_caption`):

```
amigapxl, <obiekt>, single object, centered, game asset sprite, <styl>, plain <tło> background
```

Przykłady:

```
amigapxl, wooden treasure chest with gold trim, single object, centered, game asset sprite, pixel art icon, plain dark brown background
amigapxl, tall sailing ship seen from above, sailing north, single object, centered, game asset sprite, painted top down game sprite, plain white background
amigapxl, large fortified colonial city with bastions on an island, single object, centered, game asset sprite, isometric town sprite, plain dark brown background
```

Trzy warianty `<styl>`: `pixel art icon`, `painted top down game sprite`, `isometric town sprite`
(+ `game ui sprite`, `game sprite`) — pozwalają sterować rejestrem przy generowaniu.
**Żaden caption nie opisuje HUD-u, mapy ani ekranu gry.**

---

## 4. Konfiguracja treningu

Skrypt: [`ai-assets/scripts/train_lora_v2.bat`](../scripts/train_lora_v2.bat)

| Parametr | Wartość |
|---|---|
| Checkpoint bazowy | `pixel-art-diffusion-v1.safetensors` (SD 1.5) — ten sam, na którym generujemy |
| network | `networks.lora`, dim 32, alpha 16 |
| LR | unet 1e-4, text encoder 5e-5, scheduler `cosine`, warmup 80 |
| Optymalizator | `AdamW8bit` |
| Rozdzielczość / batch | 512×512 / 2 |
| Powtórzenia × epoki | 2 × 10 → **820 kroków** (≈20 przejść na obraz) |
| Precyzja | fp16 (trening i zapis) |
| Oszczędności VRAM | `--xformers --cache_latents --gradient_checkpointing` |
| Pozostałe | `--clip_skip 2 --seed 31337 --keep_tokens 1 --shuffle_caption` |

### Napotkane problemy

1. **`UnicodeEncodeError` na starcie treningu** — kohya wypisuje komunikaty po japońsku,
   a konsola Windows w polskiej lokalizacji używa cp1250. Naprawa: `set PYTHONIOENCODING=utf-8`
   i `set PYTHONUTF8=1` w `.bat`.
2. **ComfyUI zajmował 3,4 GB VRAM** — przy 6 GB nie ma miejsca na trening.
   Trzeba zatrzymać proces ComfyUI *przed* startem (`/free` nie wystarcza — zwalnia modele,
   ale nie alokator).
3. **Wolne kroki (~4 s/krok)** — GTX 1060 to Pascal GP106, który ma FP16 okrojone do 1/64
   przepustowości FP32, więc `mixed_precision fp16` nie przyspiesza, a `gradient_checkpointing`
   dokłada ~30 %. Pierwotny plan (4 powtórzenia × 10 epok = 1640 kroków) dawał ~1,8 h;
   zmniejszono do 2 × 10 = 820 kroków (~55 min) bez straty jakości.

---

## 5. Wyniki

Trening: **820/820 kroków w 1 h 03 min**, `avr_loss` 0,085 → ~0,045, bez OOM.

| Plik | Gdzie |
|---|---|
| `amigapxl_pirates_v2.safetensors` (epoka 10, 37 MB, dim 32) | `C:\AI\kohya_ss\dataset\pirates_v2\model\` + `C:\AI\ComfyUI\models\loras\` |
| `amigapxl_pirates_v2_ep5.safetensors` (epoka 5) | `C:\AI\ComfyUI\models\loras\` |

### Wygenerowany zestaw

Skrypt: [`ai-assets/scripts/gen_lora_v2_assets.py`](../scripts/gen_lora_v2_assets.py)
Wyjście: `ai-assets/output/lora_v2/` — **83 obrazy 512×512 + `manifest.json`**
(prompt, negatyw, checkpoint, LoRA, siła, seed, sampler dla każdego obrazu).

- **51 assetów** przy `amigapxl_pirates_v2` @ 0,75 — 9 klas statków, 5 klatek uszkodzeń,
  12 ikon UI, 8 towarów, 7 portretów, 5 budynków portowych, 5 efektów.
  Arkusz: `_contact_sheet_assets.png`
- **32 kontrolki** — 8 tych samych promptów × 4 konfiguracje (bez LoRA / v1 @0,8 / v2 @0,6 / v2 @0,9).
  Arkusz: `_contact_sheet_controls.png`

Wszystkie obrazy: seed **31337**, 28 kroków, CFG 7,5, `dpmpp_2m`/`karras`,
checkpoint `pixel-art-diffusion-v1`. Negatyw:

```
full game screen, user interface, hud, map, multiple objects, scene,
text, watermark, signature, blurry, photo, 3d render, jpeg artifacts, frame, border
```

### Czy problem „całe ekrany zamiast sprite'ów" zniknął? Tak

**51/51 assetów to pojedynczy, wyśrodkowany obiekt na płaskim tle.** Ani jednego HUD-u,
ani jednej mapy, ani jednego kadru z wieloma obiektami.

Arkusz kontrolny pokazuje to wprost — te same prompty, ten sam seed, różne LoRA:

| Prompt | v1 @ 0,8 | v2 @ 0,75 |
|---|---|---|
| `heavy spanish galleon ... seen from above` | forteca na wieży + **kilka małych stateczków rozrzuconych po kadrze** | jeden galeon |
| `stack of white sugar loaves` | **arkusz kilkunastu drobnych sprite'ów** rozsypanych po tle | jeden stos |
| `stone coastal fort with bastions` | fragment **izometrycznej mapy** na zielonym tle | jeden fort na wysepce |
| `orange explosion burst` | **kilkanaście małych sprite'ów** na czerwonym tle | jedna eksplozja |

Bias kompozycyjny v1 ujawnia się dokładnie tam, gdzie prompt nie opisuje pospolitego
przedmiotu (skrzynia, kompas, portret wychodziły v1 poprawnie). W v2 nie występuje w ogóle.

### Ocena jakościowa (co jest dobre, co słabe)

| Kategoria | Ocena | Uwagi |
|---|---|---|
| Statki (9 klas) | **bardzo dobra** | spójne z `sailship.png`, gotowe po wycięciu tła; **ale wychodzą w ujęciu 3/4, nie z góry** — model zignorował `seen from above` |
| Uszkodzenia | dobra | `dmg_wreck`, `dmg_hull_holes` użyteczne; `dmg_burning` prawie bez ognia |
| Budynki portowe | **bardzo dobra** | kościół, fort, tawerna, magazyn, dok — spójna izometria |
| Portrety | dobra | gubernator, kupiec, pirat, żołnierz OK; `char_barman` wyszedł fotorealistyczny (odstaje) |
| Ikony UI | średnia | styl pixel-art trafiony; semantyka bywa nie ta (`icon_anchor` → statek, `icon_treasure_map` → krzyż medyczny) |
| Towary | **słaba** | cukier/bawełna/kakao to bezkształtne bryłki — brak tych obiektów w zbiorze treningowym |
| Efekty | słaba | eksplozja/dym/ogień jako surowe piksele; do bitwy morskiej za mało |

Porównanie sił: **0,6–0,75 to optimum**. Przy 0,9 kompozycja dalej jest poprawna, ale
detal się rozpada (statki tracą olinowanie, ikony robią się plamiaste). Bez LoRA obiekty
też są izolowane, ale w generycznym stylu 3D-renderu — **nie pasują do grafiki gry**.
Właśnie tym v2 bije ścieżkę „bez LoRA": trzyma styl własnych assetów projektu.

---

## 6. Rekomendacja

**v2 nadaje się do użycia produkcyjnego** — z zastrzeżeniami co do kategorii.

1. **Używaj v2 @ 0,7** jako domyślnej. Trigger `amigapxl` na początku promptu, potem
   rzeczownik, potem stały ogon `single object, centered, game asset sprite, <styl>,
   plain dark brown background`. Płaskie brązowe tło zdejmuje się chroma-keyem.
2. **Bierz od razu:** statki, budynki portowe, portrety, część ikon. Reszta wymaga
   przesiewania seedów (generacja 512×512 to ~24 s — taniej wygenerować pięć wariantów).
3. **Do dostrojenia w v3** — w kolejności zwrotu z inwestycji:
   - **widok z góry dla statków.** W zbiorze jest tylko 8 klatek `sailship.png` z góry,
     a 48 ikon jest w ujęciu 3/4 — ujęcie 3/4 wygrało. Naprawa: więcej kadrów z góry
     (można wygenerować 8 kierunków dla każdej z 9 klas i najlepsze dołożyć do zbioru)
     albo osobny token stylu, np. `topdownship`.
   - **towary i efekty.** Zerowa reprezentacja w zbiorze. Dorysować/wygenerować ~15 ikon
     towarów i ~10 klatek efektów, dołożyć do datasetu.
   - **balans kategorii.** 48/82 obrazów to ikony ekwipunku — model ciągnie wszystko
     w stronę „ikony". Docelowo ~1/3 ikony, ~1/3 statki, ~1/3 budynki + postacie.
   - **`amigapxl_pirates_v2_ep5`** warto porównać — epoka 10 może już lekko przeuczać
     na ikonach (te 48 obrazów widziało 20 przejść).
4. **Czego nie robić:** nie wracać do treningu na zrzutach ekranu i nie próbować leczyć
   v1 promptem negatywnym. Sprawdzone, nie działa.

### Uwaga o repozytorium

`ai-assets/output/lora_v2/` waży **22 MB** i **nie jest w `.gitignore`**. Przed commitem
albo dopisać wykluczenie, albo przenieść wybrane assety do `sd-pipeline/assets_game/`
(skompresowane przez `sharp`) i skasować resztę.

### Odtworzenie

```bash
python ai-assets/scripts/build_lora_v2_dataset.py     # dataset -> C:\AI\kohya_ss\dataset\pirates_v2
# zatrzymaj ComfyUI (zajmuje 3,4 GB VRAM), potem:
ai-assets\scripts\train_lora_v2.bat                   # ~1 h na GTX 1060
copy C:\AI\kohya_ss\dataset\pirates_v2\model\amigapxl_pirates_v2.safetensors C:\AI\ComfyUI\models\loras\
# uruchom ComfyUI z jego venv: C:\AI\ComfyUI\venv\Scripts\python.exe main.py --listen 127.0.0.1 --port 8188
python ai-assets/scripts/gen_lora_v2_assets.py        # ~35 min, 83 obrazy
python ai-assets/scripts/make_contact_sheet.py ai-assets/output/lora_v2 sheet.png 9 190
```
