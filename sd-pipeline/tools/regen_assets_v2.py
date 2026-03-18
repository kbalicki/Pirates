"""
Regenerate game assets v2 — improved post-processing with soft alpha edges.

Generates: clouds, grass tile, beach tile, palms, cities.
Ships are unchanged. Seagulls are procedural (no generation needed).

Key improvement: Gaussian blur on alpha channel gives soft organic edges
instead of hard binary cutoffs.

Usage:
    python regen_assets_v2.py [--comfy-url http://127.0.0.1:8188] [--skip clouds grass beach palms cities]
"""

import argparse
import copy
import json
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

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
OUT_BASE = os.path.join(PROJECT_ROOT, "public", "assets", "packs", "generated")


# ───────────── ComfyUI API helpers ─────────────

def comfy_post(workflow: dict) -> str:
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
        return json.loads(resp.read())["prompt_id"]


def comfy_poll(prompt_id: str) -> dict:
    start = time.time()
    while time.time() - start < POLL_TIMEOUT:
        try:
            with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}") as resp:
                history = json.loads(resp.read())
            if prompt_id in history and history[prompt_id].get("outputs"):
                return history[prompt_id]["outputs"]
        except urllib.error.URLError:
            pass
        time.sleep(POLL_INTERVAL)
    raise TimeoutError(f"ComfyUI timed out after {POLL_TIMEOUT}s")


def comfy_download(filename: str, subfolder: str = "", folder_type: str = "output") -> Image.Image:
    params = f"filename={filename}&subfolder={subfolder}&type={folder_type}"
    with urllib.request.urlopen(f"{COMFY_URL}/view?{params}") as resp:
        return Image.open(BytesIO(resp.read())).copy()


def load_workflow(name: str) -> dict:
    path = os.path.join(SCRIPT_DIR, "..", "workflows", name)
    with open(path, "r") as f:
        return json.load(f)


def generate_image(workflow: dict, prompt_text: str, seed: int,
                   width: int = 512, height: int = 512) -> Image.Image:
    wf = copy.deepcopy(workflow)

    for node in wf.values():
        if node.get("class_type") == "CLIPTextEncode":
            txt = node["inputs"].get("text", "")
            if "{prompt}" in txt:
                node["inputs"]["text"] = txt.replace("{prompt}", prompt_text)
        if node.get("class_type") == "KSampler":
            node["inputs"]["seed"] = seed
        if node.get("class_type") == "EmptyLatentImage":
            node["inputs"]["width"] = width
            node["inputs"]["height"] = height

    pid = comfy_post(wf)
    print(f"    Submitted (prompt_id={pid[:8]}...), waiting...")
    outputs = comfy_poll(pid)

    for node_out in outputs.values():
        images = node_out.get("images", [])
        if images:
            info = images[0]
            return comfy_download(info["filename"], info.get("subfolder", ""), info.get("type", "output"))

    raise RuntimeError("No image in ComfyUI output")


# ───────────── Post-processing with soft alpha ─────────────

def chroma_key_blue(img: Image.Image) -> Image.Image:
    """Remove blue/cyan background via chroma-key, returning binary alpha."""
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    hue = np.zeros_like(r)
    md = delta > 3
    mr = (max_c == r) & md
    mg = (max_c == g) & md
    mb = (max_c == b) & md
    hue[mr] = 60 * (((g[mr] - b[mr]) / delta[mr]) % 6)
    hue[mg] = 60 * (((b[mg] - r[mg]) / delta[mg]) + 2)
    hue[mb] = 60 * (((r[mb] - g[mb]) / delta[mb]) + 4)

    sat = np.zeros_like(r)
    sm = max_c > 0
    sat[sm] = (delta[sm] / max_c[sm]) * 100

    # Blue/cyan: hue 160-260, saturation > 20
    blue_mask = (hue >= 160) & (hue <= 260) & (sat >= 20)
    data[:, :, 3] = np.where(blue_mask, 0, 255).astype(np.uint8)

    return Image.fromarray(data.astype(np.uint8))


def remove_background_general(img: Image.Image) -> Image.Image:
    """Remove blue sky + very dark backgrounds."""
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    hue = np.zeros_like(r)
    md = delta > 5
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

    blue_mask = (hue >= 170) & (hue <= 250) & (sat >= 25)
    dark_mask = (val < 15) & (sat < 30)

    data[:, :, 3] = np.where(blue_mask | dark_mask, 0, 255).astype(np.uint8)
    return Image.fromarray(data.astype(np.uint8))


def soft_alpha(img: Image.Image, blur_radius: int = 10) -> Image.Image:
    """Apply Gaussian blur to alpha channel for soft edges."""
    rgba = img.convert("RGBA")
    r, g, b, a = rgba.split()
    a_blurred = a.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    return Image.merge("RGBA", (r, g, b, a_blurred))


def crop_to_content(img: Image.Image, padding: int = 2) -> Image.Image:
    bbox = img.getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - padding)
    y0 = max(0, y0 - padding)
    x1 = min(img.width, x1 + padding)
    y1 = min(img.height, y1 + padding)
    return img.crop((x0, y0, x1, y1))


def resize_max(img: Image.Image, max_size: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= max_size:
        return img
    scale = max_size / max(w, h)
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)


def resize_exact(img: Image.Image, width: int, height: int) -> Image.Image:
    return img.resize((width, height), Image.LANCZOS)


# ───────────── Asset generators ─────────────

