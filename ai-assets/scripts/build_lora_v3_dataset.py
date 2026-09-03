"""
Buduje zbior treningowy dla LoRA `amigapxl_pirates_v3`.

CO NAPRAWIA, A CZEGO NIE
========================

v2 rozwiazala glowny problem v1 (generowanie calych ekranow gry zamiast
pojedynczych sprite'ow). Ocena 51 assetow v2 wykazala dwie pozostale wady:

  1. STATKI WYCHODZA W UJECIU 3/4, NIE Z GORY.
     Przyczyna jest policzalna: w zbiorze v2 bylo 48 ikon w ujeciu 3/4 i tylko
     8 klatek statku z gory. Model uczyl sie, ze "obiekt" = ikona 3/4.
     --> TO ten skrypt naprawia: osiem klatek statku razy odbicie lustrzane
         razy dwa tla daje 32 probki z gory zamiast 8, a lista ikon spada
         z 48 do 28 pozycji. Udzial klatek z gory w zbiorze rosnie z 10% do 32%,
         a przy `repeats` 6 vs 3 ich waga w treningu jest jeszcze wieksza.

  2. WSZYSTKIE DZIEWIEC KLAS STATKOW WYGLADA TAK SAMO.
     --> TEGO ten skrypt NIE naprawia i nie moze. W calym projekcie jest
         DOKLADNIE JEDEN sprite statku (`sailship.png`, osiem kierunkow tego
         samego kadluba). Model nie wymysli sylwetki pinasy ani galeonu, jesli
         nigdy zadnej nie widzial - obroci to, co ma. Zeby dziewiec klas
         roznilo sie sylwetka, trzeba najpierw dostarczyc material zrodlowy:
         narysowane albo pozyskane kadluby o roznej wielkosci i liczbie masztow.
         Retrening bez tego materialu jest strata godziny GPU.

  3. TOWARY I EFEKTY WYCHODZA BEZKSZTALTNE.
     --> Czesciowo naprawialne: w arkuszu ikon sa beczka, worek, monety, kufel
         i skrzynia, ktore realnie sa "towarem". Ten skrypt promuje je (wyzsze
         `repeats`), ale w zbiorze nadal nie ma cukru, tytoniu ani bawelny.
         Pelne rozwiazanie wymaga ~15 narysowanych ikon towarow.

NIE TRENUJ NA WYGENEROWANYCH ASSETACH v2. Uczenie modelu na jego wlasnych
wyjsciach to model collapse - styl zbiegnie sie do wlasnych artefaktow.

URUCHOMIENIE
============
    python ai-assets/scripts/build_lora_v3_dataset.py
    C:\\AI\\kohya_ss\\dataset\\pirates_v3\\train.bat        # ~1 h na GTX 1060

Wyjscie: C:\\AI\\kohya_ss\\dataset\\pirates_v3\\img\\<repeats>_amigapxl\\*.png + *.txt
"""

import shutil
from pathlib import Path

from PIL import Image

SPR = Path(r"C:\GIT\PiratesChronicles\public\assets\sprites")
OUT_ROOT = Path(r"C:\AI\kohya_ss\dataset\pirates_v3")

TRIGGER = "amigapxl"
CANVAS = 512
BG_BROWN = (71, 52, 48)
BG_WHITE = (243, 241, 236)
BG_NAMES = {BG_BROWN: "plain dark brown background", BG_WHITE: "plain white background"}

# Wiecej powtorzen = wiekszy udzial w treningu. Tu lezy caly rebalans.
REPEATS_SHIP = 6   # ujecie z gory - to chcemy wzmocnic
REPEATS_ICON = 3
REPEATS_GOODS = 5  # ikony, ktore realnie sa towarem
REPEATS_BUILDING = 4

# --- ikony z arkusza ---------------------------------------------------------
# Ta sama siatka co w v2; ograniczona do 28 najczytelniejszych pozycji.
ICON_GRID = dict(x0=76, y0=38, px=177.14, py=159.8, w=146, h=143, cols=8, rows=6)

