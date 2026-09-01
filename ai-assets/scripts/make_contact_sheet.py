"""
Buduje arkusz kontaktowy (siatka miniatur z podpisami) z katalogu PNG.

  python make_contact_sheet.py <katalog> <plik_wyjsciowy.png> [kolumny] [rozmiar_kafla]
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw


def build(src: Path, out: Path, cols=8, th=192, prefix=None):
    fs = sorted(p for p in src.glob("*.png") if p.name != out.name)
    if prefix:
        fs = [f for f in fs if f.name.startswith(prefix)]
    if not fs:
        print("brak plikow w", src)
        return
    rows = (len(fs) + cols - 1) // cols
    lab = 16
    sheet = Image.new("RGB", (cols * th, rows * (th + lab)), (18, 18, 20))
    dr = ImageDraw.Draw(sheet)
    for i, f in enumerate(fs):
        im = Image.open(f).convert("RGB")
        im.thumbnail((th, th))
        x, y = (i % cols) * th, (i // cols) * (th + lab)
        sheet.paste(im, (x + (th - im.width) // 2, y))
        dr.text((x + 3, y + th + 2), f.stem[:34], fill=(255, 226, 140))
    sheet.save(out)
    print(f"{out}  ({len(fs)} obrazow, {sheet.size[0]}x{sheet.size[1]})")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 8
    th = int(sys.argv[4]) if len(sys.argv) > 4 else 192
    prefix = sys.argv[5] if len(sys.argv) > 5 else None
    build(src, out, cols, th, prefix)
