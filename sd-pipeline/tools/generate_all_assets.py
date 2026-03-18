"""
Master asset generation script for Pirates Chronicles.
Generates all game assets via ComfyUI REST API and post-processes them.

Assets generated:
  - Water seamless tile (256x256)
  - 4 cloud sprites (with alpha, max 200px)
  - Beach/sand seamless tile (32x32)
  - 4 palm tree sprites (64x64 with alpha)
  - 3 city building sprites (64x64 with alpha)
  - 5 ship sprites (top-down, 8-direction spritesheets 384x128)
  - Seagull: kept procedural (too small for AI)

Usage:
    python generate_all_assets.py [--comfy-url http://127.0.0.1:8188]
"""

import argparse
import json
import copy
import os
import sys
import time
import uuid
import urllib.request
import urllib.error
from io import BytesIO

try:
    from PIL import Image, ImageFilter
    import numpy as np
except ImportError:
    print("ERROR: pip install Pillow numpy")
    sys.exit(1)

COMFY_URL = "http://127.0.0.1:8188"
POLL_INTERVAL = 2.0
POLL_TIMEOUT = 300.0

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PUBLIC_ASSETS = os.path.join(PROJECT_ROOT, "public", "assets")
RAW_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets_raw"))

# ───────────── ComfyUI API helpers ─────────────

def comfy_post_prompt(workflow: dict) -> str:
    """Submit workflow to ComfyUI, return prompt_id."""
    payload = json.dumps({
        "prompt": workflow,
        "client_id": str(uuid.uuid4()),
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return data["prompt_id"]


def comfy_poll_result(prompt_id: str) -> dict:
    """Poll /history until generation completes. Returns output info."""
    start = time.time()
    while time.time() - start < POLL_TIMEOUT:
        try:
            with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}") as resp:
                history = json.loads(resp.read())
            if prompt_id in history:
                outputs = history[prompt_id].get("outputs", {})
                if outputs:
                    return outputs
        except urllib.error.URLError:
            pass
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"ComfyUI generation timed out after {POLL_TIMEOUT}s")


def comfy_download_image(filename: str, subfolder: str = "", folder_type: str = "output") -> Image.Image:
    """Download a generated image from ComfyUI."""
    params = f"filename={filename}&subfolder={subfolder}&type={folder_type}"
    with urllib.request.urlopen(f"{COMFY_URL}/view?{params}") as resp:
        return Image.open(BytesIO(resp.read())).copy()


def generate_image(workflow_template: dict, prompt_text: str, seed: int,
                   width: int = 512, height: int = 512) -> Image.Image:
    """Generate a single image via ComfyUI. Returns PIL Image."""
    wf = copy.deepcopy(workflow_template)

    # Replace {prompt} placeholder in CLIPTextEncode nodes
    for node_id, node in wf.items():
        if node.get("class_type") == "CLIPTextEncode":
            txt = node["inputs"].get("text", "")
            if "{prompt}" in txt:
                node["inputs"]["text"] = txt.replace("{prompt}", prompt_text)

    # Set seed in KSampler
    for node_id, node in wf.items():
        if node.get("class_type") == "KSampler":
            node["inputs"]["seed"] = seed

    # Set dimensions in EmptyLatentImage
    for node_id, node in wf.items():
        if node.get("class_type") == "EmptyLatentImage":
            node["inputs"]["width"] = width
            node["inputs"]["height"] = height

    prompt_id = comfy_post_prompt(wf)
    print(f"    Submitted (prompt_id={prompt_id[:8]}...), waiting...")
    outputs = comfy_poll_result(prompt_id)

    # Find the SaveImage output
    for node_id, node_out in outputs.items():
        images = node_out.get("images", [])
        if images:
            img_info = images[0]
            return comfy_download_image(
                img_info["filename"],
                img_info.get("subfolder", ""),
                img_info.get("type", "output"),
            )

    raise RuntimeError("No image in ComfyUI output")


# ───────────── Post-processing helpers ─────────────

