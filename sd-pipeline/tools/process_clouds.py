"""
Post-process ComfyUI cloud renders: remove blue background via chroma-key,
crop to bounding box, resize to max 200px, and save as PNG with alpha.

Usage:
    python process_clouds.py --input_dir ./assets_raw/clouds --output_dir ../public/assets/sprites/clouds
"""

import argparse
import os
import sys

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("ERROR: Pillow and numpy are required. Install with: pip install Pillow numpy")
    sys.exit(1)


def remove_blue_background(img: Image.Image, hue_min: int = 180, hue_max: int = 240, sat_threshold: int = 40) -> Image.Image:
    """Remove blue sky background by converting to HSV and masking blue hues."""
    rgba = img.convert("RGBA")
    data = np.array(rgba)

    # Convert RGB to HSV-like for blue detection
    r, g, b = data[:, :, 0].astype(float), data[:, :, 1].astype(float), data[:, :, 2].astype(float)
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    # Hue calculation (0-360)
    hue = np.zeros_like(r)
    mask_delta = delta > 0
    # When max is R
    mask_r = (max_c == r) & mask_delta
    hue[mask_r] = 60 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    # When max is G
    mask_g = (max_c == g) & mask_delta
    hue[mask_g] = 60 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    # When max is B
    mask_b = (max_c == b) & mask_delta
    hue[mask_b] = 60 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    # Saturation (0-100)
    saturation = np.zeros_like(r)
    sat_mask = max_c > 0
    saturation[sat_mask] = (delta[sat_mask] / max_c[sat_mask]) * 100

    # Blue mask: hue in range and sufficient saturation
    blue_mask = (hue >= hue_min) & (hue <= hue_max) & (saturation >= sat_threshold)

    # Set alpha to 0 for blue pixels
    data[:, :, 3] = np.where(blue_mask, 0, 255)

    return Image.fromarray(data)


def crop_to_content(img: Image.Image) -> Image.Image:
    """Crop image to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox is None:
        return img
    return img.crop(bbox)


def resize_max(img: Image.Image, max_size: int = 200) -> Image.Image:
    """Resize image so the largest dimension is at most max_size, preserving aspect ratio."""
    w, h = img.size
    if w <= max_size and h <= max_size:
        return img
    scale = max_size / max(w, h)
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    return img.resize((new_w, new_h), Image.LANCZOS)


def process_cloud(input_path: str, output_path: str) -> None:
    """Full pipeline: load -> remove blue -> crop -> resize -> save."""
    img = Image.open(input_path)
    img = remove_blue_background(img)
    img = crop_to_content(img)
    img = resize_max(img, 200)
    img.save(output_path, "PNG")
    print(f"  Processed: {input_path} -> {output_path} ({img.size[0]}x{img.size[1]})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Process cloud renders from ComfyUI")
    parser.add_argument("--input_dir", required=True, help="Directory with raw cloud PNGs")
    parser.add_argument("--output_dir", required=True, help="Output directory for processed PNGs")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # Find all PNG files in input directory
    png_files = sorted([f for f in os.listdir(args.input_dir) if f.lower().endswith(".png")])
    if not png_files:
        print(f"No PNG files found in {args.input_dir}")
        sys.exit(1)

    print(f"Processing {len(png_files)} cloud images...")
    for i, fname in enumerate(png_files, start=1):
        input_path = os.path.join(args.input_dir, fname)
        output_path = os.path.join(args.output_dir, f"cloud_{i}.png")
        process_cloud(input_path, output_path)

    print(f"Done! {len(png_files)} clouds saved to {args.output_dir}")


if __name__ == "__main__":
    main()
