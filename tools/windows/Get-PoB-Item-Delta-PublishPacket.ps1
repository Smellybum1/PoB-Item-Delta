param(
  [string]$Version,
  [switch]$Json,
  [switch]$SkipRemote
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-JsonScript {
  param(
    [string]$ScriptPath,
    [string[]]$Arguments = @()
  )

  $global:LASTEXITCODE = 0
  $raw = & powershell -NoProfile -ExecutionPolicy Bypass -File $ScriptPath @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "$([System.IO.Path]::GetFileName($ScriptPath)) failed with exit code $LASTEXITCODE.`n$($raw -join "`n")"
  }
  $jsonText = $raw -join "`n"
  return ($jsonText | ConvertFrom-Json)
}

function Format-CommandList {
  param([string[]]$Commands)
  $lines = @($Commands | ForEach-Object { "  $_" })
  return ($lines -join "`n")
}

$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$packageJson = Get-Content -Path (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$releaseVersion = if ($Version) { $Version } else { [string]$packageJson.version }
$tagName = "v$releaseVersion"

$readinessArgs = @("-Version", $releaseVersion, "-Json")
if ($SkipRemote) {
  $readinessArgs += "-SkipRemote"
}

$readiness = Invoke-JsonScript -ScriptPath (Join-Path $PSScriptRoot "Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1") -Arguments $readinessArgs
if ([string]$readiness.status -ne "ready-for-approval") {
  throw "Release readiness status is '$($readiness.status)', not ready-for-approval."
}

$assets = Invoke-JsonScript -ScriptPath (Join-Path $PSScriptRoot "Get-PoB-Item-Delta-ReleaseAssets.ps1") -Arguments @("-Version", $releaseVersion, "-Json")
$releaseNotes = Invoke-JsonScript -ScriptPath (Join-Path $PSScriptRoot "Get-PoB-Item-Delta-GitHubReleaseNotes.ps1") -Arguments @("-Version", $releaseVersion, "-Json")

$branch = [string]$readiness.branch
$commitMessage = "Release PoB Item Delta $releaseVersion"
$releaseNotesCommand = "npm run release:notes"
$approvedCommands = @(
  "powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1",
  "git add .",
  ('git commit -m "' + $commitMessage + '"'),
  "git push -u origin $branch",
  "# Wait for the GitHub CI workflow to pass on $branch",
  ('git tag -a ' + $tagName + ' -m "PoB Item Delta ' + $releaseVersion + '"'),
  "git push origin $tagName",
  "# Create the GitHub release from the web UI or GitHub CLI, using the title/body/assets below"
)

$result = [ordered]@{
  version = $releaseVersion
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  status = [string]$readiness.status
  branch = $branch
  tag = $tagName
  origin = [string]$readiness.origin
  remoteChecksSkipped = [bool]$readiness.remoteChecksSkipped
  note = "Read-only packet. Do not run approval-gated commands unless the user explicitly approves external writes."
  commandsAfterApproval = $approvedCommands
  releaseTitle = [string]$releaseNotes.title
  releaseBodyCommand = $releaseNotesCommand
  releaseBody = [string]$releaseNotes.body
  assets = $assets.assets
  externalWritesRequireApproval = $readiness.externalWritesRequireApproval
}

if ($Json) {
  $result | ConvertTo-Json -Depth 8
  exit 0
}

Write-Host "# PoB Item Delta $releaseVersion Publish Approval Packet"
Write-Host ""
Write-Host "Status: $($result.status)"
Write-Host "Branch: $branch"
Write-Host "Tag: $tagName"
Write-Host "Origin: $($result.origin)"
Write-Host "Remote checks skipped: $($result.remoteChecksSkipped)"
Write-Host ""
Write-Host "This packet is read-only. Do not run the commands below without explicit approval for external writes."
Write-Host ""
Write-Host "## Approval-Gated Commands"
Write-Host ""
Write-Host '```powershell'
Write-Host (Format-CommandList -Commands $approvedCommands)
Write-Host '```'
Write-Host ""
Write-Host "## Release Assets"
Write-Host ""
Write-Host "| Asset | Size | SHA256 |"
Write-Host "| --- | ---: | --- |"
foreach ($asset in $assets.assets) {
  Write-Host "| ``$($asset.name)`` | $($asset.size) | ``$($asset.sha256)`` |"
}
Write-Host ""
Write-Host "Attach these files to the GitHub release:"
foreach ($asset in $assets.assets) {
  Write-Host "- $($asset.path)"
}
Write-Host ""
Write-Host "## Release Notes"
Write-Host ""
Write-Host "Title: $($releaseNotes.title)"
Write-Host ""
Write-Host "Generate the copyable release body with:"
Write-Host ""
Write-Host '```powershell'
Write-Host $releaseNotesCommand
Write-Host '```'
Write-Host ""
Write-Host "Do not commit the output/ folder."