def remove_background(img: Image.Image, bg_color_range=None) -> Image.Image:
    """Remove background via chroma-key. Default: remove dark/blue backgrounds."""
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]

    # Compute HSV-like hue
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    hue = np.zeros_like(r)
    mask_d = delta > 5
    mask_r = (max_c == r) & mask_d
    mask_g = (max_c == g) & mask_d
    mask_b = (max_c == b) & mask_d
    hue[mask_r] = 60 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    saturation = np.zeros_like(r)
    sat_mask = max_c > 0
    saturation[sat_mask] = (delta[sat_mask] / max_c[sat_mask]) * 100

    value = max_c / 255.0 * 100

    # Remove blue sky (hue 170-250, sat > 25) and very dark pixels (value < 15)
    blue_mask = (hue >= 170) & (hue <= 250) & (saturation >= 25)
    dark_mask = (value < 15) & (saturation < 30)

    alpha_out = np.where(blue_mask | dark_mask, 0, 255).astype(np.uint8)
    data[:,:,3] = alpha_out

    return Image.fromarray(data.astype(np.uint8))


def remove_dark_bg(img: Image.Image, threshold: int = 40) -> Image.Image:
    """Remove dark background (for ship sprites on dark ocean)."""
    rgba = img.convert("RGBA")
    data = np.array(rgba)
    r, g, b = data[:,:,0].astype(int), data[:,:,1].astype(int), data[:,:,2].astype(int)
    brightness = (r + g + b) / 3
    # Dark pixels become transparent
    data[:,:,3] = np.where(brightness < threshold, 0, 255).astype(np.uint8)
    return Image.fromarray(data)


def remove_blue_bg(img: Image.Image) -> Image.Image:
    """Remove blue sky background specifically for cloud sprites."""
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    r, g, b = data[:,:,0], data[:,:,1], data[:,:,2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    hue = np.zeros_like(r)
    mask_d = delta > 3
    mask_r = (max_c == r) & mask_d
    mask_g = (max_c == g) & mask_d
    mask_b = (max_c == b) & mask_d
    hue[mask_r] = 60 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    saturation = np.zeros_like(r)
    sat_mask = max_c > 0
    saturation[sat_mask] = (delta[sat_mask] / max_c[sat_mask]) * 100

    blue_mask = (hue >= 170) & (hue <= 250) & (saturation >= 30)
    data[:,:,3] = np.where(blue_mask, 0, 255).astype(np.uint8)

    return Image.fromarray(data.astype(np.uint8))


def crop_to_content(img: Image.Image, padding: int = 2) -> Image.Image:
    """Crop to bounding box of non-transparent pixels with optional padding."""
    bbox = img.getbbox()
    if bbox is None:
        return img
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - padding)
    y0 = max(0, y0 - padding)
    x1 = min(img.width, x1 + padding)
    y1 = min(img.height, y1 + padding)
    return img.crop((x0, y0, x1, y1))


def resize_max(img: Image.Image, max_size: int) -> Image.Image:
    """Resize so largest dimension = max_size, preserving aspect ratio."""
    w, h = img.size
    if w <= max_size and h <= max_size:
        return img
    scale = max_size / max(w, h)
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.NEAREST)


def resize_exact(img: Image.Image, width: int, height: int) -> Image.Image:
    """Resize to exact dimensions."""
    return img.resize((width, height), Image.NEAREST)


def make_ship_spritesheet(base_img: Image.Image, frame_w: int = 96, frame_h: int = 64) -> Image.Image:
    """
    Take a single top-down ship image and create an 8-direction spritesheet.
    Layout: 4 columns × 2 rows (8 frames), each 96×64.
    Directions: S, SW, W, NW, N, NE, E, SE (matching existing sailship.png convention).
    """
    # Crop and resize base ship to fit in frame
    base = crop_to_content(base_img)
    max_dim = min(frame_w - 8, frame_h - 8)
    base = resize_max(base, max_dim)

    # Rotation angles for 8 directions (S=0°, SW=45°, W=90°, etc.)
    angles = [0, 45, 90, 135, 180, 225, 270, 315]

    sheet_w = frame_w * 4
    sheet_h = frame_h * 2
    sheet = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    for i, angle in enumerate(angles):
        col = i % 4
        row = i // 4
        rotated = base.rotate(-angle, expand=True, resample=Image.NEAREST, fillcolor=(0, 0, 0, 0))
        rotated = resize_max(rotated, max_dim)

        # Center in frame
        fx = col * frame_w + (frame_w - rotated.width) // 2
        fy = row * frame_h + (frame_h - rotated.height) // 2
        sheet.paste(rotated, (fx, fy), rotated)

    return sheet


# ───────────── Workflow loaders ─────────────

def load_workflow(name: str) -> dict:
    """Load a ComfyUI workflow JSON."""
    path = os.path.join(os.path.dirname(__file__), "..", "workflows", name)
    with open(path, "r") as f:
        return json.load(f)


