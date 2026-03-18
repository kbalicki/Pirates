#!/usr/bin/env python3
"""Generate 28 pixel-art assets for '16 bit Pirates!' via ComfyUI API.
Model: pixel-art-diffusion-v1.safetensors | GPU: GTX 1060 6GB — sequential."""

import json, urllib.request, urllib.error, time, uuid, os, sys
import numpy as np
from PIL import Image
from io import BytesIO

COMFYUI = "http://127.0.0.1:8188"
BASE_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "assets", "tilesets", "set_002_16bit_pirates"))
CKPT = "pixel-art-diffusion-v1.safetensors"

BASE_PROMPT = (
    "pixel art sprite, top-down 60 degree angle, 2.5D perspective, "
    "visible roof and front wall, pseudo-3D overhead view, "
    "Civilization 1 DOS game sprite, SimCity SNES sprite, "
    "clean pixel art, sharp edges, no anti-aliasing, "
    "white background #FFFFFF, single isolated sprite, "
    "no ground no terrain no shadows outside sprite no text no UI"
)

NEGATIVE = (
    "photorealistic, 3D render, blurry, anti-aliasing, smooth gradients, "
    "watermark, background, ground, terrain, grass, water, text, UI, "
    "modern graphics, cartoon, anime, noisy, border, frame, "
    "colored background, gray background, dark background, "
    "realistic, painting, sketch, high resolution photography"
)

# (filename, subfolder, target_w, target_h, prompt_suffix, bg_tolerance)
ASSETS = [
    # --- Decorations 32x32 ---
    ("deco_palm_single.png", "decorations", 32, 32, 25,
     "single tropical palm tree, pixel art sprite, top-down 60 degree view, green fronds visible from above, brown trunk visible from side, white background"),
    ("deco_palm_cluster.png", "decorations", 32, 32, 25,
     "cluster of three tropical palm trees, pixel art sprite, top-down 60 degree view, overlapping green canopies, brown trunks, white background"),
    ("deco_hill_small.png", "decorations", 32, 32, 25,
     "small rocky hill, pixel art sprite, top-down 60 degree view, front slope visible, gray brown rocky surface, white background"),
    ("deco_hill_large.png", "decorations", 32, 32, 25,
     "large rocky hill, pixel art sprite, top-down 60 degree view, prominent front slope, gray rocky surface dramatic silhouette, white background"),
    ("deco_jungle_patch.png", "decorations", 32, 32, 25,
     "dense jungle foliage, pixel art sprite, top-down 60 degree view, overlapping tropical leaves, deep green canopy, white background"),
    ("deco_rocks_land.png", "decorations", 32, 32, 25,
     "scattered rocks and boulders, pixel art sprite, top-down 60 degree view, side face visible showing depth, gray brown stones, white background"),

    # --- Cities ---
    ("city_metropolis.png", "cities", 96, 96, 25,
     "large colonial capital city, pixel art sprite, top-down 60 degree view, multiple buildings rooftops and front walls, grand cathedral tower, stone walls, harbor with docks, dense colonial spanish architecture, Civilization 1 city sprite, white background"),
    ("city_large.png", "cities", 72, 72, 25,
     "large colonial port town, pixel art sprite, top-down 60 degree view, several buildings with rooftops, church prominent, wooden docks, colonial architecture, white background"),
    ("city_medium.png", "cities", 56, 56, 25,
     "medium colonial town, pixel art sprite, top-down 60 degree view, few buildings with rooftops, small dock, modest colonial houses, white background"),
    ("city_small.png", "cities", 40, 40, 25,
     "small colonial village, pixel art sprite, top-down 60 degree view, two small buildings with rooftops, tiny wooden pier, humble caribbean settlement, white background"),
    ("city_outpost.png", "cities", 32, 32, 25,
     "tiny frontier outpost, pixel art sprite, top-down 60 degree view, single building with watchtower, wooden palisade fence, white background"),
    ("city_fort_large.png", "cities", 72, 72, 25,
     "large colonial fortress, pixel art sprite, top-down 60 degree view, thick stone walls with bastions, corner towers with cannons, inner courtyard visible, white background"),
    ("city_fort_small.png", "cities", 48, 48, 25,
     "small colonial fort blockhouse, pixel art sprite, top-down 60 degree view, small stone walls, single cannon tower, white background"),

    # --- Flags 24x24 ---
    ("flag_spain_frame1.png", "flags", 24, 24, 25,
     "pixel art flag sprite, spanish flag red yellow red vertical stripes, flag pole on left side, flag straight horizontal, frame 1 of 3, white background, sharp pixels, no anti-aliasing"),
    ("flag_spain_frame2.png", "flags", 24, 24, 25,
     "pixel art flag sprite, spanish flag red yellow red vertical stripes, flag pole on left, flag gently curved mid-wave, frame 2 of 3, white background, sharp pixels"),
    ("flag_spain_frame3.png", "flags", 24, 24, 25,
     "pixel art flag sprite, spanish flag red yellow red vertical stripes, flag pole on left, flag fully waving curved in wind, frame 3 of 3, white background, sharp pixels"),
    ("flag_england_frame1.png", "flags", 24, 24, 15,
     "pixel art flag sprite, english flag red cross on white, flag pole on left, flag straight horizontal, frame 1 of 3, white background, sharp pixels"),
    ("flag_england_frame2.png", "flags", 24, 24, 15,
     "pixel art flag sprite, english flag red cross on white, flag pole on left, flag gently curved, frame 2 of 3, white background, sharp pixels"),
    ("flag_england_frame3.png", "flags", 24, 24, 15,
     "pixel art flag sprite, english flag red cross on white, flag pole on left, flag fully waving, frame 3 of 3, white background, sharp pixels"),
    ("flag_france_frame1.png", "flags", 24, 24, 25,
     "pixel art flag sprite, french tricolor blue white red vertical, flag pole on left, flag straight horizontal, frame 1 of 3, white background, sharp pixels"),
    ("flag_france_frame2.png", "flags", 24, 24, 25,
     "pixel art flag sprite, french tricolor blue white red, flag pole on left, flag gently curved, frame 2 of 3, white background, sharp pixels"),
    ("flag_france_frame3.png", "flags", 24, 24, 25,
     "pixel art flag sprite, french tricolor blue white red, flag pole on left, flag fully waving, frame 3 of 3, white background, sharp pixels"),
    ("flag_netherlands_frame1.png", "flags", 24, 24, 25,
     "pixel art flag sprite, dutch flag orange white blue horizontal stripes, flag pole on left, flag straight horizontal, frame 1 of 3, white background, sharp pixels"),
    ("flag_netherlands_frame2.png", "flags", 24, 24, 25,
     "pixel art flag sprite, dutch flag orange white blue stripes, flag pole on left, flag gently curved, frame 2 of 3, white background, sharp pixels"),
    ("flag_netherlands_frame3.png", "flags", 24, 24, 25,
     "pixel art flag sprite, dutch flag orange white blue stripes, flag pole on left, flag fully waving, frame 3 of 3, white background, sharp pixels"),
    ("flag_pirates_frame1.png", "flags", 24, 24, 25,
     "pixel art flag sprite, jolly roger black flag white skull crossbones, flag pole on left, flag straight horizontal, frame 1 of 3, white background, sharp pixels"),
    ("flag_pirates_frame2.png", "flags", 24, 24, 25,
     "pixel art flag sprite, jolly roger black flag white skull crossbones, flag pole on left, flag gently curved, frame 2 of 3, white background, sharp pixels"),
    ("flag_pirates_frame3.png", "flags", 24, 24, 25,
     "pixel art flag sprite, jolly roger black flag white skull crossbones, flag pole on left, flag fully waving, frame 3 of 3, white background, sharp pixels"),
]


