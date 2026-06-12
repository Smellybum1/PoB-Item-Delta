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

function Get-Sha256Hex {
  param([string]$Path)

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $stream = [System.IO.File]::OpenRead($resolvedPath)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return (($sha256.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Read-ReleaseDraft {
  param([string]$Path)

  $text = Get-Content -Path $Path -Raw
  $pattern = '(?s)## Release Notes Draft.*?Title:\s*```text\s*(.*?)\s*```.*?Body:\s*```markdown\s*(.*?)\s*```'
  $match = [regex]::Match($text, $pattern)
  if (-not $match.Success) {
    throw "Could not find the release title/body draft in $Path."
  }

  return [ordered]@{
    title = $match.Groups[1].Value.Trim()
    body = $match.Groups[2].Value.Trim()
  }
}

function Read-ReleaseAssets {
  param(
    [string]$RepoRoot,
    [string]$ReleaseVersion
  )

  $assetPaths = @(
    (Join-Path $RepoRoot "output/releases/PoB-Item-Delta-$ReleaseVersion-portable-win-x64.zip"),
    (Join-Path $RepoRoot "output/releases/PoB-Item-Delta-$ReleaseVersion.zip")
  )

  return @(
    foreach ($assetPath in $assetPaths) {
      if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
        throw "Release asset not found: $assetPath"
      }
      $item = Get-Item -LiteralPath $assetPath
      [ordered]@{
        name = $item.Name
        path = $item.FullName
        sizeBytes = $item.Length
        size = Format-Bytes -Bytes $item.Length
        sha256 = Get-Sha256Hex -Path $assetPath
      }
    }
  )
}

function New-ChecksumMarkdown {
  param([object[]]$Assets)

  $lines = @(
    "Checksums:",
    "",
    "| Asset | Size | SHA256 |",
    "| --- | ---: | --- |"
  )
  foreach ($asset in $Assets) {
    $lines += "| ``$($asset.name)`` | $($asset.size) | ``$($asset.sha256)`` |"
  }
  return $lines -join "`n"
}

$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packageJson = Get-Content -Path (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$releaseVersion = if ($Version) { $Version } else { [string]$packageJson.version }
$draft = Read-ReleaseDraft -Path (Join-Path $repoRoot "docs/github-release.md")
$assets = Read-ReleaseAssets -RepoRoot $repoRoot -ReleaseVersion $releaseVersion
$checksumMarkdown = New-ChecksumMarkdown -Assets $assets
$body = "$($draft.body)`n`n$checksumMarkdown"

$result = [ordered]@{
  version = $releaseVersion
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  title = $draft.title
  body = $body
  assets = $assets
}

if ($Json) {
  $result | ConvertTo-Json -Depth 5
  return
}

Write-Host "# $($draft.title)"
Write-Host ""
Write-Host $body
Write-Host ""
Write-Host "Attach these files to the GitHub release:"
foreach ($asset in $assets) {
  Write-Host "- $($asset.path)"
}
Write-Host ""
Write-Host "Do not commit the output/ folder."