# ───────────── Asset generation functions ─────────────

def gen_water_tile():
    """Generate seamless water tile 256x256."""
    print("\n=== WATER TILE ===")
    wf = load_workflow("map_bg.json")
    img = generate_image(wf, "deep caribbean ocean water, dark blue gentle waves, subtle foam", seed=3001)
    img = resize_exact(img, 256, 256)
    out = os.path.join(PUBLIC_ASSETS, "tiles", "water_tile.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_clouds():
    """Generate 4 cloud sprites with alpha."""
    print("\n=== CLOUD SPRITES ===")
    wf = load_workflow("map_bg.json")
    prompts = [
        ("white fluffy cumulus cloud, blue sky background", 1001),
        ("small thin wispy cloud, blue sky", 1002),
        ("large billowing cloud formation, blue sky", 1003),
        ("tiny scattered cloudlets, blue sky background", 1004),
    ]
    out_dir = os.path.join(PUBLIC_ASSETS, "sprites", "clouds")
    os.makedirs(out_dir, exist_ok=True)

    for i, (prompt, seed) in enumerate(prompts, 1):
        print(f"  Cloud {i}/4: {prompt[:40]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_blue_bg(img)
        img = crop_to_content(img)
        img = resize_max(img, 200)
        out = os.path.join(out_dir, f"cloud_{i}.png")
        img.save(out, "PNG")
        print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_beach_tile():
    """Generate seamless sand/beach tile 32x32."""
    print("\n=== BEACH TILE ===")
    wf = load_workflow("tile_32x32.json")
    img = generate_image(wf, "sandy tropical beach, warm golden sand, grains", seed=2001)
    # tile_32x32 workflow already scales to 32x32
    out = os.path.join(PUBLIC_ASSETS, "tiles", "beach_tile.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_palm_sprites():
    """Generate 4 palm tree sprite variants 64x64."""
    print("\n=== PALM SPRITES ===")
    wf = load_workflow("icon_64x64.json")
    prompts = [
        ("single tall palm tree, tropical, green leaves", 4001),
        ("coconut palm tree, curved trunk, lush", 4002),
        ("two palm trees together, tropical beach", 4003),
        ("small young palm tree, tropical", 4004),
    ]
    out_dir = os.path.join(PUBLIC_ASSETS, "sprites", "palms")
    os.makedirs(out_dir, exist_ok=True)

    for i, (prompt, seed) in enumerate(prompts, 1):
        print(f"  Palm {i}/4: {prompt[:40]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_background(img)
        img = crop_to_content(img)
        img = resize_exact(img, 64, 64)
        out = os.path.join(out_dir, f"palm_{i}.png")
        img.save(out, "PNG")
        print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_city_sprites():
    """Generate city building sprites: small, medium, large (64x64 each)."""
    print("\n=== CITY SPRITES ===")
    wf = load_workflow("icon_64x64.json")
    prompts = [
        ("small fishing village huts, wooden pier, thatched roofs", 5001, "city_small"),
        ("colonial town buildings, church steeple, stone walls", 5002, "city_medium"),
        ("large fortified colonial city, cathedral, walls, towers, harbor", 5003, "city_large"),
    ]
    out_dir = os.path.join(PUBLIC_ASSETS, "sprites", "cities")
    os.makedirs(out_dir, exist_ok=True)

    for prompt, seed, name in prompts:
        print(f"  City '{name}': {prompt[:40]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_background(img)
        img = crop_to_content(img)
        img = resize_exact(img, 64, 64)
        out = os.path.join(out_dir, f"{name}.png")
        img.save(out, "PNG")
        print(f"  -> {out}")


def gen_ship_sprites():
    """Generate ship sprites and assemble into 8-direction spritesheets."""
    print("\n=== SHIP SPRITES ===")
    wf = load_workflow("ship_sprite.json")

    # Override prompt template for top-down view
    for node_id, node in wf.items():
        if node.get("class_type") == "CLIPTextEncode":
            txt = node["inputs"].get("text", "")
            if "{prompt}" in txt:
                node["inputs"]["text"] = "pixel art {prompt}, 16-bit style, top-down bird eye view, pirate ship sprite, wooden hull, sails, clean edges, game sprite, dark ocean background"

    ships = [
        ("small fast sloop, single mast, one sail, light wood", 6001, "ship_sloop"),
        ("brigantine pirate ship, two masts, black sails, cannons", 6002, "ship_brigantine"),
        ("large war frigate, three masts, many cannons, royal navy", 6003, "ship_frigate"),
        ("heavy spanish galleon, four masts, ornate golden stern, treasure ship", 6004, "ship_galleon"),
        ("merchant trading ship, two masts, cargo, barrels on deck", 6005, "ship_merchant"),
    ]
    out_dir = os.path.join(PUBLIC_ASSETS, "sprites", "ships")
    os.makedirs(out_dir, exist_ok=True)

    for prompt, seed, name in ships:
        print(f"  Ship '{name}': {prompt[:50]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_dark_bg(img, threshold=45)
        sheet = make_ship_spritesheet(img, 96, 64)
        out = os.path.join(out_dir, f"{name}.png")
        sheet.save(out, "PNG")
        print(f"  -> {out} ({sheet.size[0]}x{sheet.size[1]})")

    # Also save the sloop as the main sailship replacement
    print("  Copying ship_sloop as default sailship...")
    sloop_path = os.path.join(out_dir, "ship_sloop.png")
    if os.path.exists(sloop_path):
        import shutil
        dest = os.path.join(PUBLIC_ASSETS, "sprites", "sailship_generated.png")
        shutil.copy2(sloop_path, dest)
        print(f"  -> {dest}")


def gen_seagull_sprites():
    """Generate small seagull sprite (2 animation frames: wings up/down)."""
    print("\n=== SEAGULL SPRITES ===")
    wf = load_workflow("icon_64x64.json")

    # Override to smaller output for tiny bird sprites
    for node_id, node in wf.items():
        if node.get("class_type") == "ImageScale":
            node["inputs"]["width"] = 32
            node["inputs"]["height"] = 32

    prompts = [
        ("white seagull bird flying, wings up V-shape, top-down view, blue sky", 7001, "seagull_up"),
        ("white seagull bird flying, wings down, top-down view, blue sky", 7002, "seagull_down"),
    ]
    out_dir = os.path.join(PUBLIC_ASSETS, "sprites", "seagulls")
    os.makedirs(out_dir, exist_ok=True)

    for prompt, seed, name in prompts:
        print(f"  Seagull '{name}': {prompt[:40]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_blue_bg(img)
        img = crop_to_content(img)
        img = resize_max(img, 24)
        out = os.path.join(out_dir, f"{name}.png")
        img.save(out, "PNG")
        print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


# ───────────── Main ─────────────

def main():
    global COMFY_URL
    parser = argparse.ArgumentParser(description="Generate all Pirates Chronicles assets")
    parser.add_argument("--comfy-url", default="http://127.0.0.1:8188", help="ComfyUI API URL")
    parser.add_argument("--skip", nargs="*", default=[],
                        help="Skip asset types: water clouds beach palms cities ships seagulls")
    args = parser.parse_args()
    COMFY_URL = args.comfy_url

    # Verify ComfyUI is reachable
    print(f"Checking ComfyUI at {COMFY_URL}...")
    try:
        with urllib.request.urlopen(f"{COMFY_URL}/system_stats", timeout=5) as resp:
            stats = json.loads(resp.read())
        gpu = stats["devices"][0]["name"] if stats.get("devices") else "unknown"
        print(f"  Connected! GPU: {gpu}")
    except Exception as e:
        print(f"  ERROR: Cannot reach ComfyUI: {e}")
        sys.exit(1)

    skip = set(args.skip)
    generators = [
        ("water", gen_water_tile),
        ("clouds", gen_clouds),
        ("beach", gen_beach_tile),
        ("palms", gen_palm_sprites),
        ("cities", gen_city_sprites),
        ("ships", gen_ship_sprites),
        ("seagulls", gen_seagull_sprites),
    ]

    total_start = time.time()
    for name, func in generators:
        if name in skip:
            print(f"\n=== SKIPPING {name.upper()} ===")
            continue
        start = time.time()
        try:
            func()
            elapsed = time.time() - start
            print(f"  Completed in {elapsed:.1f}s")
        except Exception as e:
            print(f"  ERROR generating {name}: {e}")
            import traceback
            traceback.print_exc()

    total = time.time() - total_start
    print(f"\n{'='*50}")
    print(f"All assets generated in {total:.1f}s ({total/60:.1f} min)")
    print(f"Assets saved to: {PUBLIC_ASSETS}")


if __name__ == "__main__":
    main()
