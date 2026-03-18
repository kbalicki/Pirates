#!/usr/bin/env python3
"""Generate 28 pixel-art assets for '16 bit Pirates!' via ComfyUI API."""

import json, urllib.request, urllib.error, time, uuid, os, sys
import numpy as np
from PIL import Image
from io import BytesIO

COMFYUI = "http://127.0.0.1:8188"
BASE_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "public", "assets", "tilesets", "set_002_16bit_pirates"))
CKPT = "dreamshaper_8.safetensors"

BASE_STYLE = (
    "high quality pixel art sprite, top-down 60 degree angle view, 2.5D perspective, "
    "buildings have visible front wall and roof simultaneously, pseudo-3D overhead view, "
    "Civilization 1 SNES style, SimCity SNES style, Age of Empires 1 sprite style, "
    "clean crisp pixel art, rich color palette unlimited colors, sharp pixel edges, "
    "no anti-aliasing, strong readable silhouette, caribbean colonial setting, "
    "pure WHITE background #FFFFFF, single isolated sprite centered, "
    "no shadows outside sprite, no ground plane, no terrain, no UI, no text, "
    "game ready asset, professional pixel art quality"
)

NEGATIVE = (
    "photorealistic, 3D render, blurry, anti-aliasing, smooth gradients, "
    "watermark, background scenery, ground tiles, terrain, grass, water, "
    "UI elements, text, numbers, modern graphics, cartoon, anime, "
    "low quality, noisy, jpeg artifacts, vignette, border, frame, "
    "gray background, black background, colored background"
)

