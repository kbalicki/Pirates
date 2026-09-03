"""
postprocess_asset.py - deterministyczna obrobka surowego wyjscia ComfyUI do assetu gry.

DLACZEGO TO ISTNIEJE
====================
Stable Diffusion nie potrafi wygenerowac kanalu alfa. Prompt "transparent background"
daje w praktyce biale albo szare tlo - i tak jest w kazdym pliku w temp/comfy-test.
Roznicy nie zrobi ani inny checkpoint, ani inna LoRA: model zwraca RGB, kropka.
Wyciecie tla, przyciecie, ujednolicenie canvasu i palety to zadanie dla kodu,
nie dla modelu - i tu jest zrobione raz, deterministycznie, z raportem.

CO ROBI (kolejnosc ma znaczenie)
================================
  1. wykrywa kolor tla z ramki obrazu (albo bierze podany --bg),
  2. buduje maske tla FLOOD FILLEM OD KRAWEDZI, a nie globalnym chroma-keyem
     - dzieki temu biale zagle w srodku statku NIE znikaja,
  3. lata dziury i kasuje odpryski (male spojne skladowe),
  4. liczy miekka alfe na krawedzi i odszumia kolor krawedzi (unmix),
  5. przycina do bboxa nieprzezroczystych pikseli (trim),
  6. skaluje z zachowaniem proporcji do --content czesci docelowego canvasu,
  7. opcjonalnie kwantyzuje palete (dowolna liczba kolorow albo paleta Amiga OCS),
  8. wklada na canvas --size x --size, wysrodkowany (albo --anchor bottom),
  9. zapisuje PNG-32 + raport JSON i sprawdza kryteria akceptacji.

URUCHOMIENIE
============
    python ai-assets/scripts/postprocess_asset.py wejscie.png -o wyjscie.png --size 64
    python ai-assets/scripts/postprocess_asset.py katalog/ -o katalog_out/ --size 64 --palette 32
    python ai-assets/scripts/postprocess_asset.py in.png -o out.png --size 96 --anchor bottom --hard

Wymaga tylko Pillow + numpy + scipy - wszystkie sa i w systemowym Pythonie,
i w venv ComfyUI (C:\\AI\\ComfyUI\\venv\\Scripts\\python.exe).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

# ---------------------------------------------------------------- paleta Amiga
# Z ai-assets/docs/ASSET-SPEC.md. Uzywana przy --palette amiga.
AMIGA_OCS = [
    "#000000", "#FFFFFF",
    "#000033", "#000066", "#003399", "#0055AA", "#2277CC", "#4499DD",
    "#003300", "#006600", "#228822", "#44AA44", "#66CC44", "#88DD66",
    "#886622", "#AA8833", "#CCAA55", "#DDBB77", "#EEDD99",
    "#442200", "#664400", "#886644", "#AA8866", "#CCAA88",
    "#CC8866", "#DDAA88", "#EECCAA",
    "#990000", "#CC2222", "#FF4444",
    "#000088", "#2244AA", "#4466CC",
]


def hex_to_rgb(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


# ------------------------------------------------------------------- wykrywanie
def detect_bg(rgb: np.ndarray, tol: float, ring: int | None = None) -> tuple[np.ndarray, float, float]:
    """Kolor tla = mediana pikseli ramki. Zwraca (kolor, rozrzut, udzial ramki w tle).

    Rozrzut liczony jako MEDIANA odleglosci, nie srednia: obiekt dotykajacy
    krawedzi (albo winieta) nie ma wtedy prawa zawyzyc metryki. `bg_ratio`
    mowi, jaka czesc ramki faktycznie jest tlem - to lepszy sygnal "to scena,
    nie izolowany obiekt" niz sam rozrzut.
    """
    h, w, _ = rgb.shape
    if ring is None:
        ring = max(1, min(h, w) // 64)
    border = np.concatenate([
        rgb[:ring, :, :].reshape(-1, 3),
        rgb[-ring:, :, :].reshape(-1, 3),
        rgb[:, :ring, :].reshape(-1, 3),
        rgb[:, -ring:, :].reshape(-1, 3),
    ]).astype(np.float32)
    med = np.median(border, axis=0)
    d = np.linalg.norm(border - med, axis=1)
    return med.astype(np.float32), float(np.median(d)), float(np.mean(d <= tol))


def background_mask(rgb: np.ndarray, bg: np.ndarray, tol: float, tol_soft: float) -> tuple[np.ndarray, np.ndarray]:
    """Maska tla spojna z krawedzia + miekka alfa na obwodce.

    Zwraca (mask_bg_twarda, alpha_float 0..1).
    """
    dist = np.linalg.norm(rgb.astype(np.float32) - bg[None, None, :], axis=2)

    # kandydaci na tlo: wszystko dostatecznie bliskie kolorowi tla
    cand = dist <= tol_soft

    # zostaw tylko to, co dotyka krawedzi obrazu (flood fill od ramki)
    lab, n = ndimage.label(cand)
    if n == 0:
        return np.zeros(rgb.shape[:2], bool), np.ones(rgb.shape[:2], np.float32)
    edge_labels = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
    edge_labels.discard(0)
    if not edge_labels:
        return np.zeros(rgb.shape[:2], bool), np.ones(rgb.shape[:2], np.float32)
    bg_region = np.isin(lab, list(edge_labels))

    # miekka alfa: 0 tam, gdzie kolor = tlo; 1 od progu tol w gore.
    # Liczona tylko w obszarze spojnym z krawedzia - wnetrze obiektu zostaje kryjace.
    ramp = np.clip((dist - tol * 0.35) / max(tol - tol * 0.35, 1e-3), 0.0, 1.0)
    alpha = np.ones(rgb.shape[:2], np.float32)
    alpha[bg_region] = ramp[bg_region]
    hard_bg = bg_region & (dist <= tol)
    alpha[hard_bg] = 0.0
    return hard_bg, alpha


def clean_alpha(alpha: np.ndarray, min_blob: int, fill_holes: bool) -> np.ndarray:
    """Kasuje odpryski i lata dziury w obiekcie."""
    solid = alpha > 0.5
    if fill_holes:
        solid = ndimage.binary_fill_holes(solid)
    if min_blob > 0:
        lab, n = ndimage.label(solid)
        if n > 1:
            sizes = ndimage.sum(solid, lab, range(1, n + 1))
            keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_blob])
            solid = solid & keep
    out = np.where(solid, np.maximum(alpha, 0.0), np.minimum(alpha, 0.0))
    # tam gdzie solid ale alpha byla miekka - zostaw miekka (obwodka)
    out = np.where(solid, alpha, 0.0)
    return out.astype(np.float32)


def decontaminate(rgb: np.ndarray, alpha: np.ndarray, bg: np.ndarray) -> np.ndarray:
    """Zdejmuje kolor tla z pol-przezroczystych pikseli krawedzi: C = (P - (1-a)BG)/a."""
    a = alpha[..., None]
    safe = np.clip(a, 0.15, 1.0)
    out = (rgb.astype(np.float32) - (1.0 - a) * bg[None, None, :]) / safe
    return np.clip(np.where(a > 0.98, rgb.astype(np.float32), out), 0, 255)


# ------------------------------------------------------------------ kwantyzacja
def quantize_fixed(img: Image.Image, palette: list[tuple[int, int, int]]) -> Image.Image:
    """Kwantyzacja do stalej palety, z zachowaniem alfy (najblizszy kolor w RGB)."""
    arr = np.asarray(img, np.float32)
    rgb, a = arr[..., :3], arr[..., 3]
    pal = np.array(palette, np.float32)
    d = np.linalg.norm(rgb[:, :, None, :] - pal[None, None, :, :], axis=3)
    idx = np.argmin(d, axis=2)
    out = np.dstack([pal[idx], a[..., None]]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def quantize_adaptive(img: Image.Image, ncolors: int) -> Image.Image:
    """Kwantyzacja adaptacyjna (mediancut) tylko na pikselach widocznych."""
    arr = np.asarray(img)
    a = arr[..., 3]
    rgb = Image.fromarray(arr[..., :3], "RGB")
    q = rgb.quantize(colors=max(2, ncolors), method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    out = np.dstack([np.asarray(q.convert("RGB")), a[..., None]]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


# ------------------------------------------------------------------- pipeline
def process(path: Path, args) -> tuple[Image.Image, dict]:
    src = Image.open(path).convert("RGBA")
    arr = np.asarray(src)
    rgb = arr[..., :3]
    had_alpha = bool(arr[..., 3].min() < 255)

    if args.bg == "auto":
        bg, spread, bg_ratio = detect_bg(rgb, args.tol)
    else:
        bg = np.array(hex_to_rgb(args.bg), np.float32)
        _, spread, bg_ratio = detect_bg(rgb, args.tol)

    hard_bg, alpha = background_mask(rgb, bg, args.tol, args.tol * args.soft)
    if had_alpha:  # zrodlo mialo juz alfe - uszanuj ja
        alpha = np.minimum(alpha, arr[..., 3].astype(np.float32) / 255.0)
    alpha = clean_alpha(alpha, args.min_blob, not args.no_fill_holes)
    if args.hard:
        alpha = (alpha > 0.5).astype(np.float32)
    if args.shrink:
        solid = ndimage.binary_erosion(alpha > 0.01, iterations=args.shrink)
        alpha = alpha * solid

    clean_rgb = decontaminate(rgb, alpha, bg)
    work = Image.fromarray(
        np.dstack([clean_rgb, alpha * 255.0]).astype(np.uint8), "RGBA"
    )

    # trim do bboxa widocznych pikseli
    vis = alpha > (args.alpha_cut / 255.0)
    coverage_raw = float(vis.mean())
    if not vis.any():
        raise ValueError("po usunieciu tla nie zostal ani jeden piksel - zle tlo albo za duza tolerancja")
    ys, xs = np.where(vis)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    work = work.crop(bbox)

    # skalowanie do content * size, z zachowaniem proporcji
    target = int(round(args.size * args.content))
    w, h = work.size
    scale = min(target / w, target / h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    resample = {
        "nearest": Image.NEAREST,
        "box": Image.BOX,
        "lanczos": Image.LANCZOS,
    }[args.resample]
    work = work.resize((nw, nh), resample)

    # kwantyzacja palety
    if args.palette == "amiga":
        work = quantize_fixed(work, [hex_to_rgb(c) for c in AMIGA_OCS])
    elif args.palette not in (None, "none", "0"):
        work = quantize_adaptive(work, int(args.palette))

    if args.hard:  # kwantyzacja/skalowanie moglo znowu zmiekczyc krawedz
        a = np.asarray(work)[..., 3]
        arr2 = np.asarray(work).copy()
        arr2[..., 3] = np.where(a > args.alpha_cut, 255, 0)
        work = Image.fromarray(arr2, "RGBA")

    # canvas
    canvas = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
    ox = (args.size - nw) // 2
    oy = (args.size - nh) // 2 if args.anchor == "center" else args.size - nh - int(
        round(args.size * (1 - args.content) / 2)
    )
    canvas.paste(work, (ox, max(0, oy)), work)

    final = np.asarray(canvas)
    fa = final[..., 3]
    visible = fa > args.alpha_cut
    colors = len({tuple(p) for p in final[visible][:, :3]}) if visible.any() else 0

    report = {
        "src": str(path),
        "src_size": list(src.size),
        "src_had_alpha": had_alpha,
        "bg_detected": [int(v) for v in bg],
        "bg_border_spread": round(spread, 1),
        "bg_border_ratio": round(bg_ratio, 3),
        "touches_edge": bool(
            bbox[0] == 0 or bbox[1] == 0 or bbox[2] == src.size[0] or bbox[3] == src.size[1]
        ),
        "bbox_after_trim": list(bbox),
        "coverage_before_trim": round(coverage_raw, 3),
        "coverage_final": round(float(visible.mean()), 3),
        "colors_visible": colors,
        "alpha_min": int(fa.min()),
        "alpha_max": int(fa.max()),
        "out_size": [args.size, args.size],
    }
    return canvas, report


# ---------------------------------------------------------- kryteria akceptacji
def check(report: dict, args) -> list[str]:
    """Twarde kryteria - to samo, co czlowiek sprawdza okiem, ale liczbowo."""
    fails = []
    if report["bg_border_spread"] > args.max_bg_spread and report["bg_border_ratio"] < 0.6:
        fails.append(
            f"tlo nie jest jednolite (rozrzut ramki {report['bg_border_spread']}, "
            f"tlem jest tylko {report['bg_border_ratio']:.0%} ramki)"
            " - to prawdopodobnie scena, nie izolowany obiekt"
        )
    if report["touches_edge"]:
        fails.append(
            "obiekt dotyka krawedzi kadru - zostal obciety przy generowaniu,"
            " przegeneruj z mniejszym obiektem w kadrze"
        )
    if report["alpha_min"] != 0:
        fails.append("brak przezroczystego marginesu - nic nie zostalo wyciete")
    if report["alpha_max"] < 255:
        fails.append("obiekt nigdzie nie jest w pelni kryjacy")
    cov = report["coverage_final"]
    if cov < args.min_coverage:
        fails.append(f"obiekt zajmuje {cov:.0%} canvasu, minimum {args.min_coverage:.0%}")
    if cov > args.max_coverage:
        fails.append(f"obiekt zajmuje {cov:.0%} canvasu, maksimum {args.max_coverage:.0%} (dotyka krawedzi?)")
    if report["coverage_before_trim"] > 0.92:
        fails.append("po odcieciu tla zostalo >92% kadru - tlo nie zostalo rozpoznane")
    if args.max_colors and report["colors_visible"] > args.max_colors:
        fails.append(f"{report['colors_visible']} kolorow, limit {args.max_colors} - dodaj --palette")
    return fails


def main() -> int:
    p = argparse.ArgumentParser(description="Surowe wyjscie SD -> asset gry z alfa.")
    p.add_argument("input", type=Path, help="plik PNG albo katalog")
    p.add_argument("-o", "--out", type=Path, required=True, help="plik albo katalog wyjsciowy")
    p.add_argument("--size", type=int, default=64, help="bok docelowego canvasu (px)")
    p.add_argument("--content", type=float, default=0.90, help="jaka czesc canvasu ma zajac obiekt")
    p.add_argument("--anchor", choices=["center", "bottom"], default="center")
    p.add_argument("--bg", default="auto", help="'auto' albo #RRGGBB")
    p.add_argument("--tol", type=float, default=32.0, help="tolerancja koloru tla (dystans RGB)")
    p.add_argument("--soft", type=float, default=2.2, help="mnoznik tolerancji dla miekkiej obwodki")
    p.add_argument("--hard", action="store_true", help="alfa binarna (pixel art)")
    p.add_argument("--shrink", type=int, default=0, help="eroduj maske o N px (zjada halo)")
    p.add_argument("--alpha-cut", type=int, default=16, help="prog widocznosci piksela")
    p.add_argument("--min-blob", type=int, default=24, help="kasuj skladowe mniejsze niz N px")
    p.add_argument("--no-fill-holes", action="store_true")
    p.add_argument("--resample", choices=["nearest", "box", "lanczos"], default="box")
    p.add_argument("--palette", default="none", help="'none' | 'amiga' | liczba kolorow")
    p.add_argument("--max-colors", type=int, default=0, help="kryterium akceptacji, 0 = wylaczone")
    p.add_argument("--min-coverage", type=float, default=0.15)
    p.add_argument("--max-coverage", type=float, default=0.85)
    p.add_argument("--max-bg-spread", type=float, default=45.0)
    p.add_argument("--strict", action="store_true", help="kod wyjscia 1, gdy ktorykolwiek asset odpadl")
    args = p.parse_args()

    files = sorted(args.input.glob("*.png")) if args.input.is_dir() else [args.input]
    if not files:
        print("brak plikow PNG na wejsciu", file=sys.stderr)
        return 2
    out_dir = args.out if (args.input.is_dir() or args.out.suffix == "") else args.out.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    reports, bad = [], 0
    for f in files:
        dst = (out_dir / f.name) if (args.input.is_dir() or args.out.suffix == "") else args.out
        try:
            img, rep = process(f, args)
        except Exception as exc:  # noqa: BLE001
            print(f"[BLAD ] {f.name}: {exc}")
            bad += 1
            continue
        img.save(dst)
        rep["out"] = str(dst)
        rep["fails"] = check(rep, args)
        reports.append(rep)
        if rep["fails"]:
            bad += 1
            print(f"[ODRZUC] {f.name} -> {dst.name}")
            for m in rep["fails"]:
                print(f"         - {m}")
        else:
            print(
                f"[OK    ] {f.name} -> {dst.name}  "
                f"bbox={rep['bbox_after_trim']} krycie={rep['coverage_final']:.0%} "
                f"kolorow={rep['colors_visible']}"
            )

    (out_dir / "postprocess_report.json").write_text(
        json.dumps(reports, indent=2), encoding="utf-8"
    )
    print(f"\n{len(reports)}/{len(files)} przetworzonych, {bad} do poprawki. "
          f"Raport: {out_dir / 'postprocess_report.json'}")
    return 1 if (bad and args.strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
