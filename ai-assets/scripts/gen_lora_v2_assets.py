"""
Generuje zestaw assetow do gry przez lokalne ComfyUI, uzywajac LoRA
`amigapxl_pirates_v2` + checkpoint `pixel-art-diffusion-v1`.

Dodatkowo generuje zestaw kontrolny (te same prompty):
  - bez LoRA            -> sciezka ktora dzialala dotad
  - LoRA v2 @ 0.6 / 0.9 -> sprawdzenie sily
  - LoRA v1 @ 0.8       -> dowod na stary blad (cale ekrany gry zamiast sprite'ow)

Wyjscie: ai-assets/output/lora_v2/*.png + manifest.json + contact sheet.
"""

import json
import os
import time
import urllib.request
import urllib.parse
import uuid
from pathlib import Path

COMFY = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
OUT = Path(r"C:\GIT\PiratesChronicles\ai-assets\output\lora_v2")
CKPT = "pixel-art-diffusion-v1.safetensors"
LORA_V2 = "amigapxl_pirates_v2.safetensors"
LORA_V1 = "amigapxl_pirates_v1_ep10.safetensors"

TRIGGER = "amigapxl"
# ogon promptu odwzorowuje strukture captionow ze zbioru treningowego
TAIL = "single object, centered, game asset sprite, {style}, plain dark brown background"
NEG = ("full game screen, user interface, hud, map, multiple objects, scene, "
       "text, watermark, signature, blurry, photo, 3d render, jpeg artifacts, frame, border")

SHIP_STYLE = "painted top down game sprite"
ICON_STYLE = "pixel art icon"
TOWN_STYLE = "isometric town sprite"
CHAR_STYLE = "painted character portrait sprite"
FX_STYLE = "painted game sprite"

