#!/usr/bin/env python3
"""
Generate 28 pixel art assets for "16 bit Pirates!" asset pack via ComfyUI API.
Each asset is generated at 512x512, then scaled nearest-neighbor to target size.
"""

import json
import urllib.request
import urllib.error
import time
import uuid
import os
import io
import struct
import zlib

COMFYUI_URL = "http://127.0.0.1:8188"
BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "tilesets", "set_002_16bit_pirates")

CHECKPOINT = "dreamshaper_8.safetensors"

BASE_STYLE = (
    "pixel art game sprite, Amiga 500 OCS chipset graphics, MicroProse Sid Meier's "
    "Pirates 1987 style, overhead top-down map view, strictly limited color palette "
    "maximum 32 colors, hard pixel edges absolutely no anti-aliasing, visible dithering "
    "patterns, retro CRPG strategy game asset, flat 2D overhead projection, caribbean "
    "setting, pure transparent background PNG, game ready asset, low resolution "
    "intentional pixelation, OCS Amiga color palette, MicroProse 1987-1990 art direction, "
    "no UI no text no borders no frames"
)

NEGATIVE = (
    "photorealistic, 3D, smooth gradients, anti-aliasing, blurry, modern art, "
    "high resolution, shadows, UI text, more than 32 colors, isometric 3D, "
    "vector art, watermark, background, ground, terrain"
)

# Asset definitions: (filename, subfolder, target_size, specific_prompt)
ASSETS = [
    # Decorations (32x32)
    ("deco_palm_single.png", "decorations", 32,
     "single tropical palm tree, top-down overhead view, green fronds brown trunk, "
     "Amiga 500 map decoration, MicroProse Pirates style, isolated tree sprite"),
    ("deco_palm_cluster.png", "decorations", 32,
     "small cluster of 2-3 palm trees, top-down overhead view, green canopy, "
     "Amiga 500 style, map decoration overlay"),
    ("deco_hill_small.png", "decorations", 32,
     "small hill elevation marker, top-down overhead view, brown rocky mound with shadow, "
     "Amiga Pirates map decoration, terrain feature overlay"),
    ("deco_hill_large.png", "decorations", 32,
     "larger hill rocky outcrop, top-down overhead view, brown gray rock formation, "
     "shadow dithering, Amiga 500 Pirates style, terrain overlay sprite"),
    ("deco_jungle_patch.png", "decorations", 32,
     "dense jungle patch, top-down view, dark green leafy canopy cluster, "
     "Amiga OCS palette, Pirates 1987 map overlay decoration"),
    ("deco_rocks_land.png", "decorations", 32,
     "rocky outcrops on land, top-down overhead view, gray brown stones, "
     "Amiga Pirates style terrain decoration, map overlay"),

    # Cities
    ("city_metropolis.png", "cities", 48,
     "large colonial capital city, top-down overhead view, many buildings cathedral "
     "walls harbor docks, Amiga 500 MicroProse Pirates 1987 map icon, largest settlement "
     "marker, dense buildings pixel art, caribbean colonial city overhead"),
    ("city_large.png", "cities", 40,
     "large colonial town with port, top-down overhead view, several buildings and dock, "
     "Amiga Pirates 1987 map icon, caribbean colonial settlement"),
    ("city_medium.png", "cities", 32,
     "medium colonial town, top-down overhead view, few buildings small dock, "
     "Amiga 500 Pirates style map settlement marker"),
    ("city_small.png", "cities", 24,
     "small colonial village, top-down overhead view, 2-3 small buildings, "
     "Amiga Pirates 1987 map icon, tiny caribbean settlement"),
    ("city_outpost.png", "cities", 20,
     "tiny frontier outpost, top-down overhead view, single building watchtower, "
     "Amiga 500 Pirates style, smallest settlement map marker"),
    ("city_fort_large.png", "cities", 40,
     "large military fort, top-down overhead view, stone walls bastions cannons, "
     "Amiga Pirates 1987 style, colonial caribbean fortress map icon"),
    ("city_fort_small.png", "cities", 32,
     "small military fort blockhouse, top-down overhead view, small stone walls, "
     "Amiga 500 Pirates style map icon, colonial fort marker"),

    # Flags (16x16) — 5 nations x 3 frames
    ("flag_spain_frame1.png", "flags", 16,
     "spanish colonial flag waving frame 1, red and yellow vertical stripes, "
     "tiny flag on pole, Amiga 500 Pirates 1987 style, animation frame 1 straight"),
    ("flag_spain_frame2.png", "flags", 16,
     "spanish colonial flag waving frame 2, red and yellow stripes, flag slightly bent "
     "mid-wave, Amiga Pirates style, animation frame 2"),
    ("flag_spain_frame3.png", "flags", 16,
     "spanish colonial flag waving frame 3, red and yellow stripes, flag fully bent in wind, "
     "Amiga 500 Pirates style, animation frame 3 fully waving"),
    ("flag_england_frame1.png", "flags", 16,
     "english colonial flag frame 1, red cross on white, tiny flag on pole straight, "
     "Amiga Pirates 1987 style"),
    ("flag_england_frame2.png", "flags", 16,
     "english colonial flag frame 2, red cross on white, flag mid-wave, Amiga Pirates style"),
    ("flag_england_frame3.png", "flags", 16,
     "english colonial flag frame 3, red cross on white, flag fully waving in wind, "
     "Amiga 500 Pirates style"),
    ("flag_france_frame1.png", "flags", 16,
     "french colonial flag frame 1, blue white red tricolor vertical, tiny flag straight "
     "on pole, Amiga Pirates style"),
    ("flag_france_frame2.png", "flags", 16,
     "french colonial flag frame 2, blue white red tricolor, flag mid-wave, "
     "Amiga 500 Pirates 1987 style"),
    ("flag_france_frame3.png", "flags", 16,
     "french colonial flag frame 3, blue white red tricolor, flag fully waving, "
     "Amiga Pirates style"),
    ("flag_netherlands_frame1.png", "flags", 16,
     "dutch colonial flag frame 1, orange white blue horizontal stripes, tiny flag straight, "
     "Amiga Pirates style"),
    ("flag_netherlands_frame2.png", "flags", 16,
     "dutch colonial flag frame 2, orange white blue stripes, flag mid-wave, "
     "Amiga 500 Pirates 1987 style"),
    ("flag_netherlands_frame3.png", "flags", 16,
     "dutch colonial flag frame 3, orange white blue stripes, flag fully waving in wind, "
     "Amiga Pirates style"),
    ("flag_pirates_frame1.png", "flags", 16,
     "pirate jolly roger flag frame 1, skull and crossbones white on black, tiny flag "
     "straight on pole, Amiga Pirates 1987 style, pirate faction marker"),
    ("flag_pirates_frame2.png", "flags", 16,
     "pirate jolly roger flag frame 2, skull crossbones on black, flag mid-wave, "
     "Amiga 500 Pirates style"),
    ("flag_pirates_frame3.png", "flags", 16,
     "pirate jolly roger flag frame 3, skull crossbones on black, flag fully waving, "
     "Amiga Pirates 1987 style"),
]


