"""
Wrapper for madaror/tiled-diffusion — generates seamless tileable assets
for Pirates Chronicles.

Usage:
    python generate_tiled.py --prompt "ocean water texture" --output ./assets_raw/tiles
    python generate_tiled.py --prompt "ocean water" --mode gif --gif-direction right --output ./assets_raw/water
    python generate_tiled.py --prompts-file ./prompts/tiles.txt --output ./assets_raw/tiles
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Add tiled-diffusion to path
TILED_DIFF_DIR = os.path.join(os.path.dirname(__file__), "tiled-diffusion")
sys.path.insert(0, TILED_DIFF_DIR)

import torch
import numpy as np
from PIL import Image


def create_self_tiling_latent(prompt, negative_prompt, width=512, height=512):
    """Create a LatentClass configured for self-tiling (tiles with itself on all axes)."""
    from latent_class import LatentClass

    return LatentClass(
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=height,
        width=width,
        side_id=[1, 1, 2, 2],          # R-L paired, U-D paired
        side_dir=["cw", "ccw", "cw", "ccw"],
    )


def create_x_tiling_latent(prompt, negative_prompt, width=512, height=512):
    """Create a LatentClass that tiles horizontally only."""
    from latent_class import LatentClass

    return LatentClass(
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=height,
        width=width,
        side_id=[1, 1, None, None],
        side_dir=["cw", "ccw", None, None],
    )


def create_y_tiling_latent(prompt, negative_prompt, width=512, height=512):
    """Create a LatentClass that tiles vertically only."""
    from latent_class import LatentClass

    return LatentClass(
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=height,
        width=width,
        side_id=[None, None, 1, 1],
        side_dir=[None, None, "cw", "ccw"],
    )


TILING_MODES = {
    "self": create_self_tiling_latent,
    "x": create_x_tiling_latent,
    "y": create_y_tiling_latent,
}

DEFAULT_NEGATIVE = (
    "blurry, 3d render, photo, realistic, watermark, text, "
    "low quality, deformed, border, frame, ugly"
)

PIXEL_ART_SUFFIX = ", pixel art, 16-bit style, top-down view, game texture, clean edges"


def generate_single(model, prompt, args, device):
    """Generate a single tiled image and return (image, seed, metadata)."""
    full_prompt = prompt + PIXEL_ART_SUFFIX if args.pixel_art else prompt
    negative = args.negative or DEFAULT_NEGATIVE

    tiling_fn = TILING_MODES.get(args.tiling, create_self_tiling_latent)
    latent = tiling_fn(full_prompt, negative, args.width, args.height)

    seed = args.seed if args.seed >= 0 else int(torch.randint(0, 2**31, (1,)).item())

    result = model(
        latents_arr=[latent],
        negative_prompt=negative,
        inference_steps=args.steps,
        seed=seed,
        cfg_scale=args.cfg,
        height=args.height,
        width=args.width,
        max_width=args.max_width,
        max_replica_width=args.max_replica_width,
        strength=args.strength,
        device=device,
    )

    img_array = result[0].image
    if isinstance(img_array, np.ndarray):
        if img_array.dtype == np.float32 or img_array.dtype == np.float64:
            img_array = (img_array * 255).clip(0, 255).astype(np.uint8)
        image = Image.fromarray(img_array)
    else:
        image = img_array

    # Resize to target if specified
    if args.resize:
        image = image.resize(
            (args.resize, args.resize), Image.Resampling.NEAREST
        )

    metadata = {
        "prompt": prompt,
        "full_prompt": full_prompt,
        "negative_prompt": negative,
        "seed": seed,
        "steps": args.steps,
        "cfg_scale": args.cfg,
        "tiling_mode": args.tiling,
        "size": f"{args.width}x{args.height}",
        "resize": args.resize,
        "model": "stable-diffusion-v1-5",
        "tool": "tiled-diffusion",
        "timestamp": datetime.now().isoformat(),
    }

    return image, seed, metadata


def save_output(image, metadata, output_dir, prompt_text):
    """Save PNG + JSON metadata."""
    os.makedirs(output_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in prompt_text[:40])
    base_name = f"{timestamp}_{safe_name}"

    png_path = os.path.join(output_dir, f"{base_name}.png")
    json_path = os.path.join(output_dir, f"{base_name}.json")

    image.save(png_path)
    metadata["output_png"] = os.path.basename(png_path)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)

    print(f"  Saved: {png_path}")
    return png_path


def generate_gif(image, output_dir, prompt_text, args):
    """Generate seamless looping GIF from a tiled image."""
    from gif_creator import process_single_image

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in prompt_text[:40])

    # Save temp image for gif_creator
    temp_dir = os.path.join(output_dir, "_temp_gif")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, "input.png")
    image.save(temp_path)

    gif_path = os.path.join(output_dir, f"{timestamp}_{safe_name}.gif")

    # Use gif_creator's logic
    try:
        process_single_image(
            temp_path,
            gif_path,
            direction=args.gif_direction,
            duration=args.gif_duration,
            num_frames=args.gif_frames,
            target_size=args.gif_size,
        )
        print(f"  GIF saved: {gif_path}")
    except (ImportError, AttributeError):
        # Fallback: manual GIF creation
        _create_gif_manual(image, gif_path, args)
        print(f"  GIF saved (manual): {gif_path}")

    # Cleanup temp
    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)

    return gif_path


def _create_gif_manual(image, gif_path, args):
    """Manual GIF creation by scrolling a 3x3 tiled image."""
    w, h = image.size

    # Create 3x3 tiled version
    tiled = Image.new("RGB", (w * 3, h * 3))
    for row in range(3):
        for col in range(3):
            tiled.paste(image, (col * w, row * h))

    frames = []
    num_frames = args.gif_frames

    direction = args.gif_direction
    for i in range(num_frames):
        frac = i / num_frames
        if direction == "right":
            x_off = int(frac * w)
            y_off = h
        elif direction == "left":
            x_off = int((1 - frac) * w)
            y_off = h
        elif direction == "down":
            x_off = w
            y_off = int(frac * h)
        elif direction == "up":
            x_off = w
            y_off = int((1 - frac) * h)
        else:
            x_off = int(frac * w)
            y_off = h

        crop = tiled.crop((x_off, y_off, x_off + w, y_off + h))

        if args.gif_size:
            crop = crop.resize(
                (args.gif_size, args.gif_size), Image.Resampling.NEAREST
            )
        frames.append(crop)

    frame_duration = args.gif_duration // num_frames
    frames[0].save(
        gif_path,
        save_all=True,
        append_images=frames[1:],
        loop=0,
        duration=frame_duration,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Generate seamless tileable assets for Pirates Chronicles"
    )

    # Input
    parser.add_argument("--prompt", type=str, help="Single prompt")
    parser.add_argument("--prompts-file", type=str, help="File with one prompt per line")
    parser.add_argument("--negative", type=str, default=None, help="Negative prompt")

    # Output
    parser.add_argument("--output", type=str, default="./assets_raw", help="Output directory")
    parser.add_argument("--resize", type=int, default=None, help="Resize output (e.g. 32 for tiles)")

    # Generation settings
    parser.add_argument("--tiling", choices=["self", "x", "y"], default="self",
                       help="Tiling mode: self (all axes), x (horizontal), y (vertical)")
    parser.add_argument("--width", type=int, default=512)
    parser.add_argument("--height", type=int, default=512)
    parser.add_argument("--steps", type=int, default=40, help="Inference steps")
    parser.add_argument("--cfg", type=float, default=7.5, help="CFG scale")
    parser.add_argument("--seed", type=int, default=-1, help="Seed (-1 for random)")
    parser.add_argument("--max-width", type=int, default=32, help="Latent constraint width")
    parser.add_argument("--max-replica-width", type=int, default=5, help="Edge similarity region")
    parser.add_argument("--strength", type=float, default=0.92, help="Img2img strength")
    parser.add_argument("--scheduler", choices=["ddpm", "ddim"], default="ddpm")
    parser.add_argument("--pixel-art", action="store_true", default=True,
                       help="Add pixel art style suffix to prompts")
    parser.add_argument("--no-pixel-art", dest="pixel_art", action="store_false")

    # GIF mode
    parser.add_argument("--mode", choices=["image", "gif", "both"], default="image",
                       help="Output mode: image only, gif only, or both")
    parser.add_argument("--gif-direction", default="right",
                       choices=["left", "right", "up", "down",
                               "top_left", "bottom_left", "top_right", "bottom_right"])
    parser.add_argument("--gif-duration", type=int, default=5000, help="GIF total duration (ms)")
    parser.add_argument("--gif-frames", type=int, default=40, help="Number of GIF frames")
    parser.add_argument("--gif-size", type=int, default=128, help="GIF target size")

    args = parser.parse_args()

    # Validate input
    if not args.prompt and not args.prompts_file:
        parser.error("Specify --prompt or --prompts-file")

    # Build prompt list
    prompts = []
    if args.prompts_file:
        with open(args.prompts_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    prompts.append(line)
        print(f"Batch mode: {len(prompts)} prompts from {args.prompts_file}")
    else:
        prompts = [args.prompt]

    # Initialize model
    print("=== Pirates Chronicles - Tiled Asset Generator ===")
    print(f"Tiling mode: {args.tiling} | Steps: {args.steps} | CFG: {args.cfg}")
    print(f"Output: {args.output}")
    print()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")
    if device == "cuda":
        vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        print(f"GPU: {torch.cuda.get_device_name(0)} ({vram:.1f} GB)")

    print("Loading model...")
    from model import SDLatentTiling
    model = SDLatentTiling(scheduler=args.scheduler)
    print("Model loaded.")
    print()

    # Generate
    success = 0
    failed = 0

    for i, prompt in enumerate(prompts):
        print(f"[{i+1}/{len(prompts)}] \"{prompt}\"")
        try:
            start_time = time.time()
            image, seed, metadata = generate_single(model, prompt, args, device)
            elapsed = time.time() - start_time
            print(f"  Generated in {elapsed:.1f}s (seed: {seed})")

            if args.mode in ("image", "both"):
                save_output(image, metadata, args.output, prompt)

            if args.mode in ("gif", "both"):
                generate_gif(image, args.output, prompt, args)

            success += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

        print()

    print(f"=== Done: {success}/{len(prompts)} success, {failed} failed ===")


if __name__ == "__main__":
    main()
