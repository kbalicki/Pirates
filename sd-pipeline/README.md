# SD Pipeline - Asset Generation for Pirates Chronicles

Pipeline for generating 2D pixel art game assets using ComfyUI + Stable Diffusion 1.5.

## Prerequisites

- **ComfyUI 0.3.68+** installed at `C:\AI\ComfyUI`
- **DreamShaper 8** checkpoint in `C:\AI\ComfyUI\models\checkpoints\dreamshaper_8.safetensors`
- **Custom nodes**: ComfyUI-Manager, ComfyUI-TiledDiffusion

## Quick Start

Primary tool is `tools/comfy.mjs` — zero dependencies, uses Node's built-in fetch,
prints machine-readable output and exits non-zero on failure. Run it from the repo root.

```bash
node sd-pipeline/tools/comfy.mjs status      # server, GPU, free VRAM
node sd-pipeline/tools/comfy.mjs models      # available checkpoints and LoRAs
node sd-pipeline/tools/comfy.mjs workflows   # templates: output size, LoRA support

node sd-pipeline/tools/comfy.mjs gen   --workflow icon_64x64   --prompt "wooden treasure chest with gold coins"   --out temp/gen --seed 777   --set 1.ckpt_name=pixel-art-diffusion-v1.safetensors
```

Options: `--seed --steps --cfg --width --height --batch --negative --lora --lora-strength
--name --timeout` and `--set <nodeId>.<input>=<value>` for raw graph overrides (repeatable).

Every PNG gets a sibling JSON with the workflow, prompt, seed and sampler settings.
Keep it — without the seed you cannot reproduce a good result or extend it into a
consistent series (e.g. eight headings of the same ship).

`tools/generate.ps1` is the older PowerShell client and is kept for reference.

## Model choice

| Checkpoint | Use |
|---|---|
| `pixel-art-diffusion-v1` | pixel art, isolated objects on clean backgrounds — **best for game assets** |
| `dreamshaper_8` | general SD 1.5, illustrations, backgrounds |
| `sd_xl_base_1.0` | SDXL — higher quality but tight on 6 GB VRAM |

**Do not reach for the `amigapxl_pirates_v1` LoRA to make isolated sprites.** It was
trained on full game screenshots and reproduces whole screens complete with a HUD bar.
See `ai-assets/README.md` for the full diagnosis.

## Workflows

| File | Resolution | Use |
|------|-----------|-----|
| `icon_64x64.json` | 512x512 → 64x64 | Inventory/UI icons |
| `tile_32x32.json` | 512x512 → 32x32 | Seamless map tiles |
| `ship_sprite.json` | 512x512 | Ship sprites |
| `map_bg.json` | 512x512 | Map backgrounds |
| `cloud_sprite.json` | 512x512 | Clouds on flat blue |
| `pirate_lora.json` | 512x512 | Amiga palette via the project LoRA — whole-screen composition, see caveat above |

## Directory Structure

- `workflows/` - ComfyUI workflow JSON files (API format)
- `prompts/` - Prompt lists per asset category
- `tools/` - Generation scripts
- `assets_raw/` - Raw outputs + metadata JSON (PNGs not tracked in git)
- `assets_game/` - Curated assets ready for the game