def gen_clouds():
    """4 cloud sprites with soft alpha edges."""
    print("\n=== CLOUD SPRITES (soft alpha) ===")
    wf = load_workflow("cloud_sprite.json")
    prompts = [
        ("white fluffy cumulus cloud, soft edges, bright white, blue sky background", 2001),
        ("small thin wispy cirrus cloud, delicate, white, blue sky", 2002),
        ("large billowing cumulonimbus cloud, dramatic, white and gray, blue sky", 2003),
        ("small scattered cotton-ball cloudlets, white puffs, blue sky", 2004),
    ]
    out_dir = os.path.join(OUT_BASE, "sprites", "clouds")
    os.makedirs(out_dir, exist_ok=True)

    for i, (prompt, seed) in enumerate(prompts, 1):
        print(f"  Cloud {i}/4: {prompt[:50]}...")
        img = generate_image(wf, prompt, seed=seed)
        # Step 1: chroma-key blue background
        img = chroma_key_blue(img)
        # Step 2: Gaussian blur on alpha for soft edges (radius 10px at 512px)
        img = soft_alpha(img, blur_radius=10)
        # Step 3: crop + resize
        img = crop_to_content(img)
        img = resize_max(img, 200)
        out = os.path.join(out_dir, f"cloud_{i}.png")
        img.save(out, "PNG")
        print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_grass_tile():
    """Seamless green grass/jungle tile 32x32."""
    print("\n=== GRASS TILE ===")
    wf = load_workflow("tile_32x32.json")
    img = generate_image(wf, "lush green tropical grass, jungle ground, dense vegetation", seed=8001)
    out = os.path.join(OUT_BASE, "tiles", "grass_tile.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_beach_tile():
    """Seamless beach/sand tile 32x32."""
    print("\n=== BEACH TILE ===")
    wf = load_workflow("tile_32x32.json")
    img = generate_image(wf, "warm golden sand, tropical beach, fine grains", seed=8002)
    out = os.path.join(OUT_BASE, "tiles", "beach_tile.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_palms():
    """4 palm tree variants with transparent background, soft alpha."""
    print("\n=== PALM SPRITES (soft alpha) ===")
    wf = load_workflow("icon_64x64.json")
    prompts = [
        ("single tall palm tree, tropical, green leaves, blue sky background", 4001),
        ("coconut palm tree, curved trunk, lush green, blue sky background", 4002),
        ("two palm trees together, tropical beach, blue sky background", 4003),
        ("small young palm tree, tropical island, blue sky background", 4004),
    ]
    out_dir = os.path.join(OUT_BASE, "sprites", "palms")
    os.makedirs(out_dir, exist_ok=True)

    for i, (prompt, seed) in enumerate(prompts, 1):
        print(f"  Palm {i}/4: {prompt[:50]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_background_general(img)
        img = soft_alpha(img, blur_radius=6)
        img = crop_to_content(img)
        img = resize_exact(img, 64, 64)
        out = os.path.join(out_dir, f"palm_{i}.png")
        img.save(out, "PNG")
        print(f"  -> {out} ({img.size[0]}x{img.size[1]})")


def gen_cities():
    """3 city sprites — groups of buildings, Caribbean colonial, 96x96."""
    print("\n=== CITY SPRITES (building groups, 96x96) ===")
    wf = load_workflow("icon_64x64.json")
    cities = [
        (
            "tiny caribbean fishing village, two thatched roof wooden huts, small wooden dock, "
            "one palm tree, isometric view, 17th century colonial, miniature, transparent background, "
            "game sprite, clean simple design",
            5021, "city_small",
        ),
        (
            "small caribbean colonial town, four buildings clustered together, stone church "
            "with bell tower, red tile roof houses, cobblestone plaza, market stall, "
            "isometric view, 17th century, game sprite, transparent background, "
            "clean detailed miniature, Sid Meier Pirates style",
            5022, "city_medium",
        ),
        (
            "large caribbean colonial port city, seven buildings, grand cathedral with tall spire, "
            "governor mansion, stone fortress wall, harbor warehouses, red and brown rooftops, "
            "multiple stories, isometric view, 17th century, game sprite, transparent background, "
            "detailed miniature city, Sid Meier Pirates style",
            5023, "city_large",
        ),
    ]
    out_dir = os.path.join(OUT_BASE, "sprites", "cities")
    os.makedirs(out_dir, exist_ok=True)

    for prompt, seed, name in cities:
        print(f"  City '{name}': {prompt[:60]}...")
        img = generate_image(wf, prompt, seed=seed)
        img = remove_background_general(img)
        img = soft_alpha(img, blur_radius=6)
        img = crop_to_content(img)
        img = resize_exact(img, 96, 96)
        out = os.path.join(out_dir, f"{name}.png")
        img.save(out, "PNG")
        print(f"  -> {out}")


# ───────────── Main ─────────────

def main():
    global COMFY_URL
    parser = argparse.ArgumentParser(description="Regenerate Pirates Chronicles assets v2 (soft alpha)")
    parser.add_argument("--comfy-url", default="http://127.0.0.1:8188", help="ComfyUI API URL")
    parser.add_argument("--skip", nargs="*", default=[],
                        help="Skip categories: clouds grass beach palms cities")
    args = parser.parse_args()
    COMFY_URL = args.comfy_url

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
        ("clouds", gen_clouds),
        ("grass", gen_grass_tile),
        ("beach", gen_beach_tile),
        ("palms", gen_palms),
        ("cities", gen_cities),
    ]

    total_start = time.time()
    for name, func in generators:
        if name in skip:
            print(f"\n=== SKIPPING {name.upper()} ===")
            continue
        start = time.time()
        try:
            func()
            print(f"  Completed in {time.time() - start:.1f}s")
        except Exception as e:
            print(f"  ERROR generating {name}: {e}")
            import traceback
            traceback.print_exc()

    total = time.time() - total_start
    print(f"\n{'=' * 50}")
    print(f"All assets regenerated in {total:.1f}s ({total / 60:.1f} min)")
    print(f"Output: {OUT_BASE}")


if __name__ == "__main__":
    main()