def remove_white_bg(img, tolerance=25):
    data = np.array(img.convert("RGBA"))
    r, g, b = data[:,:,0], data[:,:,1], data[:,:,2]
    white = (r > 255 - tolerance) & (g > 255 - tolerance) & (b > 255 - tolerance)
    data[:,:,3] = np.where(white, 0, data[:,:,3])
    return Image.fromarray(data)


def build_workflow(prompt, negative, seed):
    return {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": 30, "cfg": 7.5,
            "sampler_name": "dpmpp_2m", "scheduler": "karras",
            "denoise": 1.0, "model": ["4", 0], "positive": ["6", 0],
            "negative": ["7", 0], "latent_image": ["5", 0]}},
        "4": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": CKPT}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode",
              "inputs": {"text": negative, "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode",
              "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "p16b", "images": ["8", 0]}},
    }


def queue_prompt(wf):
    cid = str(uuid.uuid4())
    data = json.dumps({"prompt": wf, "client_id": cid}).encode()
    req = urllib.request.Request(f"{COMFYUI}/prompt", data=data,
                                headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["prompt_id"]


def wait(pid, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = urllib.request.urlopen(f"{COMFYUI}/history/{pid}")
            h = json.loads(r.read())
            if pid in h:
                return h[pid]
        except urllib.error.URLError:
            pass
        time.sleep(2)
    raise TimeoutError(f"{pid} timeout {timeout}s")


def fetch_img(fname, subfolder):
    url = (f"{COMFYUI}/view?filename={urllib.request.quote(fname)}"
           f"&subfolder={urllib.request.quote(subfolder)}&type=output")
    return urllib.request.urlopen(url).read()


def generate(filename, subfolder, tw, th, tolerance, suffix, idx, attempt=0):
    full = f"{suffix}, {BASE_PROMPT}"
    seed = 60000 + idx * 191 + attempt * 7919

    wf = build_workflow(full, NEGATIVE, seed)
    pid = queue_prompt(wf)
    result = wait(pid)

    for out in result.get("outputs", {}).values():
        if "images" not in out:
            continue
        for info in out["images"]:
            raw = fetch_img(info["filename"], info.get("subfolder", ""))
            img = Image.open(BytesIO(raw)).convert("RGBA")
            img = remove_white_bg(img, tolerance)
            img = img.resize((tw, th), Image.NEAREST)
            path = os.path.join(BASE_DIR, subfolder, filename)
            img.save(path, "PNG")
            return True
    return False


def main():
    print(f"=== 16 bit Pirates! v3 ===")
    print(f"Model: {CKPT} | Output: {BASE_DIR}")
    print(f"Total: {len(ASSETS)} assets\n")

    ok = 0
    retries = 0
    for i, (fn, sub, tw, th, tol, prompt) in enumerate(ASSETS):
        label = f"[{i+1:2d}/28] {fn}"
        for attempt in range(3):
            try:
                tag = "" if attempt == 0 else f" (retry {attempt})"
                print(f"  {label}{tag} ...", end=" ", flush=True)
                if generate(fn, sub, tw, th, tol, prompt, i, attempt):
                    print(f"OK {tw}x{th}")
                    ok += 1
                    if attempt > 0:
                        retries += 1
                    break
                else:
                    print("no output")
            except Exception as e:
                print(f"ERR: {e}")
        else:
            print(f"  !! {fn} FAILED after 3 attempts")

    print(f"\n=== Done: {ok}/28 | Retries: {retries} ===")
    return ok == 28


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