def build_workflow(prompt_text: str, negative_text: str, seed: int) -> dict:
    """Build a ComfyUI workflow JSON for txt2img with transparent background."""
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 30,
                "cfg": 7.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": CHECKPOINT,
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 512,
                "height": 512,
                "batch_size": 1,
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt_text,
                "clip": ["4", 1],
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_text,
                "clip": ["4", 1],
            }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2],
            }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "comfyui_pirates",
                "images": ["8", 0],
            }
        },
    }


def queue_prompt(workflow: dict) -> str:
    """Queue a prompt and return the prompt_id."""
    client_id = str(uuid.uuid4())
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    return result["prompt_id"]


def wait_for_completion(prompt_id: str, timeout: int = 120) -> dict:
    """Poll history until the prompt completes."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
            history = json.loads(resp.read())
            if prompt_id in history:
                return history[prompt_id]
        except urllib.error.URLError:
            pass
        time.sleep(1.0)
    raise TimeoutError(f"Prompt {prompt_id} did not complete within {timeout}s")


def download_image(filename: str, subfolder: str) -> bytes:
    """Download a generated image from ComfyUI."""
    url = f"{COMFYUI_URL}/view?filename={urllib.request.quote(filename)}&subfolder={urllib.request.quote(subfolder)}&type=output"
    resp = urllib.request.urlopen(url)
    return resp.read()


# ---- Pure-Python nearest-neighbor resize (no PIL dependency) ----

def parse_png(data: bytes):
    """Parse PNG into (width, height, rows_rgba). Each row is a list of (R,G,B,A) tuples."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError("Not a PNG file")
    pos = 8
    ihdr = None
    idat_chunks = []
    while pos < len(data):
        length = struct.unpack(">I", data[pos:pos+4])[0]
        chunk_type = data[pos+4:pos+8]
        chunk_data = data[pos+8:pos+8+length]
        pos += 12 + length  # 4 len + 4 type + data + 4 crc
        if chunk_type == b'IHDR':
            ihdr = chunk_data
        elif chunk_type == b'IDAT':
            idat_chunks.append(chunk_data)
        elif chunk_type == b'IEND':
            break

    width = struct.unpack(">I", ihdr[0:4])[0]
    height = struct.unpack(">I", ihdr[4:8])[0]
    bit_depth = ihdr[8]
    color_type = ihdr[9]

    raw = zlib.decompress(b''.join(idat_chunks))

    if color_type == 6:  # RGBA
        bpp = 4
    elif color_type == 2:  # RGB
        bpp = 3
    else:
        bpp = 4  # fallback

    stride = 1 + width * bpp  # 1 byte filter + pixel data
    rows = []
    prev_row = b'\x00' * (width * bpp)
    for y in range(height):
        row_start = y * stride
        filt = raw[row_start]
        scanline = bytearray(raw[row_start + 1: row_start + stride])

        # Reconstruct filters
        recon = bytearray(len(scanline))
        for i in range(len(scanline)):
            a = recon[i - bpp] if i >= bpp else 0
            b_val = prev_row[i]
            c = prev_row[i - bpp] if i >= bpp else 0
            if filt == 0:
                recon[i] = scanline[i] & 0xFF
            elif filt == 1:
                recon[i] = (scanline[i] + a) & 0xFF
            elif filt == 2:
                recon[i] = (scanline[i] + b_val) & 0xFF
            elif filt == 3:
                recon[i] = (scanline[i] + (a + b_val) // 2) & 0xFF
            elif filt == 4:
                # Paeth
                p = a + b_val - c
                pa, pb, pc = abs(p - a), abs(p - b_val), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b_val if pb <= pc else c)
                recon[i] = (scanline[i] + pr) & 0xFF

        prev_row = bytes(recon)
        row_pixels = []
        for x in range(width):
            offset = x * bpp
            if bpp == 4:
                row_pixels.append((recon[offset], recon[offset+1], recon[offset+2], recon[offset+3]))
            else:
                row_pixels.append((recon[offset], recon[offset+1], recon[offset+2], 255))
        rows.append(row_pixels)

    return width, height, rows


