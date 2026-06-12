param(
  [string]$Version,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Format-Bytes {
  param([long]$Bytes)
  if ($Bytes -ge 1GB) {
    return "{0:N2} GB" -f ($Bytes / 1GB)
  }
  if ($Bytes -ge 1MB) {
    return "{0:N2} MB" -f ($Bytes / 1MB)
  }
  if ($Bytes -ge 1KB) {
    return "{0:N2} KB" -f ($Bytes / 1KB)
  }
  return "$Bytes B"
}

$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packageJson = Get-Content -Path (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
if ($Version) {
  $releaseVersion = $Version
} else {
  $releaseVersion = [string]$packageJson.version
}

$assetPaths = @(
  (Join-Path $repoRoot "output/releases/PoB-Item-Delta-$releaseVersion-portable-win-x64.zip"),
  (Join-Path $repoRoot "output/releases/PoB-Item-Delta-$releaseVersion.zip")
)

$assets = @(
  foreach ($assetPath in $assetPaths) {
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
      throw "Release asset not found: $assetPath"
    }
    $item = Get-Item -LiteralPath $assetPath
    $hash = Get-FileHash -LiteralPath $assetPath -Algorithm SHA256
    [ordered]@{
      name = $item.Name
      path = $item.FullName
      sizeBytes = $item.Length
      size = Format-Bytes -Bytes $item.Length
      sha256 = $hash.Hash.ToLowerInvariant()
      lastWriteTimeUtc = $item.LastWriteTimeUtc.ToString("o")
    }
  }
)

$result = [ordered]@{
  version = $releaseVersion
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  assets = $assets
}

if ($Json) {
  $result | ConvertTo-Json -Depth 5
  exit 0
}

Write-Host "# PoB Item Delta $releaseVersion Release Assets"
Write-Host ""
Write-Host "| Asset | Size | SHA256 |"
Write-Host "| --- | ---: | --- |"
foreach ($asset in $assets) {
  Write-Host "| ``$($asset.name)`` | $($asset.size) | ``$($asset.sha256)`` |"
}
Write-Host ""
Write-Host "Attach these files to the GitHub release. Do not commit the ``output/`` folder."
