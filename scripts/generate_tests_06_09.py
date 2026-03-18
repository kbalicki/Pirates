#!/usr/bin/env python3
"""Generate 4 test variants of palm tree (test_06–test_09) via ComfyUI."""

import json, urllib.request, urllib.error, time, uuid, os, sys
from io import BytesIO
from PIL import Image

COMFYUI = "http://127.0.0.1:8188"
OUT_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "public", "assets", "tests"))

CKPT = "pixel-art-diffusion-v1.safetensors"

TESTS = [
    ("test_06.png",
     "pixel art palm tree top-down view, bird eye view, white background",
     "side view, isometric, 3D, background, realistic"),

    ("test_07.png",
     "pixel art overhead map icon palm tree, flat white background, seen directly from above",
     "side view, isometric, 3D, background, terrain"),

    ("test_08.png",
     "pixel art game map tile, tree symbol, top down 90 degrees, flat green circle with brown dot, white background",
     "side view, 3D, realistic, detailed, background"),

    ("test_09.png",
     "retro game map decoration, palm tree overhead, flat sprite, Civilization DOS map icon, white background, 4 colors",
     "side view, 3D, isometric, realistic, background, terrain"),
]


def build_wf(prompt, negative, seed):
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
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"=== Palm Tree Tests 06-09 ===")
    print(f"Model: {CKPT} | Output: {OUT_DIR}\n")

    seed = 88888
    for i, (fn, prompt, neg) in enumerate(TESTS):
        print(f"  [{i+1}/4] {fn} ...", end=" ", flush=True)
        try:
            wf = build_wf(prompt, neg, seed + i * 1000)
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
                    print("OK")
                    break
                break
        except Exception as e:
            print(f"ERR: {e}")

    print(f"\nDone! Files in: {OUT_DIR}")


if __name__ == "__main__":
    main()
