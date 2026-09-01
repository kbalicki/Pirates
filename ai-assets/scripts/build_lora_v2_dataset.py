"""
Buduje zbior treningowy dla LoRA `amigapxl_pirates_v2`.

Zalozenie: v1 byla trenowana na PELNYCH zrzutach ekranu z Amigi -> nauczyla sie
kompozycji calego ekranu gry. v2 uczy sie POJEDYNCZEGO OBIEKTU wysrodkowanego
na jednolitym tle.

Zrodla (wszystko to gotowe wycinki, nie sceny):
  1. public/assets/sprites/pirate_icons.jpg  -> 48 ikon pixel-art (siatka 8x6)
  2. public/assets/sprites/sailship.png      -> 8 klatek statku (widok z gory)
  3. public/assets/sprites/originals/*.png   -> 6 sprite'ow miast (izometria)
  4. windrose / cloud / crew_party           -> 3 dodatkowe sprite'y

SD/kohya nie trenuje na kanale alfa -> przezroczystosc splaszczamy do JEDNOLITEGO
tla i opisujemy to w captionie. Uzywamy dwoch teł (brazowe jak arkusz ikon +
biale), zeby model nauczyl sie, ze tlo jest dowolne i plaskie, a tematem jest obiekt.

Wyjscie: C:\AI\kohya_ss\dataset\pirates_v2\img\<repeats>_amigapxl\*.png + *.txt
"""

import os
import shutil
from pathlib import Path
from PIL import Image

SPR = Path(r"C:\GIT\PiratesChronicles\public\assets\sprites")
OUT_ROOT = Path(r"C:\AI\kohya_ss\dataset\pirates_v2")
REPEATS = 4
CONCEPT = f"{REPEATS}_amigapxl"
IMG_DIR = OUT_ROOT / "img" / CONCEPT

TRIGGER = "amigapxl"
CANVAS = 512
BG_BROWN = (71, 52, 48)
BG_WHITE = (243, 241, 236)
BG_NAMES = {BG_BROWN: "plain dark brown background", BG_WHITE: "plain white background"}

# --- 1. ikony z arkusza -------------------------------------------------------
ICON_GRID = dict(x0=76, y0=38, px=177.14, py=159.8, w=146, h=143, cols=8, rows=6)
ICON_NAMES = [
    "silver cutlass sword", "golden curved sabre", "rolled parchment map scroll",
    "framed old world map", "steel cutlass with brass hilt", "thin rapier sword",
    "folded treasure map parchment", "brass spyglass",
    "iron banded wooden treasure chest", "wooden treasure chest with gold trim",
    "pair of pocket compasses", "red navigation compass",
    "ornate red treasure chest", "golden key", "torn treasure map parchment",
    "long brass telescope",
    "curved bronze dagger", "steel dagger with red handle", "coastal chart map",
    "brass navigation dividers", "crossed steel blades",
    "iron cannon on wooden carriage", "black pirate flag on a pole",
    "black skull banner flag",
    "iron key", "ornate golden key", "treasure map with a red cross",
    "brass sextant", "pile of iron cannonballs", "iron ball and chain",
    "golden coin medallion", "stack of gold coins",
    "wooden powder keg barrel", "flintlock pistol", "black and tan pirate hat",
    "tricorn hat with a blue feather", "flintlock musket", "red gunpowder flask",
    "iron hook hand", "burning torch",
    "round black bomb with a fuse", "pile of cannonballs", "golden goblet chalice",
    "golden anchor", "blunderbuss musket", "pile of spices and parchment",
    "wooden ship steering wheel", "green rum bottle",
]

# --- 2..4. sprite'y z alfa ----------------------------------------------------
SHIP_DIRS = ["sailing north", "sailing north east", "sailing east", "sailing south east",
             "sailing south", "sailing south west", "sailing west", "sailing north west"]

ALPHA_SPRITES = [
    # (sciezka, nazwa pliku, opis, styl)
    (SPR / "originals" / "ma\u0142e miasto.png", "city_small",
     "small colonial port town on an island", "isometric town sprite"),
    (SPR / "originals" / "srednie miasto.png", "city_medium",
     "medium colonial port town with a church on an island", "isometric town sprite"),
    (SPR / "originals" / "duze miasto.png", "city_large",
     "large colonial port city with a cathedral on an island", "isometric town sprite"),
    (SPR / "originals" / "male miasto z fortem.png", "city_fort_small",
     "small colonial town with a stone fort on an island", "isometric town sprite"),
    (SPR / "originals" / "srednie miasto z fortem.png", "city_fort_medium",
     "medium colonial town with a stone fort and walls on an island", "isometric town sprite"),
    (SPR / "originals" / "duze miasto z fortem.png", "city_fort_large",
     "large fortified colonial city with bastions on an island", "isometric town sprite"),
    (SPR / "windrose.png", "windrose", "compass rose wind rose", "game ui sprite"),
    (SPR / "clouds" / "cloud_spite.png", "cloud", "white fluffy cloud", "game sprite"),
    (SPR / "crew_party.png", "crew_party", "group of pirate crew figures", "game sprite"),
]


