"""
Fix cloud sprites v2: irregular organic edges, NOT ellipses.

Uses Perlin-like noise mask instead of uniform edge fade,
so clouds have bumpy, uneven borders. No straight lines, no ovals.

Usage:
    python fix_clouds.py
"""

import os
import sys
import math

try:
    from PIL import Image, ImageFilter
    import numpy as np
except ImportError:
    print("ERROR: pip install Pillow numpy")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
CLOUD_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "packs", "generated", "sprites", "clouds")

# Each cloud: (target_w, target_h, seed for noise)
CLOUD_CONFIGS = [
    (180, 100, 111),   # cloud_1: large wide
    (120, 80, 222),    # cloud_2: medium
    (200, 130, 333),   # cloud_3: largest
    (90, 65, 444),     # cloud_4: small puffs
]


def simple_noise_2d(w: int, h: int, seed: int, octaves: int = 3) -> np.ndarray:
    """
    Generate a 2D noise field [0..1] using layered random smooth noise.
    Not true Perlin, but good enough for irregular cloud masks.
    """
    rng = np.random.RandomState(seed)
    result = np.zeros((h, w), dtype=np.float64)
    amplitude = 1.0

    for octave in range(octaves):
        # Generate small random grid, then upscale with bicubic interpolation
        grid_w = max(3, w // (2 ** (octaves - octave)))
        grid_h = max(3, h // (2 ** (octaves - octave)))
        small = rng.rand(grid_h, grid_w).astype(np.float64)

        # Upscale using PIL for smooth interpolation
        small_img = Image.fromarray((small * 255).astype(np.uint8), mode="L")
        big_img = small_img.resize((w, h), Image.BICUBIC)
        big = np.array(big_img, dtype=np.float64) / 255.0

        result += big * amplitude
        amplitude *= 0.5

    # Normalize to [0, 1]
    result -= result.min()
    mx = result.max()
    if mx > 0:
        result /= mx
    return result


def aggressive_blue_removal(img: Image.Image) -> Image.Image:
    """Remove blue/cyan background. Keep white/gray cloud pixels with continuous alpha."""
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    hue = np.zeros_like(r)
    md = delta > 2
    mr = (max_c == r) & md
    mg = (max_c == g) & md
    mb = (max_c == b) & md
    hue[mr] = 60 * (((g[mr] - b[mr]) / delta[mr]) % 6)
    hue[mg] = 60 * (((b[mg] - r[mg]) / delta[mg]) + 2)
    hue[mb] = 60 * (((r[mb] - g[mb]) / delta[mb]) + 4)

    sat = np.zeros_like(r)
    sm = max_c > 0
    sat[sm] = (delta[sm] / max_c[sm]) * 100
    val = max_c / 255.0 * 100

    # Cloud score: bright + low saturation = cloud
    brightness_score = np.clip((val - 50) / 50, 0, 1)
    saturation_penalty = np.clip(sat / 40, 0, 1)
    cloud_alpha = brightness_score * (1 - saturation_penalty)

    # Blue/cyan pixels: transparent
    blue_mask = (hue >= 150) & (hue <= 270) & (sat >= 15)
    alpha = np.where(blue_mask, 0, cloud_alpha * 255).astype(np.uint8)

    # Dark pixels: transparent
    dark_mask = val < 30
    alpha = np.where(dark_mask, 0, alpha)

    data[:, :, 3] = alpha
    return Image.fromarray(data.astype(np.uint8))


def apply_irregular_edge_mask(img: Image.Image, noise_seed: int) -> Image.Image:
    """
    Apply an IRREGULAR fade mask using noise, NOT a uniform elliptical fade.
    The noise creates bumpy, organic cloud boundaries.
    """
    rgba = img.convert("RGBA")
    w, h = rgba.size
    data = np.array(rgba)

    # Generate noise field for this cloud
    noise = simple_noise_2d(w, h, noise_seed, octaves=4)

    # Create distance-from-edge field (0 at edges, 1 at center)
    y_coords = np.arange(h).reshape(-1, 1).astype(np.float64)
    x_coords = np.arange(w).reshape(1, -1).astype(np.float64)

    # Distance from each edge as fraction of dimension
    d_left = x_coords / max(w - 1, 1)
    d_right = 1.0 - d_left
    d_top = y_coords / max(h - 1, 1)
    d_bottom = 1.0 - d_top

    # Minimum distance to any edge (0 at edge, 0.5 at center)
    edge_dist = np.minimum(np.minimum(d_left, d_right), np.minimum(d_top, d_bottom))

    # Scale edge_dist so center = 1.0 and edges = 0.0
    # Use non-linear mapping: steep near edges, flat in middle
    edge_factor = np.clip(edge_dist * 3.5, 0, 1)

    # Combine with noise to make the boundary irregular:
    # Where edge_factor is low (near edges), noise determines if pixel survives
    # The noise threshold varies — some areas cut deeper, others extend further
    noise_threshold = 0.3 + noise * 0.5  # threshold varies 0.3-0.8 based on noise

    # Final mask: combine edge distance with noise for irregular boundary
    mask = np.where(
        edge_factor > 0.7,   # well inside: fully opaque
        1.0,
        np.where(
            edge_factor < noise_threshold * 0.3,  # outside noisy boundary: transparent
            0.0,
            # Transition zone: smooth blend influenced by noise
            np.clip((edge_factor - noise_threshold * 0.15) / (0.5 + noise * 0.3), 0, 1)
        )
    )

    # Additional irregular bumps: subtract noise-based "bites" from edges
    bite_mask = (noise > 0.65) & (edge_factor < 0.5)
    mask = np.where(bite_mask, mask * 0.3, mask)

    # Add noise-based protrusions: some edge areas get more opacity
    protrusion_mask = (noise < 0.25) & (edge_factor > 0.15) & (edge_factor < 0.6)
    mask = np.where(protrusion_mask, np.minimum(mask + 0.4, 1.0), mask)

    # Apply mask to alpha
    alpha = data[:, :, 3].astype(np.float64)
    alpha *= mask
    data[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)

    return Image.fromarray(data)


def process_cloud(input_path: str, output_path: str, target_w: int, target_h: int, noise_seed: int) -> None:
    """Full pipeline: blue removal → irregular noise mask → blur → crop → resize."""
    img = Image.open(input_path).convert("RGBA")
    print(f"  Input: {img.size[0]}x{img.size[1]}")

    # Step 1: Remove blue background
    img = aggressive_blue_removal(img)

    # Step 2: Irregular noise-based edge mask (NOT elliptical)
    img = apply_irregular_edge_mask(img, noise_seed)

    # Step 3: Gaussian blur on alpha for softness
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=6))
    img = Image.merge("RGBA", (r, g, b, a))

    # Step 4: Crop to content
    bbox = img.getbbox()
    if bbox:
        pad = 4
        x0 = max(0, bbox[0] - pad)
        y0 = max(0, bbox[1] - pad)
        x1 = min(img.width, bbox[2] + pad)
        y1 = min(img.height, bbox[3] + pad)
        img = img.crop((x0, y0, x1, y1))

    # Step 5: Resize to target
    img = img.resize((target_w, target_h), Image.LANCZOS)

    # Step 6: One more irregular mask pass at final size (different seed)
    img = apply_irregular_edge_mask(img, noise_seed + 1000)

    # Step 7: Final gentle alpha blur
    r, g, b, a = img.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=3))
    img = Image.merge("RGBA", (r, g, b, a))

    img.save(output_path, "PNG")
    print(f"  Output: {target_w}x{target_h} -> {output_path}")


def main():
    print(f"Cloud directory: {CLOUD_DIR}")
    if not os.path.isdir(CLOUD_DIR):
        print(f"ERROR: Directory not found: {CLOUD_DIR}")
        sys.exit(1)

    for i in range(1, 5):
        input_path = os.path.join(CLOUD_DIR, f"cloud_{i}.png")
        if not os.path.exists(input_path):
            print(f"  SKIP: {input_path} not found")
            continue

        tw, th, seed = CLOUD_CONFIGS[i - 1]
        print(f"\nProcessing cloud_{i} -> {tw}x{th} (noise seed={seed})...")
        process_cloud(input_path, input_path, tw, th, seed)

    print("\nDone! Clouds reprocessed with irregular organic edges.")


if __name__ == "__main__":
    main()
