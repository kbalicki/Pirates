#!/usr/bin/env python3
"""Generate 10 test variants of deco_palm_single via ComfyUI."""

import json, urllib.request, urllib.error, time, uuid, os, sys
from io import BytesIO
from PIL import Image

COMFYUI = "http://127.0.0.1:8188"
OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "assets", "tests"))

TESTS = [
    # (filename, model, cfg, steps, sampler, prompt, negative)
    ("test_01.png", "dreamshaper_8.safetensors", 7.5, 30, "dpmpp_2m", "karras",
     "pixel art palm tree, top-down view, Amiga 500 game sprite 1987, flat colors, 4 colors maximum, no shading, no anti-aliasing, white background, simple map icon",
     "3D, realistic, blurry, gradients, shading, anti-aliasing, modern, detailed, background"),

    ("test_02.png", "dreamshaper_8.safetensors", 10, 35, "dpmpp_2m", "karras",
     "retro pixel art sprite, palm tree overhead map view, Civilization 1 DOS map icon style, flat 2D top-down, limited palette, crisp pixels, white background, game asset 1990s strategy game",
     "3D, isometric, realistic, blurry, anti-aliasing, smooth, modern, painting"),

    ("test_03.png", "pixel-art-diffusion-v1.safetensors", 7.5, 30, "dpmpp_2m", "karras",
     "pixel art palm tree, top-down, white background",
     "3D, realistic, blurry, anti-aliasing, background"),

    ("test_04.png", "pixel-art-diffusion-v1.safetensors", 7.5, 30, "dpmpp_2m", "karras",
     "pixel art sprite, palm tree, flat top-down 90 degree view, Amiga 500 game style 1987, 4 flat colors, no shading, no anti-aliasing, white background, map decoration icon, Sid Meier Pirates overhead map",
     "3D, isometric, realistic, blurry, anti-aliasing, smooth gradients, modern, detailed, shadows"),

    ("test_05.png", "pixel-art-diffusion-v1.safetensors", 12, 40, "euler_ancestral", "normal",
     "pixel art sprite, palm tree, flat top-down 90 degree view, Amiga 500 game style 1987, 4 flat colors, no shading, no anti-aliasing, white background, map decoration icon",
     "3D, isometric, realistic, blurry, anti-aliasing, smooth gradients, modern, detailed, shadows"),

    # --- 5 extra variants ---

    ("test_06.png", "pixel-art-diffusion-v1.safetensors", 9, 30, "dpmpp_2m", "karras",
     "pixel art, single palm tree sprite, bird eye view from above, 16-bit SNES game tileset, green round canopy, brown trunk center, white background, game map decoration",
     "3D, realistic, blurry, anti-aliasing, gradients, modern, isometric, painting"),

    ("test_07.png", "dreamshaper_8.safetensors", 8, 30, "dpmpp_2m", "karras",
     "16-bit pixel art palm tree, top-down RPG map sprite, SNES Final Fantasy style, single tree centered, vibrant green leaves, visible trunk, white background, clean sprite sheet asset",
     "3D, realistic, blurry, anti-aliasing, photo, modern, shadows, terrain, ground"),

    ("test_08.png", "pixel-art-diffusion-v1.safetensors", 7.5, 30, "dpmpp_2m", "karras",
     "pixel art coconut palm tree, 2.5D perspective 60 degree angle, visible trunk and top of crown, green fronds, Age of Empires 1 style map object, white background",
     "3D, realistic, blurry, anti-aliasing, gradients, modern, cartoon, anime"),

    ("test_09.png", "dreamshaper_8.safetensors", 9, 35, "dpmpp_2m", "karras",
     "(pixel art:1.4), palm tree game sprite, flat top-down overhead view, (retro 1990s DOS game:1.2), limited color palette, hard pixel edges, no smoothing, white background, isolated object, no ground",
     "3D, realistic, blurry, anti-aliasing, smooth, gradients, modern, photo, background scenery, terrain"),

    ("test_10.png", "pixel-art-diffusion-v1.safetensors", 8.5, 35, "dpmpp_2m", "karras",
     "pixel art tropical palm tree, top-down 45 degree angle view, SimCity 2000 style sprite, green leafy top brown stem, caribbean island decoration, white background, single game asset",
     "3D, realistic, blurry, anti-aliasing, gradients, modern, painting, sketch, terrain, ground"),
]


def build_wf(model, cfg, steps, sampler, scheduler, prompt, negative, seed):
    return {
        "3": {"class_type": "KSampler", "inputs": {
            "seed": seed, "steps": steps, "cfg": cfg,
            "sampler_name": sampler, "scheduler": scheduler,
            "denoise": 1.0, "model": ["4", 0], "positive": ["6", 0],
            "negative": ["7", 0], "latent_image": ["5", 0]}},
        "4": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": model}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode",
              "inputs": {"text": prompt, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode",
              "inputs": {"text": negative, "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode",
              "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage",
              "inputs": {"filename_prefix": "palmtest", "images": ["8", 0]}},
    }


def queue(wf):
    data = json.dumps({"prompt": wf, "client_id": str(uuid.uuid4())}).encode()
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
    raise TimeoutError(f"timeout {timeout}s")


def fetch(fname, sub):
    url = (f"{COMFYUI}/view?filename={urllib.request.quote(fname)}"
           f"&subfolder={urllib.request.quote(sub)}&type=output")
    return urllib.request.urlopen(url).read()


def main():
    print(f"=== Palm Tree Test — 10 variants ===\n")
    seed = 77777

    for i, (fn, model, cfg, steps, sampler, scheduler, prompt, neg) in enumerate(TESTS):
        print(f"  [{i+1:2d}/10] {fn} | {model[:12]}.. | CFG={cfg} Steps={steps} ...", end=" ", flush=True)
        try:
            wf = build_wf(model, cfg, steps, sampler, scheduler, prompt, neg, seed + i * 1000)
            pid = queue(wf)
            result = wait(pid)
            for out in result.get("outputs", {}).values():
                if "images" not in out:
                    continue
                for info in out["images"]:
                    raw = fetch(info["filename"], info.get("subfolder", ""))
                    img = Image.open(BytesIO(raw))
                    path = os.path.join(OUT_DIR, fn)
                    img.save(path, "PNG")
                    print(f"OK")
                    break
                break
        except Exception as e:
            print(f"ERR: {e}")

    print(f"\nDone! Files in: {OUT_DIR}")


if __name__ == "__main__":
    main()
