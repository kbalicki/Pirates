<#
.SYNOPSIS
    Generates seamless tileable assets using madaror/tiled-diffusion.

.DESCRIPTION
    Wrapper for generate_tiled.py — creates seamlessly tileable textures,
    tiles, and animated water GIFs for Pirates Chronicles.

.EXAMPLE
    # Single seamless tile
    .\generate_tiled.ps1 -Prompt "ocean water texture" -Resize 32 -OutputDir ".\assets_raw\tiles"

    # Water animation GIF (40 frames, 128x128)
    .\generate_tiled.ps1 -Prompt "ocean water waves" -Mode gif -GifDirection right -OutputDir ".\assets_raw\water"

    # Batch tiles from file
    .\generate_tiled.ps1 -PromptsFile ".\prompts\tiles.txt" -Resize 32 -OutputDir ".\assets_raw\tiles"

    # Both image + GIF
    .\generate_tiled.ps1 -Prompt "tropical sea" -Mode both -OutputDir ".\assets_raw\water"
#>

[CmdletBinding()]
param(
    [string]$Prompt,
    [string]$PromptsFile,
    [string]$OutputDir,
    [int]$Resize = 0,
    [ValidateSet("self", "x", "y")]
    [string]$Tiling = "self",
    [ValidateSet("image", "gif", "both")]
    [string]$Mode = "image",
    [string]$GifDirection = "right",
    [int]$GifFrames = 40,
    [int]$GifSize = 128,
    [int]$Steps = 40,
    [float]$Cfg = 7.5,
    [int]$Seed = -1,
    [switch]$NoPixelArt
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PipelineRoot = Split-Path -Parent $ScriptRoot
$PythonExe = "C:\AI\ComfyUI\venv\Scripts\python.exe"
$GenerateScript = Join-Path $ScriptRoot "generate_tiled.py"

if (-not $OutputDir) {
    $OutputDir = Join-Path $PipelineRoot "assets_raw"
}

# Build arguments
$pyArgs = @($GenerateScript)

if ($Prompt) {
    $pyArgs += "--prompt", $Prompt
} elseif ($PromptsFile) {
    if (-not [System.IO.Path]::IsPathRooted($PromptsFile)) {
        $PromptsFile = Join-Path $PipelineRoot $PromptsFile
    }
    $pyArgs += "--prompts-file", $PromptsFile
} else {
    Write-Host "[ERROR] Specify -Prompt or -PromptsFile" -ForegroundColor Red
    exit 1
}

$pyArgs += "--output", $OutputDir
$pyArgs += "--tiling", $Tiling
$pyArgs += "--mode", $Mode
$pyArgs += "--steps", $Steps
$pyArgs += "--cfg", ($Cfg.ToString([System.Globalization.CultureInfo]::InvariantCulture))
$pyArgs += "--seed", $Seed
$pyArgs += "--gif-direction", $GifDirection
$pyArgs += "--gif-frames", $GifFrames
$pyArgs += "--gif-size", $GifSize

if ($Resize -gt 0) {
    $pyArgs += "--resize", $Resize
}

if ($NoPixelArt) {
    $pyArgs += "--no-pixel-art"
}

Write-Host "=== Tiled Diffusion Wrapper ===" -ForegroundColor Magenta
Write-Host "Python: $PythonExe"
Write-Host "Args: $($pyArgs -join ' ')"
Write-Host ""

& $PythonExe $pyArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Generation failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}
