<#
.SYNOPSIS
    Generates 2D game assets via ComfyUI REST API.

.DESCRIPTION
    Sends workflow JSON to ComfyUI, polls for completion, downloads PNG output,
    and saves metadata JSON alongside each image.

.PARAMETER Prompt
    Text prompt for image generation. Replaces {prompt} placeholder in workflow.

.PARAMETER Workflow
    Path to ComfyUI workflow JSON file (API format).
    Default: sd-pipeline/workflows/icon_64x64.json

.PARAMETER OutputDir
    Directory to save generated images and metadata.
    Default: sd-pipeline/assets_raw

.PARAMETER PromptsFile
    Path to a text file with one prompt per line (batch mode).
    Lines starting with # are ignored.

.PARAMETER Seed
    Seed for reproducibility. Default: random.

.PARAMETER ComfyUrl
    ComfyUI API base URL. Default: http://127.0.0.1:8188

.EXAMPLE
    .\generate.ps1 -Prompt "pixel art treasure chest" -OutputDir ".\sd-pipeline\assets_raw\test"

.EXAMPLE
    .\generate.ps1 -PromptsFile ".\sd-pipeline\prompts\icons.txt" -Workflow ".\sd-pipeline\workflows\icon_64x64.json"
#>

[CmdletBinding()]
param(
    [string]$Prompt,
    [string]$Workflow,
    [string]$OutputDir,
    [string]$PromptsFile,
    [int]$Seed = -1,
    [string]$ComfyUrl = "http://127.0.0.1:8188"
)

$ErrorActionPreference = "Stop"

# --- Defaults ---
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PipelineRoot = Split-Path -Parent $ScriptRoot

if (-not $Workflow) {
    $Workflow = Join-Path $PipelineRoot "workflows\icon_64x64.json"
}
if (-not $OutputDir) {
    $OutputDir = Join-Path $PipelineRoot "assets_raw"
}

# --- Helpers ---
function Test-ComfyUI {
    try {
        $resp = Invoke-RestMethod -Uri "$ComfyUrl/system_stats" -Method Get -TimeoutSec 5
        Write-Host "[OK] ComfyUI is running. VRAM: $([math]::Round($resp.devices[0].vram_total / 1GB, 1)) GB" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[ERROR] ComfyUI is not reachable at $ComfyUrl" -ForegroundColor Red
        Write-Host "        Start it with: C:\AI\start_comfyui.bat" -ForegroundColor Yellow
        return $false
    }
}

function Send-Prompt {
    param(
        [hashtable]$WorkflowData,
        [string]$PromptText,
        [int]$SeedValue
    )

    # Replace {prompt} placeholder in all CLIPTextEncode positive nodes
    $json = $WorkflowData | ConvertTo-Json -Depth 10
    $json = $json -replace '\{prompt\}', ($PromptText -replace '["\\]', '\$0')

    # Set seed
    if ($SeedValue -ge 0) {
        $wf = $json | ConvertFrom-Json
        foreach ($key in ($wf.PSObject.Properties.Name)) {
            $node = $wf.$key
            if ($node.class_type -eq "KSampler" -and $node.inputs.PSObject.Properties['seed']) {
                $node.inputs.seed = $SeedValue
            }
        }
        $json = $wf | ConvertTo-Json -Depth 10
    } else {
        # Random seed
        $randomSeed = Get-Random -Minimum 0 -Maximum 2147483647
        $wf = $json | ConvertFrom-Json
        foreach ($key in ($wf.PSObject.Properties.Name)) {
            $node = $wf.$key
            if ($node.class_type -eq "KSampler" -and $node.inputs.PSObject.Properties['seed']) {
                $node.inputs.seed = $randomSeed
                $SeedValue = $randomSeed
            }
        }
        $json = $wf | ConvertTo-Json -Depth 10
    }

    $body = @{
        prompt = ($json | ConvertFrom-Json)
    } | ConvertTo-Json -Depth 15

    $response = Invoke-RestMethod -Uri "$ComfyUrl/prompt" -Method Post -Body $body -ContentType "application/json"
    return @{
        prompt_id = $response.prompt_id
        seed = $SeedValue
    }
}

function Wait-ForCompletion {
    param([string]$PromptId, [int]$TimeoutSeconds = 300)

    $elapsed = 0
    $pollInterval = 2

    while ($elapsed -lt $TimeoutSeconds) {
        Start-Sleep -Seconds $pollInterval
        $elapsed += $pollInterval

        try {
            $history = Invoke-RestMethod -Uri "$ComfyUrl/history/$PromptId" -Method Get
            if ($history.PSObject.Properties[$PromptId]) {
                $entry = $history.$PromptId
                if ($entry.status.completed -eq $true -or $entry.outputs) {
                    return $entry
                }
                if ($entry.status.status_str -eq "error") {
                    Write-Host "[ERROR] Generation failed: $($entry.status | ConvertTo-Json -Compress)" -ForegroundColor Red
                    return $null
                }
            }
        } catch {
            # History not ready yet, keep polling
        }

        $pct = [math]::Min(100, [math]::Round($elapsed / $TimeoutSeconds * 100))
        Write-Host "`r  Generating... ${elapsed}s elapsed ($pct%)" -NoNewline
    }

    Write-Host ""
    Write-Host "[ERROR] Timeout after ${TimeoutSeconds}s" -ForegroundColor Red
    return $null
}