# (indeks w siatce, opis, czy liczy sie jako "towar")
ICONS: list[tuple[int, str, bool]] = [
    (0, "silver cutlass sword", False),
    (1, "golden curved sabre", False),
    (2, "rolled parchment map scroll", False),
    (7, "brass spyglass", False),
    (8, "iron banded wooden treasure chest", True),
    (9, "wooden treasure chest with gold trim", True),
    (11, "red navigation compass", False),
    (12, "ornate red treasure chest", True),
    (13, "golden key", False),
    (15, "long brass telescope", False),
    (17, "steel dagger with red handle", False),
    (19, "brass navigation dividers", False),
    (21, "iron cannon on wooden carriage", False),
    (22, "black pirate flag on a pole", False),
    (26, "treasure map with a red cross", False),
    (27, "brass sextant", False),
    (28, "pile of iron cannonballs", True),
    (30, "golden coin medallion", True),
    (31, "stack of gold coins", True),
    (32, "wooden powder keg barrel", True),
    (33, "flintlock pistol", False),
    (34, "black and tan pirate hat", False),
    (36, "flintlock musket", False),
    (37, "red gunpowder flask", True),
    (40, "round black bomb with a fuse", False),
    (42, "golden goblet chalice", True),
    (43, "golden anchor", False),
    (47, "green rum bottle", True),
]

# Skompresowane wersje z `sprites/`. v2 brala oryginaly z `sprites/originals/`
# (polskie nazwy plikow) - te same obrazy, tylko wieksze; przy skalowaniu do 512
# roznicy nie ma, a sciezki bez polskich znakow sa mniej podatne na kodowanie.
BUILDINGS = [
    ("city_large.png", "large colonial port town seen from above"),
    ("city_medium.png", "colonial port town seen from above"),
    ("city_small.png", "small colonial settlement seen from above"),
    ("city_fort_large.png", "large stone coastal fort seen from above"),
    ("city_fort_medium.png", "stone coastal fort seen from above"),
    ("city_fort_small.png", "small stone fort seen from above"),
]


