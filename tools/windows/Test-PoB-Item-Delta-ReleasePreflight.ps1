param(
  [string]$ZipPath,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  if (-not $Json) {
    Write-Host "[PoB Item Delta Preflight] $Message"
  }
}

function Convert-ToRelativePath {
  param(
    [string]$Root,
    [string]$Path
  )

  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path is outside the repository: $fullPath"
  }
  return ($fullPath.Substring($rootPath.Length) -replace '\\', '/')
}

function Test-ReleaseExcludedPath {
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

function Test-ForbiddenReleasePath {
  param(
    [string]$RelativePath,
    [switch]$AllowRootNodeModules
  )
  $normalized = $RelativePath -replace '\\', '/'
  $segments = $normalized -split '/'
  $leaf = Split-Path -Leaf $normalized
  $isBundledNodeRuntimePath = $normalized.StartsWith("runtime/node/", [System.StringComparison]::OrdinalIgnoreCase)

  foreach ($segment in $segments) {
    if ($segment -eq "node_modules") {
      $isBundledNodeRuntime = $normalized.StartsWith("runtime/node/node_modules/", [System.StringComparison]::OrdinalIgnoreCase)
      $isIntentionalRootNodeModules = $AllowRootNodeModules -and $normalized.StartsWith("node_modules/", [System.StringComparison]::OrdinalIgnoreCase)
      if (-not $isBundledNodeRuntime -and -not $isIntentionalRootNodeModules) {
        return $true
      }
      continue
    }

    if ($isBundledNodeRuntimePath -and $segment -eq "output") {
      continue
    }

    if (@(".git", ".playwright-cli", "output", "tmp", "temp", ".cache", "pob-user-data") -contains $segment) {
      return $true
    }
  }

  if ($leaf -like ".env*" -or $leaf -like "*.log" -or $leaf -ieq "Settings.xml") {
    return $true
  }

  if ($normalized -like "fixtures/private/*" -or $normalized -like "fixtures/local/*") {
    return $true
  }

  if ($leaf -like "*.xml" -and -not $normalized.StartsWith("apps/server/src/__fixtures__/", [System.StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }

  return $false
}

function Assert-NoForbiddenPaths {
  param(
    [string[]]$Paths,
    [string]$Scope,
    [switch]$AllowRootNodeModules
  )

  $forbidden = @($Paths | Where-Object { Test-ForbiddenReleasePath -RelativePath $_ -AllowRootNodeModules:$AllowRootNodeModules })
  if ($forbidden.Count -gt 0) {
    throw "$Scope contains forbidden local/private paths:`n$($forbidden -join "`n")"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packageJson = Get-Content -Path (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
$defaultZipPath = Join-Path $repoRoot "output/releases/PoB-Item-Delta-$version.zip"
if (-not $ZipPath) {
  $ZipPath = $defaultZipPath
}
$resolvedZipPath = if (Test-Path -LiteralPath $ZipPath) { (Resolve-Path -LiteralPath $ZipPath).Path } else { $ZipPath }

Write-Step "Checking repository files..."

$requiredRepoPaths = @(
  ".gitignore",
  "AGENTS.md",
  "CHANGELOG.md",
  "README.md",
  "ROADMAP.md",
  "START_HERE.md",
  "docs/build-coverage-scan.md",
  "docs/coc-model-validation.md",
  "docs/github-release.md",
  "docs/release-qa.md",
  "docs/release-preflight.md",
  "docs/windows-launcher.md",
  "docs/ai/project.md",
  "docs/ai/release-qa-2026-06-11.md",
  "docs/ai/release-qa-2026-06-12-support-inspectors.md",
  ".github/workflows/ci.yml",
  ".github/ISSUE_TEMPLATE/build-validation.md",
  ".github/ISSUE_TEMPLATE/item-paste-failed.md",
  "apps/server/src/__tests__/buildCoverage.test.ts",
  "apps/server/src/pob/buildCoverage.ts",
  "apps/server/src/pob/buildValidationReport.ts",
  "apps/server/src/pob/cocValidationReport.ts",
  "apps/server/src/pob/itemTextReport.ts",
  "apps/server/src/tools/inspectBuildValidationReport.ts",
  "apps/server/src/tools/inspectCocValidationReport.ts",
  "apps/server/src/tools/inspectItemTextReport.ts",
  "tools/windows/Get-PoB-Item-Delta-GitHubReleaseNotes.ps1",
  "tools/windows/Get-PoB-Item-Delta-PublishPacket.ps1",
  "tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1",
  "tools/windows/New-PoB-Item-Delta-PortableRelease.ps1",
  "tools/windows/New-PoB-Item-Delta-Release.ps1",
  "tools/windows/Start-PoB-Item-Delta.cmd",
  "tools/windows/Stop-PoB-Item-Delta.cmd",
  "tools/windows/Test-PoB-BuildCoverage.ps1",
  "tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1",
  "tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1"
)

$missingRepoPaths = @($requiredRepoPaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $repoRoot $_)) })
if ($missingRepoPaths.Count -gt 0) {
  throw "Repository is missing release-required files:`n$($missingRepoPaths -join "`n")"
}

$candidateWorkspaceFiles = @(
  Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force |
    ForEach-Object { Convert-ToRelativePath -Root $repoRoot -Path $_.FullName } |
    Where-Object { -not (Test-ReleaseExcludedPath $_) }
)
Assert-NoForbiddenPaths -Paths $candidateWorkspaceFiles -Scope "Release candidate workspace"

Write-Step "Checking release zip..."
if (-not (Test-Path -LiteralPath $resolvedZipPath -PathType Leaf)) {
  throw "Release zip not found: $resolvedZipPath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedZipPath)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName -replace '\\', '/' })
} finally {
  $archive.Dispose()
}

$requiredArchiveEntries = @(
  "README.md",
  "START_HERE.md",
  "CHANGELOG.md",
  "ROADMAP.md",
  "docs/build-coverage-scan.md",
  "docs/coc-model-validation.md",
  "docs/github-release.md",
  "docs/release-qa.md",
  "docs/release-preflight.md",
  "docs/windows-launcher.md",
  "docs/ai/release-qa-2026-06-11.md",
  "docs/ai/release-qa-2026-06-12-support-inspectors.md",
  "tools/windows/Get-PoB-Item-Delta-GitHubReleaseNotes.ps1",
  "tools/windows/Get-PoB-Item-Delta-PublishPacket.ps1",
  "tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1",
  "tools/windows/New-PoB-Item-Delta-PortableRelease.ps1",
  "tools/windows/New-PoB-Item-Delta-Release.ps1",
  "tools/windows/Start-PoB-Item-Delta.cmd",
  "tools/windows/Stop-PoB-Item-Delta.cmd",
  "tools/windows/Test-PoB-BuildCoverage.ps1",
  "tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1",
  "tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1",
  "apps/web/dist/index.html",
  "apps/server/dist/index.js",
  "apps/server/dist/pob/buildCoverage.js",
  "apps/server/dist/tools/inspectBuildValidationReport.js",
  "apps/server/dist/tools/inspectCocValidationReport.js",
  "apps/server/dist/tools/inspectItemTextReport.js",
  "apps/server/src/__tests__/buildCoverage.test.ts",
  "apps/server/src/pob/buildCoverage.ts",
  "packages/shared/dist/index.js",
  "release-manifest.json",
  "package.json",
  "package-lock.json"
)

$missingArchiveEntries = @($requiredArchiveEntries | Where-Object { $entries -notcontains $_ })
if ($missingArchiveEntries.Count -gt 0) {
  throw "Release zip is missing expected entries:`n$($missingArchiveEntries -join "`n")"
}

if (-not @($entries | Where-Object { $_ -like "apps/web/dist/assets/*.js" }).Count) {
  throw "Release zip does not include built web JavaScript assets."
}
if (-not @($entries | Where-Object { $_ -like "apps/web/dist/assets/*.css" }).Count) {
  throw "Release zip does not include built web CSS assets."
}

$manifestEntry = $entries | Where-Object { $_ -eq "release-manifest.json" } | Select-Object -First 1
if (-not $manifestEntry) {
  throw "release-manifest.json missing from archive."
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedZipPath)
try {
  $manifestStream = ($archive.Entries | Where-Object { $_.FullName -replace '\\', '/' -eq "release-manifest.json" } | Select-Object -First 1).Open()
  try {
    $reader = [System.IO.StreamReader]::new($manifestStream)
    try {
      $manifest = $reader.ReadToEnd() | ConvertFrom-Json
    } finally {
      $reader.Dispose()
    }
  } finally {
    $manifestStream.Dispose()
  }
} finally {
  $archive.Dispose()
}

if ([string]$manifest.version -ne $version) {
  throw "Manifest version '$($manifest.version)' does not match package version '$version'."
}
if ([string]$manifest.localUrl -ne "http://127.0.0.1:5174") {
  throw "Manifest localUrl should be http://127.0.0.1:5174."
}
$includesNodeModules = [bool]$manifest.includesNodeModules
$includesPortableNode = [bool]$manifest.includesPortableNode
if ($manifest.nodeRequired -ne (-not $includesPortableNode)) {
  throw "Manifest Node required flag is inconsistent with portable runtime flag."
}

Assert-NoForbiddenPaths -Paths $entries -Scope "Release zip" -AllowRootNodeModules:$includesNodeModules

if ($includesPortableNode) {
  if ($entries -notcontains "runtime/node/node.exe") {
    throw "Manifest says portable Node is included, but runtime/node/node.exe is missing."
  }
  if (-not @($entries | Where-Object { $_ -like "runtime/node/npm*" -or $_ -like "runtime/node/node_modules/npm/*" }).Count) {
    throw "Portable Node runtime is missing npm files."
  }
}

if ($includesNodeModules) {
  foreach ($requiredNodeModuleEntry in @("node_modules/express/package.json", "node_modules/fast-xml-parser/package.json", "node_modules/@pob-item-delta/shared/package.json")) {
    if ($entries -notcontains $requiredNodeModuleEntry) {
      throw "Manifest says node_modules are included, but $requiredNodeModuleEntry is missing."
    }
  }
}

$readme = Get-Content -Path (Join-Path $repoRoot "README.md") -Raw
if ($readme -notmatch "127\.0\.0\.1" -or ($readme -notmatch "does not upload" -and $readme -notmatch "stay on your computer")) {
  throw "README local-only/privacy wording is missing expected phrases."
}

$result = [ordered]@{
  status = "pass"
  version = $version
  zipPath = $resolvedZipPath
  archiveEntries = $entries.Count
  requiredRepoFiles = $requiredRepoPaths.Count
  requiredArchiveEntries = $requiredArchiveEntries.Count
  zipSizeBytes = (Get-Item -LiteralPath $resolvedZipPath).Length
}

if ($Json) {
  $result | ConvertTo-Json
} else {
  Write-Step "Preflight passed."
  $result | Format-List
}
