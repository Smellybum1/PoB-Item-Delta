param(
  [string]$Version,
  [string]$OutputDir = "output/releases",
  [string]$PackageSuffix,
  [switch]$IncludeNodeModules,
  [string]$PortableNodePath,
  [string]$PortableNodeZipPath,
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[PoB Item Delta Release] $Message"
}

function Assert-ChildPath {
  param(
    [string]$Parent,
    [string]$Child
  )
  $parentPath = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\', '/')
  $childPath = [System.IO.Path]::GetFullPath($Child)
  if (-not $childPath.StartsWith($parentPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside expected folder: $childPath"
  }
}

function Invoke-Npm {
  param([string[]]$Arguments)
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Test-ExcludedPath {
  param([string]$RelativePath)
  $segments = $RelativePath -split '[\\/]'
  $excludedSegments = @(".git", ".playwright-cli", "node_modules", "output", "tmp")
  foreach ($segment in $segments) {
    if ($excludedSegments -contains $segment) {
      return $true
    }
  }
  if ($RelativePath -like "*.tsbuildinfo") {
    return $true
  }
  return $false
}

function Copy-ReleaseItem {
  param(
    [string]$SourcePath,
    [string]$RelativePath,
    [string]$DestinationRoot
  )
  $destinationPath = Join-Path $DestinationRoot $RelativePath
  $destinationParent = Split-Path -Parent $destinationPath
  if ($destinationParent) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }
  Copy-Item -LiteralPath $SourcePath -Destination $destinationPath -Force
}

function Copy-ReleaseDirectory {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  if (Test-Path -LiteralPath $DestinationPath) {
    Remove-Item -LiteralPath $DestinationPath -Recurse -Force
  }
  $destinationParent = Split-Path -Parent $DestinationPath
  if ($destinationParent) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }
  Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Recurse -Force
}

function Copy-WorkspacePackageIntoNodeModules {
  param(
    [string]$PackageName,
    [string]$SourceRelativePath,
    [string]$DestinationRoot
  )

  $scopeRoot = Join-Path $DestinationRoot "node_modules\@pob-item-delta"
  $sourcePath = Join-Path $DestinationRoot $SourceRelativePath
  $destinationPath = Join-Path $scopeRoot $PackageName

  Assert-ChildPath -Parent $DestinationRoot -Child $sourcePath
  Assert-ChildPath -Parent $DestinationRoot -Child $destinationPath

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Workspace package source is missing: $sourcePath"
  }

  New-Item -ItemType Directory -Force -Path $scopeRoot | Out-Null
  if (Test-Path -LiteralPath $destinationPath) {
    Remove-Item -LiteralPath $destinationPath -Recurse -Force
  }
  Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
}

function Remove-WorkspacePackageFromNodeModules {
  param(
    [string]$PackageName,
    [string]$DestinationRoot
  )

  $destinationPath = Join-Path $DestinationRoot "node_modules\@pob-item-delta\$PackageName"
  Assert-ChildPath -Parent $DestinationRoot -Child $destinationPath
  if (Test-Path -LiteralPath $destinationPath) {
    Remove-Item -LiteralPath $destinationPath -Recurse -Force
  }
}

function Add-PortableNodeFromZip {
  param(
    [string]$ZipPath,
    [string]$DestinationRoot
  )

  $resolvedZipPath = (Resolve-Path -LiteralPath $ZipPath).Path
  $runtimeRoot = Join-Path $DestinationRoot "runtime"
  $extractRoot = Join-Path $runtimeRoot "node-extract"
  $nodeDestination = Join-Path $runtimeRoot "node"

  if (Test-Path -LiteralPath $nodeDestination) {
    Remove-Item -LiteralPath $nodeDestination -Recurse -Force
  }
  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null

  Expand-Archive -LiteralPath $resolvedZipPath -DestinationPath $extractRoot -Force
  $nodeRoot = Get-ChildItem -LiteralPath $extractRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName "node.exe") -PathType Leaf } |
    Select-Object -First 1
  if (-not $nodeRoot) {
    throw "Portable Node zip did not contain a top-level folder with node.exe: $resolvedZipPath"
  }

  Move-Item -LiteralPath $nodeRoot.FullName -Destination $nodeDestination
  Remove-Item -LiteralPath $extractRoot -Recurse -Force
}