def flatten(img: Image.Image, bg: tuple[int, int, int]) -> Image.Image:
    """Alfa na jednolite tlo i wysrodkowanie na kwadratowym plotnie 512."""
    img = img.convert("RGBA")
    side = max(img.size)
    pad = int(side * 0.18)
    canvas = Image.new("RGBA", (side + pad * 2, side + pad * 2), (*bg, 255))
    canvas.alpha_composite(img, ((canvas.width - img.width) // 2, (canvas.height - img.height) // 2))
    return canvas.convert("RGB").resize((CANVAS, CANVAS), Image.LANCZOS)


def caption(subject: str, bg: tuple[int, int, int], extra: str = "") -> str:
    parts = [TRIGGER, subject, "single object", "centered", BG_NAMES[bg]]
    if extra:
        parts.insert(2, extra)
    return ", ".join(parts)


def write(out_dir: Path, name: str, img: Image.Image, text: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / f"{name}.png")
    (out_dir / f"{name}.txt").write_text(text, encoding="utf-8")


def build() -> dict[str, int]:
    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)

    counts: dict[str, int] = {}

    def bucket(repeats: int) -> Path:
        return OUT_ROOT / "img" / f"{repeats}_{TRIGGER}"

    # --- statki: 8 klatek -> 32 probki z gory --------------------------------
    sheet = Image.open(SPR / "sailship.png").convert("RGBA")
    frame = sheet.width // 8
    ship_dir = bucket(REPEATS_SHIP)
    n = 0
    for i in range(8):
        cell = sheet.crop((i * frame, 0, (i + 1) * frame, sheet.height))
        # Oryginal + odbicie poziome, kazde na dwoch tlach = 4 probki na klatke.
        for mirrored in (False, True):
            src = cell.transpose(Image.FLIP_LEFT_RIGHT) if mirrored else cell
            for bg in (BG_BROWN, BG_WHITE):
                write(
                    ship_dir,
                    f"ship_{i}_{'m' if mirrored else 'o'}_{'b' if bg == BG_BROWN else 'w'}",
                    flatten(src, bg),
                    caption("tall sailing ship seen from directly above", bg,
                            "top down game sprite"),
                )
                n += 1
    counts["ships"] = n

    # --- ikony ---------------------------------------------------------------
    icons = Image.open(SPR / "pirate_icons.jpg").convert("RGBA")
    gr = ICON_GRID
    n_icon = n_goods = 0
    for index, subject, is_goods in ICONS:
        row, col = divmod(index, gr["cols"])
        x = int(gr["x0"] + col * gr["px"])
        y = int(gr["y0"] + row * gr["py"])
        cell = icons.crop((x, y, x + gr["w"], y + gr["h"]))
        repeats = REPEATS_GOODS if is_goods else REPEATS_ICON
        out_dir = bucket(repeats)
        for bg in (BG_BROWN, BG_WHITE):
            write(
                out_dir,
                f"icon_{index}_{'b' if bg == BG_BROWN else 'w'}",
                flatten(cell, bg),
                caption(subject, bg, "game item icon"),
            )
            if is_goods:
                n_goods += 1
            else:
                n_icon += 1
    counts["icons"] = n_icon
    counts["goods"] = n_goods

    # --- budynki -------------------------------------------------------------
    build_dir = bucket(REPEATS_BUILDING)
    n_b = 0
    for rel, subject in BUILDINGS:
        path = SPR / rel
        if not path.exists():
            print(f"  pominieto (brak pliku): {rel}")
            continue
        img = Image.open(path)
        for bg in (BG_BROWN, BG_WHITE):
            write(build_dir, f"{path.stem}_{'b' if bg == BG_BROWN else 'w'}",
                  flatten(img, bg), caption(subject, bg, "isometric game sprite"))
            n_b += 1
    counts["buildings"] = n_b

    return counts


TRAIN_BAT = r"""@echo off
REM Trening LoRA amigapxl_pirates_v3 - odpowiednik konfiguracji v2,
REM na przebudowanym i zbalansowanym zbiorze (patrz build_lora_v3_dataset.py).
cd /d C:\AI\kohya_ss
call venv\Scripts\activate.bat
accelerate launch --num_cpu_threads_per_process 2 sd-scripts\train_network.py ^
  --pretrained_model_name_or_path="C:\AI\ComfyUI\models\checkpoints\pixel-art-diffusion-v1.safetensors" ^
  --train_data_dir="C:\AI\kohya_ss\dataset\pirates_v3\img" ^
  --output_dir="C:\AI\kohya_ss\dataset\pirates_v3\model" ^
  --output_name="amigapxl_pirates_v3" ^
  --resolution=512,512 --network_module=networks.lora ^
  --network_dim=32 --network_alpha=16 ^
  --learning_rate=1e-4 --lr_scheduler=cosine --lr_warmup_steps=50 ^
  --train_batch_size=2 --max_train_epochs=10 --save_every_n_epochs=5 ^
  --mixed_precision=fp16 --save_precision=fp16 ^
  --clip_skip=2 --keep_tokens=1 --seed=31337 ^
  --caption_extension=".txt" --xformers --cache_latents
echo.
echo Skopiuj wynik do ComfyUI:
echo   copy "C:\AI\kohya_ss\dataset\pirates_v3\model\amigapxl_pirates_v3.safetensors" "C:\AI\ComfyUI\models\loras\"
pause
"""


if __name__ == "__main__":
    counts = build()
    (OUT_ROOT / "train.bat").write_text(TRAIN_BAT, encoding="utf-8")

    total = sum(counts.values())
    print(f"\nZbior v3 zbudowany w {OUT_ROOT}")
    for key, value in counts.items():
        print(f"  {key:10s} {value:3d}  ({value / total:.0%})")
    print(f"  {'RAZEM':10s} {total:3d}")
    print("\nUWAGA: to naprawia ujecie (wiecej kadrow z gory) i balans kategorii.")
    print("Nie naprawi tego, ze wszystkie klasy statkow wygladaja tak samo -")
    print("w projekcie jest jeden sprite statku. Potrzebny nowy material zrodlowy.")
    print(f"\nTrening: {OUT_ROOT / 'train.bat'}")
