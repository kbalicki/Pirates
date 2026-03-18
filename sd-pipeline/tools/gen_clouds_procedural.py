"""
Generate cloud sprites procedurally — truly irregular shapes.

Each cloud is built from randomly scattered overlapping circles
with noise-modulated alpha. NO ellipses, NO uniform shapes.

Usage:
    python gen_clouds_procedural.py
"""

import os
import sys
import math

try:
    from PIL import Image, ImageDraw, ImageFilter
    import numpy as np
except ImportError:
    print("ERROR: pip install Pillow numpy")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "packs", "generated", "sprites", "clouds")

# 6 clouds with varied sizes and character
CLOUDS = [
    {"name": "cloud_1", "w": 220, "h": 120, "seed": 1001, "puffs": 18, "style": "cumulus"},
    {"name": "cloud_2", "w": 140, "h": 70,  "seed": 2002, "puffs": 8,  "style": "wispy"},
    {"name": "cloud_3", "w": 260, "h": 160, "seed": 3003, "puffs": 25, "style": "large"},
    {"name": "cloud_4", "w": 100, "h": 60,  "seed": 4004, "puffs": 6,  "style": "small"},
    {"name": "cloud_5", "w": 180, "h": 90,  "seed": 5005, "puffs": 14, "style": "flat"},
    {"name": "cloud_6", "w": 160, "h": 130, "seed": 6006, "puffs": 20, "style": "tower"},
]


