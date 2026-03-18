# SD Pipeline - Asset Generation for Pirates Chronicles

Pipeline for generating 2D pixel art game assets using ComfyUI + Stable Diffusion 1.5.

## Prerequisites

- **ComfyUI 0.3.68+** installed at `C:\AI\ComfyUI`
- **DreamShaper 8** checkpoint in `C:\AI\ComfyUI\models\checkpoints\dreamshaper_8.safetensors`
- **Custom nodes**: ComfyUI-Manager, ComfyUI-TiledDiffusion

## Quick Start

1. Start ComfyUI: `C:\AI\start_comfyui.bat`
2. Verify API: `Invoke-RestMethod http://127.0.0.1:8188/system_stats`
3. Generate a single asset:
   ```powershell
   .\tools\generate.ps1 -Prompt "pixel art treasure chest, top-down" -OutputDir ".\assets_raw\test"
   ```
4. Batch generate from prompt file:
   ```powershell
   .\tools\generate.ps1 -PromptsFile ".\prompts\icons.txt" -Workflow ".\workflows\icon_64x64.json" -OutputDir ".\assets_raw\icons"
   ```

## Workflows

| File | Resolution | Use |
|------|-----------|-----|
| `icon_64x64.json` | 512x512 → 64x64 | Inventory/UI icons |
| `tile_32x32.json` | 512x512 → 32x32 | Seamless map tiles |
| `ship_sprite.json` | 512x512 | Ship sprites |
| `map_bg.json` | 512x512 | Map backgrounds |

## Directory Structure

- `workflows/` - ComfyUI workflow JSON files (API format)
- `prompts/` - Prompt lists per asset category
- `tools/` - Generation scripts
- `assets_raw/` - Raw outputs + metadata JSON (PNGs not tracked in git)
- `assets_game/` - Curated assets ready for the game
