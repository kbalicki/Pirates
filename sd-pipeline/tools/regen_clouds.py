"""Regenerate cloud sprites with dedicated cloud workflow and improved post-processing."""
import json
import os
import sys
import copy
import time
import uuid
import urllib.request
from io import BytesIO

from PIL import Image
import numpy as np

COMFY_URL = "http://127.0.0.1:8188"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
OUT_DIR = os.path.join(PROJECT_ROOT, "public", "assets", "packs", "generated", "sprites", "clouds")


def comfy_post(workflow):
    payload = json.dumps({"prompt": workflow, "client_id": str(uuid.uuid4())}).encode()
    req = urllib.request.Request(f"{COMFY_URL}/prompt", data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["prompt_id"]


def comfy_poll(prompt_id):
    for _ in range(150):
        try:
            with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}") as r:
                h = json.loads(r.read())
            if prompt_id in h and h[prompt_id].get("outputs"):
                return h[prompt_id]["outputs"]
        except Exception:
            pass
        time.sleep(2)
    raise TimeoutError("Timeout")


def comfy_download(filename, subfolder="", folder_type="output"):
    with urllib.request.urlopen(f"{COMFY_URL}/view?filename={filename}&subfolder={subfolder}&type={folder_type}") as r:
        return Image.open(BytesIO(r.read())).copy()


def generate(workflow, prompt, seed):
    wf = copy.deepcopy(workflow)
    for n in wf.values():
        if n.get("class_type") == "CLIPTextEncode" and "{prompt}" in n["inputs"].get("text", ""):
            n["inputs"]["text"] = n["inputs"]["text"].replace("{prompt}", prompt)
        if n.get("class_type") == "KSampler":
            n["inputs"]["seed"] = seed
    pid = comfy_post(wf)
    print(f"  Submitted {pid[:8]}..., waiting...")
    outs = comfy_poll(pid)
    for node_out in outs.values():
        for img_info in node_out.get("images", []):
            return comfy_download(img_info["filename"], img_info.get("subfolder", ""), img_info.get("type", "output"))
    raise RuntimeError("No output")


def remove_blue_bg_aggressive(img):
    """Aggressively remove blue sky background — keep only white/gray cloud pixels."""
    rgba = img.convert("RGBA")
    data = np.array(rgba, dtype=np.float32)
    r, g, b = data[:, :, 0], data[:, :, 1], data[:, :, 2]

    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c

    # Hue
    hue = np.zeros_like(r)
    md = delta > 3
    mr = (max_c == r) & md
    mg = (max_c == g) & md
    mb = (max_c == b) & md
    hue[mr] = 60 * (((g[mr] - b[mr]) / delta[mr]) % 6)
    hue[mg] = 60 * (((b[mg] - r[mg]) / delta[mg]) + 2)
    hue[mb] = 60 * (((r[mb] - g[mb]) / delta[mb]) + 4)

    # Saturation
    sat = np.zeros_like(r)
    sm = max_c > 0
    sat[sm] = (delta[sm] / max_c[sm]) * 100

    # Value (brightness)
    val = max_c / 255.0 * 100

    # Blue/cyan mask: hue 160-260, saturation > 20
    blue = (hue >= 160) & (hue <= 260) & (sat >= 20)
    # Also remove saturated non-white pixels
    saturated = sat >= 40
    # Keep only high-value, low-saturation pixels (white/light gray = cloud)
    is_cloud = (sat < 35) & (val > 60)

    # Alpha: cloud pixels are opaque, everything else transparent
    # Gradual alpha based on how "cloudy" the pixel is
    cloud_score = np.clip((100 - sat) / 100 * (val / 100), 0, 1)
    alpha = np.where(is_cloud, np.clip(cloud_score * 255, 50, 255), 0).astype(np.uint8)
    # Ensure blue pixels are fully transparent
    alpha = np.where(blue, 0, alpha)

    data[:, :, 3] = alpha
    return Image.fromarray(data.astype(np.uint8))


def crop_and_resize(img, max_size=200):
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    if max(w, h) > max_size:
        scale = max_size / max(w, h)
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    return img


def main():
    wf_path = os.path.join(SCRIPT_DIR, "..", "workflows", "cloud_sprite.json")
    with open(wf_path) as f:
        workflow = json.load(f)

    os.makedirs(OUT_DIR, exist_ok=True)

    clouds = [
        ("white fluffy cumulus cloud, soft edges, bright white", 2001),
        ("small thin wispy cirrus cloud, delicate, white", 2002),
        ("large billowing cumulonimbus cloud, dramatic, white and gray", 2003),
        ("small scattered cotton-ball cloudlets, white puffs", 2004),
    ]

    print(f"Regenerating {len(clouds)} cloud sprites...")
    for i, (prompt, seed) in enumerate(clouds, 1):
        print(f"\nCloud {i}/{len(clouds)}: {prompt[:50]}...")
        img = generate(workflow, prompt, seed)
        img = remove_blue_bg_aggressive(img)
        img = crop_and_resize(img, 200)
        out = os.path.join(OUT_DIR, f"cloud_{i}.png")
        img.save(out, "PNG")
        print(f"  -> {out} ({img.size[0]}x{img.size[1]})")

    print("\nDone! Cloud sprites regenerated.")


if __name__ == "__main__":
    main()