function Add-PortableNodeFromFolder {
  param(
    [string]$SourcePath,
    [string]$DestinationRoot
  )

  $resolvedSourcePath = (Resolve-Path -LiteralPath $SourcePath).Path
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedSourcePath "node.exe") -PathType Leaf)) {
    throw "Portable Node folder must contain node.exe: $resolvedSourcePath"
  }
  Copy-ReleaseDirectory -SourcePath $resolvedSourcePath -DestinationPath (Join-Path $DestinationRoot "runtime\node")
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$repoRootPrefix = $repoRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$packageJson = Get-Content -Path (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$releaseVersion = if ($Version) { $Version } else { [string]$packageJson.version }
$safeVersion = $releaseVersion -replace '[^A-Za-z0-9._-]', '-'
$safePackageSuffix = if ($PackageSuffix) { $PackageSuffix -replace '[^A-Za-z0-9._-]', '-' } else { "" }
$releaseName = if ($safePackageSuffix) { "PoB-Item-Delta-$safeVersion-$safePackageSuffix" } else { "PoB-Item-Delta-$safeVersion" }
$releaseRoot = Join-Path $repoRoot $OutputDir
$stagingRoot = Join-Path $releaseRoot $releaseName
$zipPath = Join-Path $releaseRoot "$releaseName.zip"

if ($PortableNodePath -and $PortableNodeZipPath) {
  throw "Use either -PortableNodePath or -PortableNodeZipPath, not both."
}

Assert-ChildPath -Parent (Join-Path $repoRoot "output") -Child $releaseRoot
Assert-ChildPath -Parent $releaseRoot -Child $stagingRoot
Assert-ChildPath -Parent $releaseRoot -Child $zipPath

if (-not $SkipBuild) {
  Write-Step "Building app..."
  Push-Location $repoRoot
  try {
    Invoke-Npm @("run", "build")
  } finally {
    Pop-Location
  }
}

if (Test-Path $stagingRoot) {
  Write-Step "Removing previous staging folder..."
  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
if (Test-Path $zipPath) {
  Write-Step "Removing previous archive..."
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null

$rootFiles = @(
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "package-lock.json",
  "package.json",
  "README.md",
  "ROADMAP.md",
  "START_HERE.md",
  "tsconfig.base.json"
)

foreach ($file in $rootFiles) {
  $sourcePath = Join-Path $repoRoot $file
  if (Test-Path $sourcePath) {
    Copy-ReleaseItem -SourcePath $sourcePath -RelativePath $file -DestinationRoot $stagingRoot
  }
}

$includeDirs = @("apps", "docs", "packages", "tools")
foreach ($dir in $includeDirs) {
  $dirPath = Join-Path $repoRoot $dir
  if (-not (Test-Path $dirPath)) {
    continue
  }

  Get-ChildItem -LiteralPath $dirPath -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($repoRootPrefix.Length)
    if (-not (Test-ExcludedPath -RelativePath $relativePath)) {
      Copy-ReleaseItem -SourcePath $_.FullName -RelativePath $relativePath -DestinationRoot $stagingRoot
    }
  }
}

$portableNodeIncluded = $false
$portableNodeSource = $null
if ($PortableNodeZipPath) {
  Write-Step "Adding portable Node runtime from zip..."
  Add-PortableNodeFromZip -ZipPath $PortableNodeZipPath -DestinationRoot $stagingRoot
  $portableNodeIncluded = $true
  $portableNodeSource = "zip"
} elseif ($PortableNodePath) {
  Write-Step "Adding portable Node runtime from folder..."
  Add-PortableNodeFromFolder -SourcePath $PortableNodePath -DestinationRoot $stagingRoot
  $portableNodeIncluded = $true
  $portableNodeSource = "folder"
}

if ($IncludeNodeModules) {
  Write-Step "Installing staged production dependencies..."
  Push-Location $stagingRoot
  try {
    Invoke-Npm @("install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund")
  } finally {
    Pop-Location
  }

  Copy-WorkspacePackageIntoNodeModules -PackageName "shared" -SourceRelativePath "packages\shared" -DestinationRoot $stagingRoot
  Remove-WorkspacePackageFromNodeModules -PackageName "server" -DestinationRoot $stagingRoot
  Remove-WorkspacePackageFromNodeModules -PackageName "web" -DestinationRoot $stagingRoot
}

$manifestNotes = @()
if ($portableNodeIncluded) {
  $manifestNotes += "Run the start script on Windows. This zip includes a portable Node runtime."
} else {
  $manifestNotes += "Run the start script on Windows. Node.js LTS must be installed on PATH."
}
if ($IncludeNodeModules) {
  $manifestNotes += "This zip includes staged npm dependencies, so first launch should not need npm install."
} else {
  $manifestNotes += "The launcher installs npm dependencies if node_modules is missing."
}
$manifestNotes += "The app stays local on 127.0.0.1 and does not upload build or pasted item data."

$manifest = [ordered]@{
  name = "PoB Item Delta"
  version = $releaseVersion
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  localUrl = "http://127.0.0.1:5174"
  nodeRequired = -not $portableNodeIncluded
  includesNodeModules = [bool]$IncludeNodeModules
  includesPortableNode = $portableNodeIncluded
  portableNodeSource = $portableNodeSource
  start = "tools/windows/Start-PoB-Item-Delta.cmd"
  stop = "tools/windows/Stop-PoB-Item-Delta.cmd"
  notes = $manifestNotes
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $stagingRoot "release-manifest.json") -Encoding UTF8

Write-Step "Creating archive $zipPath..."
Compress-Archive -Path (Join-Path $stagingRoot "*") -DestinationPath $zipPath -CompressionLevel Optimal

$fileCount = (Get-ChildItem -LiteralPath $stagingRoot -Recurse -File).Count
$zipSizeBytes = (Get-Item -LiteralPath $zipPath).Length

Write-Step "Created $zipPath"
[ordered]@{
  releaseName = $releaseName
  stagingPath = $stagingRoot
  zipPath = $zipPath
  fileCount = $fileCount
  includesNodeModules = [bool]$IncludeNodeModules
  includesPortableNode = $portableNodeIncluded
  zipSizeBytes = $zipSizeBytes
} | ConvertTo-Json
