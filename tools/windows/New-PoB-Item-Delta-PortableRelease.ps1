param(
  [string]$NodeVersion = "v24.16.0",
  [string]$NodeBaseUrl = "https://nodejs.org/dist",
  [string]$NodeCacheDir = "output/node-runtime-cache",
  [string]$OutputDir = "output/releases",
  [string]$PackageSuffix = "portable-win-x64",
  [switch]$ForceDownload,
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[PoB Item Delta Portable Release] $Message"
}

function Assert-ChildPath {
  param(
    [string]$Parent,
    [string]$Child
  )
  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $childPath = [System.IO.Path]::GetFullPath($Child)
  if (-not $childPath.StartsWith($parentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside expected folder: $childPath"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$nodeVersionValue = if ($NodeVersion.StartsWith("v", [System.StringComparison]::OrdinalIgnoreCase)) { $NodeVersion } else { "v$NodeVersion" }
$nodeZipName = "node-$nodeVersionValue-win-x64.zip"
$cacheRoot = Join-Path $repoRoot $NodeCacheDir
$zipPath = Join-Path $cacheRoot $nodeZipName
$shasumsPath = Join-Path $cacheRoot "SHASUMS256.txt"

Assert-ChildPath -Parent (Join-Path $repoRoot "output") -Child $cacheRoot
New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

$nodeVersionUrl = "$($NodeBaseUrl.TrimEnd('/'))/$nodeVersionValue"

if ($ForceDownload -or -not (Test-Path -LiteralPath $zipPath -PathType Leaf)) {
  Write-Step "Downloading official Node.js runtime $nodeZipName..."
  Invoke-WebRequest -Uri "$nodeVersionUrl/$nodeZipName" -OutFile $zipPath
} else {
  Write-Step "Using cached Node.js runtime $zipPath"
}

Write-Step "Downloading official SHA256 checksums..."
Invoke-WebRequest -Uri "$nodeVersionUrl/SHASUMS256.txt" -OutFile $shasumsPath

$expectedHash = Get-Content -Path $shasumsPath |
  Where-Object { $_ -match "\s$([regex]::Escape($nodeZipName))$" } |
  ForEach-Object { ($_ -split '\s+')[0] } |
  Select-Object -First 1

if (-not $expectedHash) {
  throw "Could not find $nodeZipName in official SHASUMS256.txt."
}

$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash.ToLowerInvariant()) {
  throw "SHA256 mismatch for $nodeZipName. Expected $expectedHash, got $actualHash."
}

Write-Step "Verified SHA256 $actualHash"

$releaseScript = Join-Path $PSScriptRoot "New-PoB-Item-Delta-Release.ps1"
$releaseArgs = @{
  IncludeNodeModules = $true
  PortableNodeZipPath = $zipPath
  PackageSuffix = $PackageSuffix
  OutputDir = $OutputDir
}
if ($SkipBuild) {
  $releaseArgs.SkipBuild = $true
}

Write-Step "Building portable release artifact..."
& $releaseScript @releaseArgs
if ($LASTEXITCODE -ne 0) {
  throw "Portable release packaging failed with exit code $LASTEXITCODE."
}
