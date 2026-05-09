#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Build and (optionally) run the `modal secret create hoops-hype-studio --force`
  command using values from .env.

.DESCRIPTION
  Reads .env from the repo root, pulls the storage + OpenAI keys, and assembles
  the full 7-key Modal secret-create command. Pass -Run to execute it; default
  prints the command for review (useful in CI or when the user wants to copy
  into a different shell).

.PARAMETER Token
  Override the GPU_WORKER_TOKEN value. If not provided, the script:
    1. Tries the GPU_WORKER_TOKEN line in .env (if present).
    2. Falls back to generating a fresh 32-hex-char token.
  The chosen token is always echoed so you can paste it into Netlify.

.PARAMETER Run
  Actually execute the modal CLI command. Without this flag the script only
  prints what it WOULD run.

.PARAMETER EnvFile
  Path to the .env file. Defaults to ./.env in the script's directory.

.EXAMPLE
  ./setup-modal-secret.ps1
    Prints the command for review without executing.

.EXAMPLE
  ./setup-modal-secret.ps1 -Run
    Creates/updates the Modal secret using values from .env.

.EXAMPLE
  ./setup-modal-secret.ps1 -Token ece4649b403e6b03c5c9850ec98239d4c0d622ce621ff62fdc5f7238cd97b124 -Run
    Creates/updates the secret with a specific token (e.g. one already in Netlify).

.NOTES
  Requires Modal CLI: `pip install modal && modal token new`
  After running this with -Run, follow up with:
    modal deploy workers/modal/modal_app.py
  Then set GPU_WORKER_BASE_URL + GPU_WORKER_TOKEN in the Netlify dashboard.
#>

[CmdletBinding()]
param(
  [string]$Token,
  [switch]$Run,
  [string]$EnvFile = (Join-Path $PSScriptRoot '.env')
)

$ErrorActionPreference = 'Stop'

function Read-EnvFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw ".env not found at $Path. Pass -EnvFile to override."
  }
  $env = @{}
  foreach ($line in (Get-Content -LiteralPath $Path)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $eq = $trimmed.IndexOf('=')
    if ($eq -lt 1) { continue }
    $key = $trimmed.Substring(0, $eq).Trim()
    $val = $trimmed.Substring($eq + 1).Trim()
    # Strip matching surrounding quotes
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or
        ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $env[$key] = $val
  }
  return $env
}

function New-RandomToken {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

Write-Host '================================================' -ForegroundColor Cyan
Write-Host 'Hoops Hype Studio - Modal Secret Setup' -ForegroundColor Cyan
Write-Host '================================================' -ForegroundColor Cyan
Write-Host ''

$envVars = Read-EnvFile -Path $EnvFile

# Resolve GPU_WORKER_TOKEN: param > .env > generate
if ($Token) {
  $resolvedToken = $Token
  Write-Host "Using GPU_WORKER_TOKEN from -Token parameter." -ForegroundColor Green
} elseif ($envVars.ContainsKey('GPU_WORKER_TOKEN') -and $envVars['GPU_WORKER_TOKEN']) {
  $resolvedToken = $envVars['GPU_WORKER_TOKEN']
  Write-Host 'Using GPU_WORKER_TOKEN from .env.' -ForegroundColor Green
} else {
  $resolvedToken = New-RandomToken
  Write-Host 'Generated fresh GPU_WORKER_TOKEN (.env did not have one).' -ForegroundColor Yellow
}

# The 8 keys we forward into the Modal secret. UPSTASH_* are required for
# real progress reporting (Modal writes job:<id>:progress directly to Redis
# so the UI gets honest numbers instead of the simulated elapsed-vs-randomMs
# fake). Without them the render still works; the UI just falls back to the
# old simulated progress.
$required = @(
  'STORAGE_BUCKET',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'STORAGE_ENDPOINT',
  'OPENAI_API_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN'
)
$missing = $required | Where-Object { -not $envVars.ContainsKey($_) -or -not $envVars[$_] }
if ($missing) {
  Write-Host "ERROR: .env is missing required keys: $($missing -join ', ')" -ForegroundColor Red
  Write-Host "Fill them in $EnvFile and re-run." -ForegroundColor Red
  exit 1
}

# Build the modal CLI argument list. Use --force so the script is idempotent
# and safe to re-run when rotating the token.
$args = @(
  'secret', 'create', 'hoops-hype-studio', '--force',
  "GPU_WORKER_TOKEN=$resolvedToken",
  "STORAGE_BUCKET=$($envVars['STORAGE_BUCKET'])",
  "STORAGE_REGION=$($envVars['STORAGE_REGION'])",
  "STORAGE_ACCESS_KEY=$($envVars['STORAGE_ACCESS_KEY'])",
  "STORAGE_SECRET_KEY=$($envVars['STORAGE_SECRET_KEY'])",
  "STORAGE_ENDPOINT=$($envVars['STORAGE_ENDPOINT'])",
  "OPENAI_API_KEY=$($envVars['OPENAI_API_KEY'])",
  "UPSTASH_REDIS_REST_URL=$($envVars['UPSTASH_REDIS_REST_URL'])",
  "UPSTASH_REDIS_REST_TOKEN=$($envVars['UPSTASH_REDIS_REST_TOKEN'])"
)

Write-Host ''
Write-Host 'Command:' -ForegroundColor Cyan
Write-Host "  modal $($args -join ' ' -replace [regex]::Escape($resolvedToken), '<token>' )" -ForegroundColor DarkGray
Write-Host ''
Write-Host "GPU_WORKER_TOKEN to copy into Netlify:" -ForegroundColor Cyan
Write-Host "  $resolvedToken" -ForegroundColor Yellow
Write-Host ''

if (-not $Run) {
  Write-Host 'Dry run only. Re-run with -Run to actually create the secret.' -ForegroundColor Yellow
  exit 0
}

# Execute. Prefer the `modal` exe if it's on PATH; otherwise fall back to
# `python -m modal` (the user-Scripts dir is often not on Windows PATH after
# `pip install modal`).
$useModule = $false
if (-not (Get-Command modal -ErrorAction SilentlyContinue)) {
  $useModule = $true
  Write-Host '`modal` not on PATH; invoking via `python -m modal`.' -ForegroundColor Yellow
}
Write-Host 'Running modal secret create --force ...' -ForegroundColor Cyan
if ($useModule) {
  & python -m modal @args
} else {
  & modal @args
}
$exit = $LASTEXITCODE
if ($exit -ne 0) {
  Write-Host "modal CLI exited with code $exit" -ForegroundColor Red
  exit $exit
}

Write-Host ''
Write-Host 'Secret created/updated.' -ForegroundColor Green
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Cyan
Write-Host '  1. Redeploy the worker so it picks up the new secret values:'
Write-Host '       modal deploy workers/modal/modal_app.py'
Write-Host '  2. In the Netlify dashboard set:'
Write-Host '       GPU_WORKER_BASE_URL = (URL printed by modal deploy)'
Write-Host "       GPU_WORKER_TOKEN    = $resolvedToken"
Write-Host '  3. Trigger a Netlify redeploy so functions reload the env.'
Write-Host '  4. Smoke test:'
Write-Host '       curl -X POST $GPU_WORKER_BASE_URL/highlights \'
Write-Host '         -H "authorization: Bearer $GPU_WORKER_TOKEN" \'
Write-Host '         -H "content-type: application/json" \'
Write-Host '         -d ''{"assetId":"smoke","proxyUrl":"https://example.com/x.mp4"}'''