# (filename, subfolder, target_w, target_h, prompt_suffix)
ASSETS = [
    # --- Decorations 32x32 ---
    ("deco_palm_single.png", "decorations", 32, 32,
     "single tropical palm tree, 60 degree top-down view, visible trunk from side and top of crown from above, lush green palm fronds fanning outward, brown fibrous trunk, caribbean island decoration sprite, pixel art, white background"),
    ("deco_palm_cluster.png", "decorations", 32, 32,
     "cluster of 2-3 tropical palm trees grouped together, 60 degree top-down view, overlapping green canopies, varied heights, brown trunks visible, caribbean jungle decoration, pixel art sprite, white background"),
    ("deco_hill_small.png", "decorations", 32, 32,
     "small rocky hill terrain feature, 60 degree top-down view, visible slope on front face, rocky gray brown surface, subtle shadow on front wall, terrain elevation marker, caribbean island hill sprite, pixel art, white background"),
    ("deco_hill_large.png", "decorations", 32, 32,
     "large rocky hill or small mountain, 60 degree top-down view, prominent front slope visible, gray rocky surface with brown earth, dramatic silhouette, terrain elevation feature, caribbean island mountain sprite, pixel art, white background"),
    ("deco_jungle_patch.png", "decorations", 32, 32,
     "dense jungle vegetation patch, 60 degree top-down view, multiple overlapping tropical leaves and canopy from above, deep greens with variation, lush tropical foliage cluster, caribbean jungle decoration sprite, pixel art, white background"),
    ("deco_rocks_land.png", "decorations", 32, 32,
     "scattered rocks and boulders on land, 60 degree top-down view, visible side face of rocks showing depth, gray and brown stones, varied sizes clustered together, terrain obstacle decoration, caribbean island rocks sprite, pixel art, white background"),

    # --- Cities ---
    ("city_metropolis.png", "cities", 96, 96,
     "large colonial capital city, 60 degree top-down 2.5D view, multiple large buildings with visible rooftops and front walls, grand cathedral or church with tower, stone walls fortifications, busy harbor with docks and warehouses, colonial spanish architecture, densely packed city blocks, Age of Empires 1 city style, pixel art sprite, white background, highly detailed"),
    ("city_large.png", "cities", 72, 72,
     "large colonial port town, 60 degree top-down 2.5D view, several buildings with rooftops and front walls visible, church or town hall prominent, wooden docks extending outward, colonial architecture, moderately dense settlement, Civilization 1 city style, pixel art sprite, white background"),
    ("city_medium.png", "cities", 56, 56,
     "medium colonial town, 60 degree top-down 2.5D view, few buildings with visible rooftops and front walls, small wooden dock, modest colonial houses, caribbean settlement, SimCity SNES building style, pixel art sprite, white background"),
    ("city_small.png", "cities", 40, 40,
     "small colonial village, 60 degree top-down 2.5D view, 2 to 3 small colonial buildings with rooftops visible, tiny wooden dock or pier, humble settlement, caribbean village sprite, pixel art, white background"),
    ("city_outpost.png", "cities", 32, 32,
     "tiny frontier outpost, 60 degree top-down 2.5D view, single small building with watchtower, wooden palisade fence, minimal settlement, isolated colonial post, caribbean outpost sprite, pixel art, white background"),
    ("city_fort_large.png", "cities", 72, 72,
     "large colonial military fortress, 60 degree top-down 2.5D view, thick stone walls with bastions visible on front and top, corner towers with cannons, inner courtyard partially visible, imposing military architecture, Age of Empires fort style, pixel art sprite, white background"),
    ("city_fort_small.png", "cities", 48, 48,
     "small colonial fort blockhouse, 60 degree top-down 2.5D view, small stone walls visible from side and top, single cannon or watchtower, compact military structure, caribbean fort sprite, pixel art, white background"),

    # --- Flags 24x24, 5 nations x 3 frames ---
    ("flag_spain_frame1.png", "flags", 24, 24,
     "pixel art 24x24 sprite, spanish flag on pole, red yellow red vertical stripes, flag straight horizontal frame 1 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_spain_frame2.png", "flags", 24, 24,
     "pixel art 24x24 sprite, spanish flag on pole, red yellow red vertical stripes, flag slightly curved mid-wave frame 2 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_spain_frame3.png", "flags", 24, 24,
     "pixel art 24x24 sprite, spanish flag on pole, red yellow red vertical stripes, flag fully waving curved frame 3 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_england_frame1.png", "flags", 24, 24,
     "pixel art 24x24 sprite, english flag on pole, red cross on white background, flag straight horizontal frame 1 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_england_frame2.png", "flags", 24, 24,
     "pixel art 24x24 sprite, english flag on pole, red cross on white, flag slightly curved frame 2 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_england_frame3.png", "flags", 24, 24,
     "pixel art 24x24 sprite, english flag on pole, red cross on white, flag fully waving frame 3 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_france_frame1.png", "flags", 24, 24,
     "pixel art 24x24 sprite, french flag on pole, blue white red vertical tricolor, flag straight horizontal frame 1 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_france_frame2.png", "flags", 24, 24,
     "pixel art 24x24 sprite, french flag on pole, blue white red tricolor, flag slightly curved frame 2 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_france_frame3.png", "flags", 24, 24,
     "pixel art 24x24 sprite, french flag on pole, blue white red tricolor, flag fully waving frame 3 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_netherlands_frame1.png", "flags", 24, 24,
     "pixel art 24x24 sprite, dutch flag on pole, orange white blue horizontal stripes, flag straight horizontal frame 1 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_netherlands_frame2.png", "flags", 24, 24,
     "pixel art 24x24 sprite, dutch flag on pole, orange white blue horizontal stripes, flag slightly curved frame 2 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_netherlands_frame3.png", "flags", 24, 24,
     "pixel art 24x24 sprite, dutch flag on pole, orange white blue horizontal stripes, flag fully waving frame 3 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_pirates_frame1.png", "flags", 24, 24,
     "pixel art 24x24 sprite, pirate jolly roger flag on pole, white skull and crossbones on black flag, flag straight horizontal frame 1 of 3, thin vertical flagpole, clean flat colors, white background, no anti-aliasing"),
    ("flag_pirates_frame2.png", "flags", 24, 24,
     "pixel art 24x24 sprite, pirate jolly roger flag on pole, white skull crossbones on black, flag slightly curved frame 2 of 3, thin vertical flagpole, white background, no anti-aliasing"),
    ("flag_pirates_frame3.png", "flags", 24, 24,
     "pixel art 24x24 sprite, pirate jolly roger flag on pole, white skull crossbones on black, flag fully waving frame 3 of 3, thin vertical flagpole, white background, no anti-aliasing"),
]