# --------------------------------------------------------------- lista assetow
ASSETS = [
    # 9 klas statkow (widok z gory)
    ("ship_pinnace",      "small single masted pinnace sailing ship seen from above", SHIP_STYLE),
    ("ship_sloop",        "fast single masted sloop sailing ship seen from above", SHIP_STYLE),
    ("ship_barque",       "three masted barque sailing ship seen from above", SHIP_STYLE),
    ("ship_brigantine",   "two masted brigantine sailing ship seen from above", SHIP_STYLE),
    ("ship_fluyt",        "dutch fluyt cargo sailing ship seen from above", SHIP_STYLE),
    ("ship_frigate",      "three masted naval frigate with gun ports seen from above", SHIP_STYLE),
    ("ship_fast_galleon", "sleek fast galleon sailing ship seen from above", SHIP_STYLE),
    ("ship_galleon",      "heavy spanish galleon with high stern castle seen from above", SHIP_STYLE),
    ("ship_merchantman",  "wide bellied merchantman cargo ship seen from above", SHIP_STYLE),
    # klatki uszkodzen (potrzebne do v0.9.9)
    ("dmg_hull_holes",    "damaged sailing ship with holes in the hull seen from above", SHIP_STYLE),
    ("dmg_torn_sails",    "sailing ship with torn ragged sails seen from above", SHIP_STYLE),
    ("dmg_broken_mast",   "sailing ship with a snapped broken mast seen from above", SHIP_STYLE),
    ("dmg_burning",       "burning sailing ship with fire and smoke seen from above", SHIP_STYLE),
    ("dmg_wreck",         "sinking shipwreck hull seen from above", SHIP_STYLE),
    # ikony UI
    ("icon_chest",        "wooden treasure chest full of gold coins", ICON_STYLE),
    ("icon_treasure_map", "old treasure map parchment with a red cross", ICON_STYLE),
    ("icon_compass",      "brass navigation compass", ICON_STYLE),
    ("icon_spyglass",     "brass spyglass telescope", ICON_STYLE),
    ("icon_cutlass",      "curved pirate cutlass sword", ICON_STYLE),
    ("icon_pistol",       "flintlock pirate pistol", ICON_STYLE),
    ("icon_barrel",       "wooden barrel with iron bands", ICON_STYLE),
    ("icon_coin_sack",    "leather sack full of gold coins", ICON_STYLE),
    ("icon_gold_coin",    "single golden doubloon coin", ICON_STYLE),
    ("icon_rum",          "bottle of rum", ICON_STYLE),
    ("icon_anchor",       "iron ship anchor", ICON_STYLE),
    ("icon_jolly_roger",  "black jolly roger pirate flag with skull", ICON_STYLE),
    # towary
    ("goods_sugar",       "stack of white sugar loaves", ICON_STYLE),
    ("goods_tobacco",     "bundle of dried tobacco leaves", ICON_STYLE),
    ("goods_cotton",      "bale of raw cotton", ICON_STYLE),
    ("goods_cocoa",       "pile of cocoa beans in a sack", ICON_STYLE),
    ("goods_spices",      "pile of colourful spices in a sack", ICON_STYLE),
    ("goods_timber",      "stack of cut timber logs", ICON_STYLE),
    ("goods_food",        "crate of food provisions bread and salted meat", ICON_STYLE),
    ("goods_cannon",      "iron naval cannon on a wooden carriage", ICON_STYLE),
    # portrety
    ("char_governor",     "portrait of a colonial governor in a powdered wig", CHAR_STYLE),
    ("char_daughter",     "portrait of a young noble lady in a red gown", CHAR_STYLE),
    ("char_barman",       "portrait of a tavern innkeeper with an apron", CHAR_STYLE),
    ("char_merchant",     "portrait of a wealthy colonial merchant", CHAR_STYLE),
    ("char_sailor",       "portrait of a weathered sailor with a bandana", CHAR_STYLE),
    ("char_pirate",       "portrait of a pirate captain in a tricorn hat", CHAR_STYLE),
    ("char_soldier",      "portrait of a spanish colonial soldier with a helmet", CHAR_STYLE),
    # elementy portu
    ("port_fort",         "stone coastal fort with bastions and cannons", TOWN_STYLE),
    ("port_dock",         "wooden harbour dock with mooring posts", TOWN_STYLE),
    ("port_warehouse",    "colonial stone warehouse with a tiled roof", TOWN_STYLE),
    ("port_tavern",       "colonial wooden tavern building", TOWN_STYLE),
    ("port_church",       "colonial church with a bell tower", TOWN_STYLE),
    # efekty
    ("fx_explosion",      "orange explosion burst", FX_STYLE),
    ("fx_smoke",          "grey smoke puff cloud", FX_STYLE),
    ("fx_fire",           "burning fire flames", FX_STYLE),
    ("fx_splash",         "white water splash", FX_STYLE),
    ("fx_cannonball",     "flying iron cannonball", FX_STYLE),
]

# prompty uzyte w zestawie kontrolnym (podzbior ASSETS)
CONTROL_KEYS = ["ship_galleon", "dmg_torn_sails", "icon_chest", "icon_compass",
                "goods_sugar", "char_governor", "port_fort", "fx_explosion"]

CONFIGS = [
    ("v2_075", LORA_V2, 0.75),   # zestaw glowny
]
CONTROL_CONFIGS = [
    ("nolora", None, 0.0),
    ("v2_060", LORA_V2, 0.60),
    ("v2_090", LORA_V2, 0.90),
    ("v1_080", LORA_V1, 0.80),
]

SEED = 31337
STEPS = 28
CFG = 7.5


