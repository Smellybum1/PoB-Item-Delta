param(
  [string]$Version,
  [switch]$Json,
  [switch]$SkipPreflight,
  [switch]$SkipRemote
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  if (-not $Json) {
    Write-Host "[PoB Item Delta Release Readiness] $Message"
  }
}

function Invoke-Git {
  param([string[]]$Arguments)
  $output = & git @Arguments 2>&1
  return [pscustomobject]@{
    ExitCode = $LASTEXITCODE
    Output = [string]($output -join "`n")
  }
}

function New-Check {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Message,
    [string]$Severity = "error",
    [object]$Details = $null
  )

  return [ordered]@{
    name = $Name
    passed = $Passed
    severity = $Severity
    message = $Message
    details = $Details
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

function Test-ExcludedFreshnessPath {
  param([string]$RelativePath)
  $segments = $RelativePath -split '[\\/]'
  foreach ($segment in $segments) {
    if (@(".git", ".playwright-cli", "node_modules", "output", "tmp", "temp", ".cache") -contains $segment) {
      return $true
    }
  }
  return $false
}

function Get-FilesNewerThan {
  param(
    [string]$Root,
    [datetime]$Timestamp
  )

  $threshold = $Timestamp.ToUniversalTime().AddSeconds(2)
  return @(
    Get-ChildItem -LiteralPath $Root -Recurse -File -Force |
      ForEach-Object {
        $relativePath = Convert-ToRelativePath -Root $Root -Path $_.FullName
        [pscustomobject]@{
          RelativePath = $relativePath
          LastWriteTimeUtc = $_.LastWriteTimeUtc
        }
      } |
      Where-Object { -not (Test-ExcludedFreshnessPath -RelativePath $_.RelativePath) -and $_.LastWriteTimeUtc -gt $threshold } |
      Sort-Object LastWriteTimeUtc -Descending |
      Select-Object -First 20
  )
}

function Get-GitStatusPath {
  param([string]$StatusLine)

  $trimmed = $StatusLine.Trim()
  if (-not $trimmed) {
    return $null
  }
  $path = if ($trimmed.Length -gt 3) { $trimmed.Substring(3).Trim() } else { $trimmed }
  if ($path -match " -> ") {
    $path = ($path -split " -> ")[-1].Trim()
  }
  return $path -replace '\\', '/'
}

function Test-GeneratedGitPath {
  param([string]$RelativePath)

  if (-not $RelativePath) {
    return $false
  }
  if ($RelativePath -like "output/*" -or $RelativePath -eq "output") {
    return $true
  }
  if ($RelativePath -like "node_modules/*" -or $RelativePath -eq "node_modules") {
    return $true
  }
  if ($RelativePath -like "*/node_modules/*") {
    return $true
  }
  if ($RelativePath -like "*/dist/*" -or $RelativePath -eq "dist") {
    return $true
  }
  return $false
}

function Invoke-PreflightJson {
  param(
    [string]$ScriptPath,
    [string]$ZipPath
  )

  if ($ZipPath) {
    $raw = & $ScriptPath -ZipPath $ZipPath -Json
  } else {
    $raw = & $ScriptPath -Json
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Preflight failed with exit code $LASTEXITCODE."
  }
  return $raw | ConvertFrom-Json
}

function Invoke-ReleaseNotesJson {
  param(
    [string]$ScriptPath,
    [string]$ReleaseVersion
  )

  $raw = & $ScriptPath -Version $ReleaseVersion -Json
  if ($LASTEXITCODE -ne 0) {
    throw "Release notes preview failed with exit code $LASTEXITCODE."
  }
  return $raw | ConvertFrom-Json
}

function Invoke-BuildCoverageSmokeJson {
  param(
    [string]$ScriptPath,
    [string]$FixturePath
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pob-item-delta-build-coverage-smoke-$([System.Guid]::NewGuid().ToString('N'))"
  try {
    $nestedPath = Join-Path $tempRoot "Nested"
    New-Item -ItemType Directory -Path $nestedPath -Force | Out-Null
    Copy-Item -LiteralPath $FixturePath -Destination (Join-Path $nestedPath "representative-build.xml")
    Set-Content -LiteralPath (Join-Path $tempRoot "bad.xml") -Value "not xml" -NoNewline

    $raw = & $ScriptPath -BuildsPath $tempRoot -Json
    if ($LASTEXITCODE -ne 0) {
      throw "Build coverage smoke failed with exit code $LASTEXITCODE."
    }
    return $raw | ConvertFrom-Json
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

function Invoke-BuildCoverageSmokeMarkdown {
  param(
    [string]$ScriptPath,
    [string]$FixturePath
  )

  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "pob-item-delta-build-coverage-markdown-smoke-$([System.Guid]::NewGuid().ToString('N'))"
  try {
    $nestedPath = Join-Path $tempRoot "Nested"
    New-Item -ItemType Directory -Path $nestedPath -Force | Out-Null
    Copy-Item -LiteralPath $FixturePath -Destination (Join-Path $nestedPath "representative-build.xml")
    Set-Content -LiteralPath (Join-Path $tempRoot "bad.xml") -Value "not xml" -NoNewline

    $raw = & $ScriptPath -BuildsPath $tempRoot -Markdown
    if ($LASTEXITCODE -ne 0) {
      throw "Build coverage Markdown smoke failed with exit code $LASTEXITCODE."
    }
    $markdown = [string]($raw -join "`n")
    if ($markdown.Contains($tempRoot)) {
      throw "Build coverage Markdown smoke leaked the absolute temp builds path."
    }
    return $markdown
  } finally {
    if (Test-Path -LiteralPath $tempRoot) {
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packageJsonPath = Join-Path $repoRoot "package.json"
$packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json
$releaseVersion = if ($Version) { $Version } else { [string]$packageJson.version }
$tagName = "v$releaseVersion"
$leanZipPath = Join-Path $repoRoot "output/releases/PoB-Item-Delta-$releaseVersion.zip"
$portableZipPath = Join-Path $repoRoot "output/releases/PoB-Item-Delta-$releaseVersion-portable-win-x64.zip"
$preflightScript = Join-Path $repoRoot "tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1"
$releaseNotesScript = Join-Path $repoRoot "tools/windows/Get-PoB-Item-Delta-GitHubReleaseNotes.ps1"
$buildCoverageScript = Join-Path $repoRoot "tools/windows/Test-PoB-BuildCoverage.ps1"
$buildCoverageFixture = Join-Path $repoRoot "apps/server/src/__fixtures__/representative-build.xml"

Write-Step "Checking local release readiness for $releaseVersion..."

$checks = New-Object System.Collections.Generic.List[object]

$insideWorkTree = Invoke-Git -Arguments @("rev-parse", "--is-inside-work-tree")
$checks.Add((New-Check -Name "Git worktree" -Passed ($insideWorkTree.ExitCode -eq 0 -and $insideWorkTree.Output.Trim() -eq "true") -Message $insideWorkTree.Output.Trim()))

$branch = Invoke-Git -Arguments @("branch", "--show-current")
$branchName = $branch.Output.Trim()
if (-not $branchName) {
  $branchName = "-"
}
$checks.Add((New-Check -Name "Current branch" -Passed ($branch.ExitCode -eq 0 -and $branchName -ne "-") -Message $branchName -Severity "warning"))

$remote = Invoke-Git -Arguments @("remote", "get-url", "origin")
$remoteUrl = $remote.Output.Trim()
if (-not $remoteUrl) {
  $remoteUrl = "origin remote missing"
}
$checks.Add((New-Check -Name "Origin remote" -Passed ($remote.ExitCode -eq 0 -and $remoteUrl -match "github\.com[:/]+Smellybum1/PoB-Item-Delta(\.git)?$") -Message $remoteUrl))

if (-not $SkipRemote) {
  $remoteTag = Invoke-Git -Arguments @("ls-remote", "--tags", "origin", "refs/tags/$tagName")
  $remoteTagExists = $remoteTag.ExitCode -eq 0 -and [bool]$remoteTag.Output.Trim()
  if ($remoteTag.ExitCode -ne 0) {
    $checks.Add((New-Check -Name "Remote tag availability" -Passed $false -Message "Could not check remote tag $tagName`: $($remoteTag.Output.Trim())"))
  } elseif ($remoteTagExists) {
    $checks.Add((New-Check -Name "Remote tag availability" -Passed $false -Message "$tagName already exists on origin."))
  } else {
    $checks.Add((New-Check -Name "Remote tag availability" -Passed $true -Message "$tagName is available on origin."))
  }

  $remoteBranch = Invoke-Git -Arguments @("ls-remote", "--heads", "origin", $branchName)
  if ($remoteBranch.ExitCode -ne 0) {
    $checks.Add((New-Check -Name "Remote branch probe" -Passed $false -Message "Could not check origin/$branchName`: $($remoteBranch.Output.Trim())" -Severity "warning"))
  } elseif ($remoteBranch.Output.Trim()) {
    $checks.Add((New-Check -Name "Remote branch probe" -Passed $true -Message "origin/$branchName exists." -Severity "info" -Details $remoteBranch.Output.Trim()))
  } else {
    $checks.Add((New-Check -Name "Remote branch probe" -Passed $true -Message "origin/$branchName was not found; first push may create it." -Severity "info"))
  }
} else {
  $checks.Add((New-Check -Name "Remote checks" -Passed $true -Message "Skipped by -SkipRemote." -Severity "warning"))
}

$tag = Invoke-Git -Arguments @("tag", "--list", $tagName)
$tagExists = [bool]$tag.Output.Trim()
if ($tagExists) {
  $tagMessage = "$tagName already exists locally."
} else {
  $tagMessage = "$tagName is available locally."
}
$checks.Add((New-Check -Name "Release tag availability" -Passed (-not $tagExists) -Message $tagMessage))

$status = Invoke-Git -Arguments @("status", "--short")
$statusLines = @($status.Output -split "`n" | Where-Object { $_.Trim() })
$checks.Add((New-Check -Name "Commit pending" -Passed $true -Severity "info" -Message "$($statusLines.Count) changed path(s) pending local release commit after approval." -Details $statusLines))
$generatedStatusPaths = @(
  $statusLines |
    ForEach-Object { Get-GitStatusPath -StatusLine $_ } |
    Where-Object { Test-GeneratedGitPath -RelativePath $_ }
)
if ($generatedStatusPaths.Count) {
  $generatedPathsMessage = "Generated paths are visible to git; fix .gitignore or unstage them before release."
} else {
  $generatedPathsMessage = "No generated output, dist, or node_modules paths are visible to git."
}
$checks.Add((New-Check -Name "Generated paths not staged" -Passed ($generatedStatusPaths.Count -eq 0) -Message $generatedPathsMessage -Details $generatedStatusPaths))

$requiredSourcePaths = @(
  "CHANGELOG.md",
  "README.md",
  "START_HERE.md",
  "ROADMAP.md",
  "docs/github-release.md",
  "docs/build-coverage-scan.md",
  "docs/release-qa.md",
  "docs/release-preflight.md",
  "docs/ai/release-qa-2026-06-11.md",
  "docs/ai/release-qa-2026-06-12-support-inspectors.md",
  "tools/windows/Get-PoB-Item-Delta-GitHubReleaseNotes.ps1",
  "tools/windows/Get-PoB-Item-Delta-PublishPacket.ps1",
  "tools/windows/Test-PoB-BuildCoverage.ps1",
  "apps/server/src/__tests__/buildCoverage.test.ts",
  "apps/server/src/pob/buildCoverage.ts",
  ".github/workflows/ci.yml",
  ".github/ISSUE_TEMPLATE/item-paste-failed.md",
  ".github/ISSUE_TEMPLATE/build-validation.md"
)
$missingSourcePaths = @($requiredSourcePaths | Where-Object { -not (Test-Path -LiteralPath (Join-Path $repoRoot $_)) })
if ($missingSourcePaths.Count) {
  $sourceDocsMessage = "Missing release docs/templates."
} else {
  $sourceDocsMessage = "Release docs/templates are present."
}
$checks.Add((New-Check -Name "Release source docs" -Passed ($missingSourcePaths.Count -eq 0) -Message $sourceDocsMessage -Details $missingSourcePaths))

$leanZipExists = Test-Path -LiteralPath $leanZipPath -PathType Leaf
$portableZipExists = Test-Path -LiteralPath $portableZipPath -PathType Leaf
$checks.Add((New-Check -Name "Lean zip exists" -Passed $leanZipExists -Message $leanZipPath))
$checks.Add((New-Check -Name "Portable zip exists" -Passed $portableZipExists -Message $portableZipPath))

if ($leanZipExists -and $portableZipExists) {
  $leanZip = Get-Item -LiteralPath $leanZipPath
  $portableZip = Get-Item -LiteralPath $portableZipPath
  $newerThanLean = @(Get-FilesNewerThan -Root $repoRoot -Timestamp $leanZip.LastWriteTimeUtc)
  $newerThanPortable = @(Get-FilesNewerThan -Root $repoRoot -Timestamp $portableZip.LastWriteTimeUtc)
  $freshnessDetails = [ordered]@{
    newerThanLean = @($newerThanLean | ForEach-Object { $_.RelativePath })
    newerThanPortable = @($newerThanPortable | ForEach-Object { $_.RelativePath })
  }
  if ($newerThanLean.Count -or $newerThanPortable.Count) {
    $freshnessMessage = "Some source files are newer than release zips; rebuild zips before publishing."
  } else {
    $freshnessMessage = "No included source files are newer than the release zips."
  }
  $checks.Add((New-Check -Name "Release zips are current" -Passed ($newerThanLean.Count -eq 0 -and $newerThanPortable.Count -eq 0) -Message $freshnessMessage -Details $freshnessDetails))
}

if (-not $SkipPreflight) {
  try {
    $leanPreflight = Invoke-PreflightJson -ScriptPath $preflightScript -ZipPath $null
    $checks.Add((New-Check -Name "Lean preflight" -Passed ($leanPreflight.status -eq "pass") -Message "Lean preflight status: $($leanPreflight.status)." -Details $leanPreflight))
  } catch {
    $checks.Add((New-Check -Name "Lean preflight" -Passed $false -Message $_.Exception.Message))
  }

  try {
    $portablePreflight = Invoke-PreflightJson -ScriptPath $preflightScript -ZipPath $portableZipPath
    $checks.Add((New-Check -Name "Portable preflight" -Passed ($portablePreflight.status -eq "pass") -Message "Portable preflight status: $($portablePreflight.status)." -Details $portablePreflight))
  } catch {
    $checks.Add((New-Check -Name "Portable preflight" -Passed $false -Message $_.Exception.Message))
  }
}

try {
  $coverageSmoke = Invoke-BuildCoverageSmokeJson -ScriptPath $buildCoverageScript -FixturePath $buildCoverageFixture
  $coverageMarkdownSmoke = Invoke-BuildCoverageSmokeMarkdown -ScriptPath $buildCoverageScript -FixturePath $buildCoverageFixture
  $smokePassed = [int]$coverageSmoke.xmlFileCount -eq 2 -and
    [int]$coverageSmoke.buildCount -eq 1 -and
    [int]$coverageSmoke.parseFailureCount -eq 1 -and
    @($coverageSmoke.builds | Where-Object { [string]$_.file -eq "Nested/representative-build.xml" }).Count -eq 1 -and
    @($coverageSmoke.failedBuilds | Where-Object { [string]$_.file -eq "bad.xml" }).Count -eq 1 -and
    $coverageMarkdownSmoke.Contains("# PoB Item Delta Build Coverage Report") -and
    $coverageMarkdownSmoke.Contains("Nested/representative-build.xml") -and
    $coverageMarkdownSmoke.Contains("bad.xml")
  if ($smokePassed) {
    $smokeMessage = "Build coverage smoke parsed a nested fixture, reported an unreadable XML file, and produced path-sanitized Markdown."
  } else {
    $smokeMessage = "Build coverage smoke did not report the expected nested fixture, unreadable XML counts, or Markdown output."
  }
  $checks.Add((New-Check -Name "Build coverage scanner smoke" -Passed $smokePassed -Message $smokeMessage -Details ([ordered]@{
    xmlFileCount = $coverageSmoke.xmlFileCount
    buildCount = $coverageSmoke.buildCount
    parseFailureCount = $coverageSmoke.parseFailureCount
    buildFiles = @($coverageSmoke.builds | ForEach-Object { [string]$_.file })
    failedFiles = @($coverageSmoke.failedBuilds | ForEach-Object { [string]$_.file })
    markdownSmoke = $coverageMarkdownSmoke.Split("`n") | Select-Object -First 12
  })))
} catch {
  $checks.Add((New-Check -Name "Build coverage scanner smoke" -Passed $false -Message $_.Exception.Message))
}

try {
  $releaseNotes = Invoke-ReleaseNotesJson -ScriptPath $releaseNotesScript -ReleaseVersion $releaseVersion
  $expectedAssetNames = @(
    "PoB-Item-Delta-$releaseVersion-portable-win-x64.zip",
    "PoB-Item-Delta-$releaseVersion.zip"
  )
  $releaseBody = [string]$releaseNotes.body
  $assets = @($releaseNotes.assets)
  $missingAssetNames = @(
    $expectedAssetNames | Where-Object {
      $name = $_
      -not @($assets | Where-Object { [string]$_.name -eq $name }).Count -or -not $releaseBody.Contains($name)
    }
  )
  $missingChecksums = @(
    $assets | Where-Object {
      $checksum = [string]$_.sha256
      -not $checksum -or -not $releaseBody.Contains($checksum)
    } | ForEach-Object { [string]$_.name }
  )
  $notesPassed = [string]$releaseNotes.title -eq "PoB Item Delta $releaseVersion" -and $missingAssetNames.Count -eq 0 -and $missingChecksums.Count -eq 0
  if ($notesPassed) {
    $notesMessage = "Release notes preview includes title, expected assets, and checksums."
  } else {
    $notesMessage = "Release notes preview is missing expected title, asset names, or checksums."
  }
  $checks.Add((New-Check -Name "Release notes preview" -Passed $notesPassed -Message $notesMessage -Details ([ordered]@{
    title = $releaseNotes.title
    missingAssetNames = $missingAssetNames
    missingChecksums = $missingChecksums
  })))
} catch {
  $checks.Add((New-Check -Name "Release notes preview" -Passed $false -Message $_.Exception.Message))
}

$blockingChecks = @($checks | Where-Object { -not $_.passed -and $_.severity -eq "error" })
$statusValue = if ($blockingChecks.Count -eq 0) { "ready-for-approval" } else { "needs-work" }
$result = [ordered]@{
  status = $statusValue
  version = $releaseVersion
  branch = $branchName
  origin = $remoteUrl
  tag = $tagName
  remoteChecksSkipped = [bool]$SkipRemote
  leanZipPath = $leanZipPath
  portableZipPath = $portableZipPath
  checks = $checks
  externalWritesRequireApproval = @(
    "Commit the release candidate",
    "Push branch to origin",
    "Wait for GitHub CI to pass on the pushed branch",
    "Create and push tag $tagName",
    "Publish GitHub release and upload zip assets"
  )
}

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Step "Status: $statusValue"
  foreach ($check in $checks) {
    $prefix = if ($check.passed) { "ok" } elseif ($check.severity -eq "warning") { "warn" } else { "fail" }
    Write-Host "[$prefix] $($check.name): $($check.message)"
  }
  Write-Host ""
  Write-Host "External writes still require approval:"
  foreach ($write in $result.externalWritesRequireApproval) {
    Write-Host "- $write"
  }
}

if ($statusValue -ne "ready-for-approval") {
  exit 1
}