def remove_white_background(img, tolerance=30):
    """Remove white/near-white pixels by setting their alpha to 0."""
    data = np.array(img.convert("RGBA"))
    r, g, b = data[:,:,0], data[:,:,1], data[:,:,2]
    white_mask = (r > 255 - tolerance) & (g > 255 - tolerance) & (b > 255 - tolerance)
    data[:,:,3] = np.where(white_mask, 0, data[:,:,3])
    return Image.fromarray(data)


def build_workflow(prompt_text, negative_text, seed):
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 35, "cfg": 8.0,
                "sampler_name": "dpmpp_2m", "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0], "positive": ["6", 0],
                "negative": ["7", 0], "latent_image": ["5", 0],
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CKPT}
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 512, "height": 512, "batch_size": 1}
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt_text, "clip": ["4", 1]}
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative_text, "clip": ["4", 1]}
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]}
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "pirates16bit", "images": ["8", 0]}
        },
    }


def queue_prompt(workflow):
    client_id = str(uuid.uuid4())
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(f"{COMFYUI}/prompt", data=payload,
                                headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())["prompt_id"]


def wait_for_completion(prompt_id, timeout=180):
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI}/history/{prompt_id}")
            history = json.loads(resp.read())
            if prompt_id in history:
                return history[prompt_id]
        except urllib.error.URLError:
            pass
        time.sleep(1.5)
    raise TimeoutError(f"Prompt {prompt_id} timed out after {timeout}s")


def download_image(filename, subfolder):
    url = (f"{COMFYUI}/view?filename={urllib.request.quote(filename)}"
           f"&subfolder={urllib.request.quote(subfolder)}&type=output")
    resp = urllib.request.urlopen(url)
    return resp.read()


def generate_one(filename, subfolder, tw, th, specific_prompt, idx):
    full_prompt = f"{specific_prompt}, {BASE_STYLE}"
    seed = 50000 + idx * 173

    print(f"  [{idx+1:2d}/28] {filename} ...", end=" ", flush=True)

    workflow = build_workflow(full_prompt, NEGATIVE, seed)
    prompt_id = queue_prompt(workflow)
    result = wait_for_completion(prompt_id)

    outputs = result.get("outputs", {})
    for node_output in outputs.values():
        if "images" not in node_output:
            continue
        for img_info in node_output["images"]:
            raw = download_image(img_info["filename"], img_info.get("subfolder", ""))
            img = Image.open(BytesIO(raw)).convert("RGBA")

            # Remove white background
            tol = 15 if "flag_england" in filename else 30
            img = remove_white_background(img, tolerance=tol)

            # Nearest-neighbor resize
            img = img.resize((tw, th), Image.NEAREST)

            out_path = os.path.join(BASE_DIR, subfolder, filename)
            img.save(out_path, "PNG")
            print(f"OK ({tw}x{th})")
            return True

    print("FAILED (no output)")
    return False


def main():
    print("=== 16 bit Pirates! Asset Generator v2 ===")
    print(f"ComfyUI: {COMFYUI} | Model: {CKPT}")
    print(f"Output:  {BASE_DIR}")
    print(f"Assets:  {len(ASSETS)}\n")

    ok, fails = 0, []
    for i, (fn, sub, tw, th, prompt) in enumerate(ASSETS):
        try:
            if generate_one(fn, sub, tw, th, prompt, i):
                ok += 1
            else:
                fails.append(fn)
        except Exception as e:
            print(f"ERROR: {e}")
            fails.append(fn)

    print(f"\n=== Result: {ok}/{len(ASSETS)} OK ===")
    if fails:
        print(f"Failed: {', '.join(fails)}")
    return ok == len(ASSETS)


if __name__ == "__main__":
    sys.exit(0 if main() else 1)