# --------------------------------------------------------------- ComfyUI API
def post(path, payload):
    req = urllib.request.Request(
        COMFY + path, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def get(path):
    with urllib.request.urlopen(COMFY + path, timeout=30) as r:
        return json.loads(r.read())


def build_workflow(prompt, negative, lora, strength, seed):
    src = "1"
    wf = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "4": {"class_type": "EmptyLatentImage",
              "inputs": {"width": 512, "height": 512, "batch_size": 1}},
    }
    if lora:
        wf["9"] = {"class_type": "LoraLoader", "inputs": {
            "model": ["1", 0], "clip": ["1", 1], "lora_name": lora,
            "strength_model": strength, "strength_clip": strength}}
        src = "9"
    wf["2"] = {"class_type": "CLIPTextEncode",
               "inputs": {"clip": [src, 1], "text": prompt}}
    wf["3"] = {"class_type": "CLIPTextEncode",
               "inputs": {"clip": [src, 1], "text": negative}}
    wf["5"] = {"class_type": "KSampler", "inputs": {
        "model": [src, 0], "positive": ["2", 0], "negative": ["3", 0],
        "latent_image": ["4", 0], "seed": seed, "steps": STEPS, "cfg": CFG,
        "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}}
    wf["6"] = {"class_type": "VAEDecode", "inputs": {"vae": ["1", 2], "samples": ["5", 0]}}
    # PreviewImage -> plik ladu je w temp ComfyUI, pobieramy go od razu przez /view
    # (nie zasmiecamy C:\AI\ComfyUI\output 82 plikami)
    wf["7"] = {"class_type": "PreviewImage", "inputs": {"images": ["6", 0]}}
    return wf


def run(wf, timeout=300):
    cid = str(uuid.uuid4())
    res = post("/prompt", {"prompt": wf, "client_id": cid})
    pid = res["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = get("/history/" + pid)
        if pid in hist:
            outs = hist[pid]["outputs"]
            for node in outs.values():
                for im in node.get("images", []):
                    q = urllib.parse.urlencode(
                        {"filename": im["filename"], "subfolder": im.get("subfolder", ""),
                         "type": im.get("type", "output")})
                    with urllib.request.urlopen(COMFY + "/view?" + q, timeout=60) as r:
                        return r.read()
            raise RuntimeError("brak obrazu w historii " + pid)
        time.sleep(1.5)
    raise TimeoutError("timeout dla " + pid)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = []
    jobs = []
    for key, noun, style in ASSETS:
        for tag, lora, strength in CONFIGS:
            jobs.append((f"{key}__{tag}", key, noun, style, tag, lora, strength))
    by_key = {k: (n, s) for k, n, s in ASSETS}
    for key in CONTROL_KEYS:
        noun, style = by_key[key]
        for tag, lora, strength in CONTROL_CONFIGS:
            jobs.append((f"ctrl_{key}__{tag}", key, noun, style, tag, lora, strength))

    print(f"{len(jobs)} zadan")
    t0 = time.time()
    for i, (name, key, noun, style, tag, lora, strength) in enumerate(jobs, 1):
        path = OUT / f"{name}.png"
        prompt = f"{TRIGGER}, {noun}, " + TAIL.format(style=style)
        rec = {"file": path.name, "key": key, "config": tag, "prompt": prompt,
               "negative": NEG, "checkpoint": CKPT, "lora": lora,
               "lora_strength": strength, "seed": SEED, "steps": STEPS, "cfg": CFG,
               "sampler": "dpmpp_2m/karras", "size": "512x512"}
        if path.exists():
            manifest.append(rec)
            print(f"[{i}/{len(jobs)}] pominieto (istnieje) {name}")
            continue
        try:
            data = run(build_workflow(prompt, NEG, lora, strength, SEED))
            path.write_bytes(data)
            manifest.append(rec)
            el = time.time() - t0
            print(f"[{i}/{len(jobs)}] {name}  ({el/i:.1f}s/obraz)")
        except Exception as e:
            print(f"[{i}/{len(jobs)}] BLAD {name}: {e}")
            rec["error"] = str(e)
            manifest.append(rec)
        (OUT / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print("gotowe:", OUT)


if __name__ == "__main__":
    main()