function Save-GeneratedImage {
    param(
        [PSObject]$HistoryEntry,
        [string]$OutputDirectory,
        [string]$PromptText,
        [int]$SeedValue,
        [string]$WorkflowName
    )

    if (-not (Test-Path $OutputDirectory)) {
        New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    }

    # Find output images from all SaveImage nodes
    $savedFiles = @()
    foreach ($nodeId in $HistoryEntry.outputs.PSObject.Properties.Name) {
        $nodeOutput = $HistoryEntry.outputs.$nodeId
        if ($nodeOutput.images) {
            foreach ($img in $nodeOutput.images) {
                $filename = $img.filename
                $subfolder = $img.subfolder

                # Download image
                $viewUrl = "$ComfyUrl/view?filename=$filename"
                if ($subfolder) { $viewUrl += "&subfolder=$subfolder" }

                $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
                $safeName = ($PromptText -replace '[^a-zA-Z0-9_]', '_').Substring(0, [math]::Min(40, $PromptText.Length))
                $outFilename = "${timestamp}_${safeName}"
                $pngPath = Join-Path $OutputDirectory "$outFilename.png"
                $jsonPath = Join-Path $OutputDirectory "$outFilename.json"

                Invoke-WebRequest -Uri $viewUrl -OutFile $pngPath

                # Save metadata
                $metadata = @{
                    prompt       = $PromptText
                    seed         = $SeedValue
                    workflow     = $WorkflowName
                    model        = "dreamshaper_8.safetensors"
                    timestamp    = (Get-Date -Format "o")
                    source_file  = $filename
                    output_png   = (Split-Path $pngPath -Leaf)
                } | ConvertTo-Json -Depth 5

                $metadata | Out-File -FilePath $jsonPath -Encoding utf8

                $savedFiles += $pngPath
                Write-Host "  Saved: $pngPath" -ForegroundColor Cyan
            }
        }
    }

    return $savedFiles
}

# --- Main ---
Write-Host "=== Pirates Chronicles - Asset Generator ===" -ForegroundColor Magenta
Write-Host ""

# Check ComfyUI connectivity
if (-not (Test-ComfyUI)) {
    exit 1
}

# Load workflow
if (-not (Test-Path $Workflow)) {
    Write-Host "[ERROR] Workflow not found: $Workflow" -ForegroundColor Red
    exit 1
}
$workflowJson = Get-Content $Workflow -Raw | ConvertFrom-Json
$workflowHash = @{}
foreach ($prop in $workflowJson.PSObject.Properties) {
    $workflowHash[$prop.Name] = $prop.Value
}
$workflowName = Split-Path $Workflow -Leaf
Write-Host "Workflow: $workflowName"
Write-Host "Output:   $OutputDir"
Write-Host ""

# Build prompt list
$prompts = @()
if ($PromptsFile) {
    if (-not (Test-Path $PromptsFile)) {
        Write-Host "[ERROR] Prompts file not found: $PromptsFile" -ForegroundColor Red
        exit 1
    }
    $prompts = Get-Content $PromptsFile | Where-Object { $_ -and $_ -notmatch '^\s*#' } | ForEach-Object { $_.Trim() }
    Write-Host "Batch mode: $($prompts.Count) prompts from $(Split-Path $PromptsFile -Leaf)"
} elseif ($Prompt) {
    $prompts = @($Prompt)
} else {
    Write-Host "[ERROR] Specify -Prompt or -PromptsFile" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Generate
$total = $prompts.Count
$success = 0
$failed = 0

for ($i = 0; $i -lt $total; $i++) {
    $currentPrompt = $prompts[$i]
    Write-Host "[$($i+1)/$total] `"$currentPrompt`"" -ForegroundColor White

    try {
        $result = Send-Prompt -WorkflowData $workflowHash -PromptText $currentPrompt -SeedValue $Seed
        Write-Host "  Prompt ID: $($result.prompt_id) | Seed: $($result.seed)"

        $history = Wait-ForCompletion -PromptId $result.prompt_id
        Write-Host ""

        if ($history) {
            $files = Save-GeneratedImage `
                -HistoryEntry $history `
                -OutputDirectory $OutputDir `
                -PromptText $currentPrompt `
                -SeedValue $result.seed `
                -WorkflowName $workflowName
            $success++
        } else {
            $failed++
        }
    } catch {
        Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }

    Write-Host ""
}

# Summary
Write-Host "=== Done ===" -ForegroundColor Magenta
Write-Host "  Success: $success / $total"
if ($failed -gt 0) {
    Write-Host "  Failed:  $failed" -ForegroundColor Red
}