def fit_on_bg(obj: Image.Image, bg, target_frac=0.78, nearest=False):
    """Wpasowuje obiekt (RGBA, juz przyciety do bboxa) w kwadrat CANVAS na jednolitym tle."""
    canvas = Image.new("RGBA", (CANVAS, CANVAS), bg + (255,))
    box = int(CANVAS * target_frac)
    scale = min(box / obj.width, box / obj.height)
    nw, nh = max(1, int(obj.width * scale)), max(1, int(obj.height * scale))
    resample = Image.NEAREST if nearest else Image.LANCZOS
    o = obj.resize((nw, nh), resample)
    canvas.alpha_composite(o, ((CANVAS - nw) // 2, (CANVAS - nh) // 2))
    return canvas.convert("RGB")


def caption(noun, style, bg):
    return (f"{TRIGGER}, {noun}, single object, centered, game asset sprite, "
            f"{style}, {BG_NAMES[bg]}")


def save(img, cap, name):
    img.save(IMG_DIR / f"{name}.png")
    (IMG_DIR / f"{name}.txt").write_text(cap, encoding="utf-8")


def main():
    if IMG_DIR.exists():
        shutil.rmtree(IMG_DIR)
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "model").mkdir(parents=True, exist_ok=True)
    (OUT_ROOT / "log").mkdir(parents=True, exist_ok=True)

    n = 0

    # 1) ikony pixel-art z arkusza -- tlo juz jest jednolite brazowe
    sheet = Image.open(SPR / "pirate_icons.jpg").convert("RGB")
    g = ICON_GRID
    for j in range(g["rows"]):
        for i in range(g["cols"]):
            idx = j * g["cols"] + i
            x = int(round(g["x0"] + i * g["px"]))
            y = int(round(g["y0"] + j * g["py"]))
            cell = sheet.crop((x, y, x + g["w"], y + g["h"]))
            # kwadratowe plotno w kolorze tla arkusza, ikona wysrodkowana, NEAREST (pixel art)
            canvas = Image.new("RGB", (CANVAS, CANVAS), BG_BROWN)
            s = int(CANVAS * 0.80 / max(cell.width, cell.height))
            up = cell.resize((cell.width * s, cell.height * s), Image.NEAREST)
            canvas.paste(up, ((CANVAS - up.width) // 2, (CANVAS - up.height) // 2))
            save(canvas, caption(ICON_NAMES[idx], "pixel art icon", BG_BROWN),
                 f"icon_{idx:02d}")
            n += 1

    # 2) statki - 8 kierunkow, dwa tla
    ss = Image.open(SPR / "sailship.png").convert("RGBA")
    fw = ss.width // 4
    for k in range(8):
        cx, cy = (k % 4) * fw, (k // 4) * fw
        fr = ss.crop((cx, cy, cx + fw, cy + fw))
        bb = fr.getbbox()
        if bb:
            fr = fr.crop(bb)
        noun = f"tall sailing ship seen from above, {SHIP_DIRS[k]}"
        for bg, tag in ((BG_BROWN, "b"), (BG_WHITE, "w")):
            save(fit_on_bg(fr, bg), caption(noun, "painted top down game sprite", bg),
                 f"ship_{k}_{tag}")
            n += 1

    # 3+4) miasta i reszta - dwa tla
    for path, name, noun, style in ALPHA_SPRITES:
        if not path.exists():
            print("BRAK:", path)
            continue
        im = Image.open(path).convert("RGBA")
        bb = im.getbbox()
        if bb:
            im = im.crop(bb)
        near = im.width < 128
        for bg, tag in ((BG_BROWN, "b"), (BG_WHITE, "w")):
            save(fit_on_bg(im, bg, nearest=near), caption(noun, style, bg),
                 f"{name}_{tag}")
            n += 1

    print(f"zapisano {n} obrazow do {IMG_DIR}")


if __name__ == "__main__":
    main()