def resize_nearest(rows, src_w, src_h, dst_w, dst_h):
    """Nearest-neighbor resize."""
    new_rows = []
    for dy in range(dst_h):
        sy = int(dy * src_h / dst_h)
        sy = min(sy, src_h - 1)
        src_row = rows[sy]
        new_row = []
        for dx in range(dst_w):
            sx = int(dx * src_w / dst_w)
            sx = min(sx, src_w - 1)
            new_row.append(src_row[sx])
        new_rows.append(new_row)
    return new_rows


def write_png(width, height, rows, filepath):
    """Write RGBA rows to a PNG file."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + c + struct.pack(">I", crc)

    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    raw_data = bytearray()
    for row in rows:
        raw_data.append(0)  # no filter
        for r, g, b, a in row:
            raw_data.extend([r, g, b, a])

    compressed = zlib.compress(bytes(raw_data), 9)

    with open(filepath, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', ihdr_data))
        f.write(chunk(b'IDAT', compressed))
        f.write(chunk(b'IEND', b''))


def process_image(image_data: bytes, target_size: int, output_path: str):
    """Parse PNG, resize nearest-neighbor, save."""
    src_w, src_h, rows = parse_png(image_data)
    resized = resize_nearest(rows, src_w, src_h, target_size, target_size)
    write_png(target_size, target_size, resized, output_path)


def generate_asset(filename, subfolder, target_size, specific_prompt, index):
    """Generate a single asset via ComfyUI."""
    full_prompt = f"{specific_prompt}, {BASE_STYLE}"
    seed = 42000 + index * 137  # deterministic but varied

    print(f"  [{index+1}/28] Generating {filename} (seed={seed})...")
    workflow = build_workflow(full_prompt, NEGATIVE, seed)
    prompt_id = queue_prompt(workflow)
    result = wait_for_completion(prompt_id, timeout=180)

    # Get the output image
    outputs = result.get("outputs", {})
    for node_id, node_output in outputs.items():
        if "images" in node_output:
            for img_info in node_output["images"]:
                img_data = download_image(img_info["filename"], img_info.get("subfolder", ""))
                output_path = os.path.join(BASE_DIR, subfolder, filename)
                process_image(img_data, target_size, output_path)
                print(f"    -> Saved {output_path} ({target_size}x{target_size})")
                return True

    print(f"    !! No output image for {filename}")
    return False


def main():
    print(f"=== 16 bit Pirates! Asset Generator ===")
    print(f"ComfyUI: {COMFYUI_URL}")
    print(f"Output: {os.path.abspath(BASE_DIR)}")
    print(f"Checkpoint: {CHECKPOINT}")
    print(f"Total assets: {len(ASSETS)}")
    print()

    success = 0
    failed = []

    for i, (filename, subfolder, target_size, prompt) in enumerate(ASSETS):
        try:
            if generate_asset(filename, subfolder, target_size, prompt, i):
                success += 1
            else:
                failed.append(filename)
        except Exception as e:
            print(f"    !! ERROR: {e}")
            failed.append(filename)

    print()
    print(f"=== Done: {success}/{len(ASSETS)} generated ===")
    if failed:
        print(f"Failed: {', '.join(failed)}")
    return success == len(ASSETS)


if __name__ == "__main__":
    import sys
    sys.exit(0 if main() else 1)