def make_noise(w: int, h: int, rng: np.random.RandomState, scale: int = 4) -> np.ndarray:
    """Generate smooth noise [0..1]."""
    small = rng.rand(max(2, h // scale), max(2, w // scale))
    img = Image.fromarray((small * 255).astype(np.uint8), "L")
    big = img.resize((w, h), Image.BICUBIC)
    arr = np.array(big, dtype=np.float64) / 255.0
    return arr


def generate_cloud(cfg: dict) -> Image.Image:
    """Generate a single cloud sprite with irregular shape."""
    w, h = cfg["w"], cfg["h"]
    rng = np.random.RandomState(cfg["seed"])
    style = cfg["style"]
    num_puffs = cfg["puffs"]

    # Work at 2x resolution for quality, downscale later
    W, H = w * 2, h * 2
    canvas = np.zeros((H, W, 4), dtype=np.float64)  # RGBA float

    # Generate puff centers — scattered irregularly based on style
    puffs = []
    for _ in range(num_puffs):
        if style == "wispy":
            # Elongated horizontal, sparse
            cx = rng.uniform(0.1, 0.9) * W
            cy = rng.uniform(0.3, 0.7) * H
            radius = rng.uniform(0.06, 0.15) * min(W, H)
        elif style == "tower":
            # Taller than wide, clustered vertically
            cx = rng.uniform(0.25, 0.75) * W
            cy = rng.uniform(0.1, 0.9) * H
            radius = rng.uniform(0.08, 0.2) * min(W, H)
        elif style == "flat":
            # Wide and flat
            cx = rng.uniform(0.05, 0.95) * W
            cy = rng.uniform(0.3, 0.7) * H
            radius = rng.uniform(0.07, 0.18) * min(W, H)
        elif style == "large":
            # Big irregular mass
            cx = rng.uniform(0.15, 0.85) * W
            cy = rng.uniform(0.15, 0.85) * H
            radius = rng.uniform(0.1, 0.25) * min(W, H)
        elif style == "small":
            # Compact cluster
            cx = rng.uniform(0.2, 0.8) * W
            cy = rng.uniform(0.2, 0.8) * H
            radius = rng.uniform(0.1, 0.22) * min(W, H)
        else:  # cumulus
            # Classic puffy — cluster with some outliers
            cx = rng.uniform(0.15, 0.85) * W
            cy = rng.uniform(0.2, 0.8) * H
            radius = rng.uniform(0.08, 0.22) * min(W, H)

        # Make radii non-uniform (elliptical individual puffs with random aspect)
        rx = radius * rng.uniform(0.7, 1.4)
        ry = radius * rng.uniform(0.7, 1.4)
        brightness = rng.uniform(0.7, 1.0)  # some puffs darker
        puffs.append((cx, cy, rx, ry, brightness))

    # Add a few connector puffs between existing ones for organic feel
    extra = []
    for i in range(min(len(puffs) - 1, num_puffs // 2)):
        p1 = puffs[i]
        p2 = puffs[(i + 1) % len(puffs)]
        mid_x = (p1[0] + p2[0]) / 2 + rng.uniform(-20, 20)
        mid_y = (p1[1] + p2[1]) / 2 + rng.uniform(-20, 20)
        r = min(p1[2], p2[2]) * rng.uniform(0.4, 0.8)
        extra.append((mid_x, mid_y, r, r * rng.uniform(0.8, 1.2), rng.uniform(0.6, 0.9)))
    puffs.extend(extra)

    # Render each puff as a soft radial gradient onto canvas
    yy, xx = np.mgrid[0:H, 0:W]

    for (cx, cy, rx, ry, brightness) in puffs:
        # Normalized distance from center (elliptical)
        dx = (xx - cx) / max(rx, 1)
        dy = (yy - cy) / max(ry, 1)
        dist2 = dx * dx + dy * dy

        # Soft falloff: 1 at center, 0 at edge (radius=1), smooth cubic
        falloff = np.clip(1.0 - dist2, 0, 1)
        # Cubic ease for softer edges
        falloff = falloff * falloff * (3 - 2 * falloff)

        # Only affect pixels within reasonable range
        mask = dist2 < 1.5

        # Composite: additive alpha, weighted color — STRONG contribution per puff
        alpha_add = falloff * 1.2
        white_val = brightness * 255

        canvas[:, :, 0] = np.where(mask, np.minimum(canvas[:, :, 0] + alpha_add * white_val * 0.5, 255), canvas[:, :, 0])
        canvas[:, :, 1] = np.where(mask, np.minimum(canvas[:, :, 1] + alpha_add * white_val * 0.5, 255), canvas[:, :, 1])
        canvas[:, :, 2] = np.where(mask, np.minimum(canvas[:, :, 2] + alpha_add * white_val * 0.5, 255), canvas[:, :, 2])
        canvas[:, :, 3] = np.where(mask, np.minimum(canvas[:, :, 3] + alpha_add * 255, 255), canvas[:, :, 3])

    # Normalize RGB by alpha to get proper premultiplied->straight conversion
    alpha_ch = canvas[:, :, 3]
    safe_alpha = np.where(alpha_ch > 0.1, alpha_ch, 1)
    for c in range(3):
        canvas[:, :, c] = np.clip(canvas[:, :, c] / safe_alpha * 255, 200, 255)

    # Apply noise modulation to alpha for irregular density
    noise1 = make_noise(W, H, rng, scale=6)
    noise2 = make_noise(W, H, rng, scale=3)
    combined_noise = noise1 * 0.6 + noise2 * 0.4
    # Noise carves holes and varies density — keep more opaque areas
    alpha_mod = np.clip(combined_noise * 1.2 + 0.1, 0, 1)
    canvas[:, :, 3] *= alpha_mod

    # Boost overall alpha so clouds are visible
    canvas[:, :, 3] = np.clip(canvas[:, :, 3] * 1.5, 0, 255)

    # Threshold: remove very faint pixels
    canvas[:, :, 3] = np.where(canvas[:, :, 3] < 10, 0, canvas[:, :, 3])

    # Convert to uint8
    img_data = np.clip(canvas, 0, 255).astype(np.uint8)
    img = Image.fromarray(img_data, "RGBA")

    # Gaussian blur for softness
    r_ch, g_ch, b_ch, a_ch = img.split()
    a_ch = a_ch.filter(ImageFilter.GaussianBlur(radius=4))
    img = Image.merge("RGBA", (r_ch, g_ch, b_ch, a_ch))

    # Downscale to target size
    img = img.resize((w, h), Image.LANCZOS)

    # Final crop to content
    bbox = img.getbbox()
    if bbox:
        pad = 3
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(img.width, bbox[2] + pad)
        y1 = min(img.height, bbox[3] + pad)
        img = img.crop((x0, y0, x1, y1))

    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Generating {len(CLOUDS)} cloud sprites -> {OUT_DIR}\n")

    for cfg in CLOUDS:
        print(f"  {cfg['name']} ({cfg['w']}x{cfg['h']}, style={cfg['style']}, {cfg['puffs']} puffs)...")
        img = generate_cloud(cfg)
        out_path = os.path.join(OUT_DIR, f"{cfg['name']}.png")
        img.save(out_path, "PNG")
        print(f"    -> {out_path} ({img.size[0]}x{img.size[1]})")

    print("\nDone! All cloud sprites generated.")


if __name__ == "__main__":
    main()
