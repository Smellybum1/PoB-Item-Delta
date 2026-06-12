param(
  [string]$BuildsPath,
  [switch]$Json,
  [switch]$Markdown
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Json -and $Markdown) {
  throw "Choose either -Json or -Markdown, not both."
}

function Resolve-DefaultBuildsPath {
  $candidates = Get-DefaultBuildsPathCandidates

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
      return $candidate
    }
  }

  return $null
}

function Get-DefaultBuildsPathCandidates {
  $candidates = New-Object System.Collections.Generic.List[string]

  Add-CandidatePath $candidates $env:POB2_BUILDS_PATH

  $documentsPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)
  Add-DocumentsBuildsCandidate $candidates $documentsPath

  foreach ($oneDriveRoot in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
    if ($oneDriveRoot) {
      Add-DocumentsBuildsCandidate $candidates (Join-Path $oneDriveRoot "Documents")
    }
  }

  if ($env:USERPROFILE) {
    Add-DocumentsBuildsCandidate $candidates (Join-Path $env:USERPROFILE "Documents")
    Add-DocumentsBuildsCandidate $candidates (Join-Path $env:USERPROFILE "OneDrive\Documents")
  }

  return @($candidates)
}

function Add-DocumentsBuildsCandidate {
  param(
    [System.Collections.Generic.List[string]]$Candidates,
    [string]$DocumentsPath
  )

  if ([string]::IsNullOrWhiteSpace($DocumentsPath)) {
    return
  }

  Add-CandidatePath $Candidates (Join-Path $DocumentsPath "Path of Building (PoE2)\Builds")
}

function Add-CandidatePath {
  param(
    [System.Collections.Generic.List[string]]$Candidates,
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return
  }

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  foreach ($candidate in $Candidates) {
    if ([string]::Equals($candidate, $fullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      return
    }
  }
  $Candidates.Add($fullPath)
}

function Convert-ToBuildRelativePath {
  param(
    [string]$Root,
    [string]$Path
  )

  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ($fullPath.Substring($rootPath.Length) -replace '\\', '/')
  }
  return [System.IO.Path]::GetFileName($fullPath)
}

function Read-IntOrNull {
  param($Value)
  $number = 0
  if ([int]::TryParse([string]$Value, [ref]$number)) {
    return $number
  }
  return $null
}

function Read-NodeArray {
  param($Value)
  if ($null -eq $Value) {
    return @()
  }
  if ($Value -is [System.Array]) {
    return @($Value)
  }
  return @($Value)
}

function Read-XmlAttribute {
  param(
    $Node,
    [string]$Name
  )

  if ($null -eq $Node -or $null -eq $Node.Attributes) {
    return $null
  }

  $attribute = $Node.Attributes[$Name]
  if ($null -eq $attribute) {
    return $null
  }

  return [string]$attribute.Value
}

function Read-GemLabel {
  param($SkillNode)
  foreach ($gem in Read-NodeArray $SkillNode.Gem) {
    $nameSpec = Read-XmlAttribute $gem "nameSpec"
    if ($nameSpec) {
      return $nameSpec
    }
  }
  return "Unknown skill"
}

function Read-ItemName {
  param($ItemNode)
  if ($null -eq $ItemNode) {
    return $null
  }

  $lines = @([string]$ItemNode.InnerText -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($lines.Count -eq 0) {
    return $null
  }

  for ($index = 0; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^Rarity:') {
      if ($index + 1 -lt $lines.Count) {
        return $lines[$index + 1]
      }
      return $null
    }
  }

  return $lines[0]
}

function Read-SlotSummary {
  param(
    $ItemSet,
    [hashtable]$ItemsById,
    [string]$SlotName
  )

  $slot = @(Read-NodeArray $ItemSet.Slot | Where-Object { (Read-XmlAttribute $_ "name") -eq $SlotName } | Select-Object -First 1)
  $itemId = if ($slot.Count -gt 0) { Read-XmlAttribute $slot[0] "itemId" } else { $null }
  $itemName = $null
  if ($itemId -and $itemId -ne "0" -and $ItemsById.ContainsKey($itemId)) {
    $itemName = Read-ItemName $ItemsById[$itemId]
  }

  return [pscustomobject][ordered]@{
    itemId = $itemId
    itemName = $itemName
  }
}

function Format-MarkdownValue {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
    return "-"
  }
  return ([string]$Value).Replace("|", "\|").Replace("`r", " ").Replace("`n", " ")
}

function Format-YesNo {
  param([bool]$Value)
  if ($Value) {
    return "yes"
  }
  return "no"
}

function Format-WeaponSetLabel {
  param($Value)
  if ([string]$Value -eq "true") {
    return "weapon set II active"
  }
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value) -or [string]$Value -eq "nil" -or [string]$Value -eq "false") {
    return "weapon set I/default"
  }
  return [string]$Value
}

function Write-MarkdownBuildCoverageReport {
  param($Summary)

  Write-Output "# PoB Item Delta Build Coverage Report"
  Write-Output ""
  Write-Output "Generated: $((Get-Date).ToUniversalTime().ToString("o"))"
  Write-Output ""
  Write-Output "Local-only note: this scanner reads saved PoB2 build XML files from your computer. This Markdown output omits the full local builds folder path; review build filenames for private character names before sharing."
  Write-Output ""
  Write-Output "## Summary"
  Write-Output ""
  Write-Output "| Metric | Value |"
  Write-Output "| --- | ---: |"
  Write-Output "| XML files found | $($Summary.xmlFileCount) |"
  Write-Output "| Builds scanned | $($Summary.buildCount) |"
  Write-Output "| XML files skipped after parse/read errors | $($Summary.parseFailureCount) |"
  Write-Output "| With primary weapon/offhand gear | $($Summary.buildsWithPrimaryGear) |"
  Write-Output "| With swap weapon/offhand gear | $($Summary.buildsWithSwapGear) |"
  Write-Output "| With multiple skill sets | $($Summary.buildsWithMultipleSkillSets) |"
  Write-Output "| With swap gear and multiple skill sets | $($Summary.buildsWithSwapGearAndMultipleSkillSets) |"
  Write-Output "| Using weapon set II now | $($Summary.buildsUsingSecondWeaponSet) |"
  Write-Output "| With swap gear and weapon set II active | $($Summary.buildsWithSwapGearAndSecondWeaponSetActive) |"
  Write-Output ""
  Write-Output "## Roadmap Validation Candidates"
  Write-Output ""

  if ($Summary.weaponSwapValidationCandidates.Count -gt 0) {
    Write-Output "| Build file | Selected skill | Skill set/group | Skill sets | Weapon set |"
    Write-Output "| --- | --- | --- | ---: | --- |"
    foreach ($candidate in $Summary.weaponSwapValidationCandidates) {
      $skillGroup = "$($candidate.activeSkillSet)/$($candidate.mainSocketGroup)"
      Write-Output "| $(Format-MarkdownValue $candidate.file) | $(Format-MarkdownValue $candidate.selectedSkill) | $(Format-MarkdownValue $skillGroup) | $($candidate.skillSetCount) | $(Format-MarkdownValue (Format-WeaponSetLabel $candidate.useSecondWeaponSet)) |"
    }
  } else {
    Write-Output "None found with both swap gear and multiple skill sets."
  }

  Write-Output ""
  Write-Output "## Skipped XML Files"
  Write-Output ""
  if ($Summary.failedBuilds.Count -gt 0) {
    Write-Output "| File | Error |"
    Write-Output "| --- | --- |"
    foreach ($failure in @($Summary.failedBuilds | Select-Object -First 10)) {
      Write-Output "| $(Format-MarkdownValue $failure.file) | $(Format-MarkdownValue $failure.error) |"
    }
    if ($Summary.failedBuilds.Count -gt 10) {
      Write-Output ""
      Write-Output "_$($Summary.failedBuilds.Count - 10) additional skipped XML file(s) omitted._"
    }
  } else {
    Write-Output "None."
  }

  Write-Output ""
  Write-Output "## Build Rows"
  Write-Output ""
  if ($Summary.builds.Count -gt 0) {
    Write-Output "| Build file | Selected skill | Skill set/group | Skill sets | Primary gear | Swap gear | Weapon set |"
    Write-Output "| --- | --- | --- | ---: | --- | --- | --- |"
    foreach ($build in $Summary.builds) {
      $skillGroup = "$($build.activeSkillSet)/$($build.mainSocketGroup)"
      Write-Output "| $(Format-MarkdownValue $build.file) | $(Format-MarkdownValue $build.selectedSkill) | $(Format-MarkdownValue $skillGroup) | $($build.skillSetCount) | $(Format-YesNo $build.hasPrimaryGear) | $(Format-YesNo $build.hasSwapGear) | $(Format-MarkdownValue (Format-WeaponSetLabel $build.useSecondWeaponSet)) |"
    }
  } else {
    Write-Output "No valid PoB2 builds found."
  }

  Write-Output ""
  Write-Output "## Suggested Follow-Up"
  Write-Output ""
  Write-Output "- If a roadmap validation candidate appears, run a normal item comparison on that build, then copy a build validation report from Help & Diagnostics."
  Write-Output "- Remove private character names from filenames before posting publicly."
}

$usedDefaultBuildsPath = -not $BuildsPath
$defaultBuildsPathCandidates = @()

if ($usedDefaultBuildsPath) {
  $defaultBuildsPathCandidates = @(Get-DefaultBuildsPathCandidates)
  $BuildsPath = Resolve-DefaultBuildsPath
}

if (-not $BuildsPath -or -not (Test-Path -LiteralPath $BuildsPath -PathType Container)) {
  $checkedMessage = ""
  if ($usedDefaultBuildsPath -and $defaultBuildsPathCandidates.Count -gt 0) {
    $checkedMessage = " Checked: $($defaultBuildsPathCandidates -join '; ')"
  }
  throw "BuildsPath was not found. Pass -BuildsPath with your Path of Building (PoE2)\Builds folder.$checkedMessage"
}

$files = @(Get-ChildItem -LiteralPath $BuildsPath -Filter "*.xml" -File -Recurse | Sort-Object FullName)
$builds = @()
$failedBuilds = @()

foreach ($file in $files) {
  $relativeFile = Convert-ToBuildRelativePath -Root $BuildsPath -Path $file.FullName

  try {
    [xml]$document = Get-Content -LiteralPath $file.FullName -Raw
    $root = $document.PathOfBuilding2
    if ($null -eq $root) {
      throw "Missing PathOfBuilding2 root element."
    }

    $build = $root.Build
    $skills = $root.Skills
    $items = $root.Items
    if ($null -eq $build -or $null -eq $skills -or $null -eq $items) {
      throw "Missing one or more required Build, Skills, or Items sections."
    }
  } catch {
    $failedBuilds += [pscustomobject][ordered]@{
      file = $relativeFile
      error = $_.Exception.Message
    }
    continue
  }

  $activeSkillSet = Read-IntOrNull (Read-XmlAttribute $skills "activeSkillSet")
  $mainSocketGroup = Read-IntOrNull (Read-XmlAttribute $build "mainSocketGroup")
  $skillSetSummaries = @()

  foreach ($skillSet in Read-NodeArray $skills.SkillSet) {
    $labels = @(Read-NodeArray $skillSet.Skill | ForEach-Object { Read-GemLabel $_ })
    $skillSetSummaries += [pscustomobject][ordered]@{
      id = Read-IntOrNull (Read-XmlAttribute $skillSet "id")
      labels = $labels
    }
  }

  $selectedSkillSet = @($skillSetSummaries | Where-Object { $_.id -eq $activeSkillSet } | Select-Object -First 1)
  $selectedLabel = $null
  if ($selectedSkillSet.Count -gt 0 -and $mainSocketGroup -and $mainSocketGroup -le $selectedSkillSet[0].labels.Count) {
    $selectedLabel = $selectedSkillSet[0].labels[$mainSocketGroup - 1]
  }

  $itemSets = @(Read-NodeArray $items.ItemSet)
  $activeItemSetId = Read-XmlAttribute $items "activeItemSet"
  $activeItemSet = @($itemSets | Where-Object { (Read-XmlAttribute $_ "id") -eq $activeItemSetId } | Select-Object -First 1)
  $itemSet = if ($activeItemSet.Count -gt 0) { $activeItemSet[0] } elseif ($itemSets.Count -gt 0) { $itemSets[0] } else { $null }

  $itemsById = @{}
  foreach ($item in Read-NodeArray $items.Item) {
    $itemId = Read-XmlAttribute $item "id"
    if ($itemId) {
      $itemsById[$itemId] = $item
    }
  }

  $slotSummary = [pscustomobject][ordered]@{
    "Weapon 1" = Read-SlotSummary $itemSet $itemsById "Weapon 1"
    "Weapon 2" = Read-SlotSummary $itemSet $itemsById "Weapon 2"
    "Weapon 1 Swap" = Read-SlotSummary $itemSet $itemsById "Weapon 1 Swap"
    "Weapon 2 Swap" = Read-SlotSummary $itemSet $itemsById "Weapon 2 Swap"
  }

  $hasPrimaryGear = [bool]($slotSummary."Weapon 1".itemName -or $slotSummary."Weapon 2".itemName)
  $hasSwapGear = [bool]($slotSummary."Weapon 1 Swap".itemName -or $slotSummary."Weapon 2 Swap".itemName)
  $itemSetWeaponFlag = Read-XmlAttribute $itemSet "useSecondWeaponSet"
  $itemsWeaponFlag = Read-XmlAttribute $items "useSecondWeaponSet"
  $useSecondWeaponSet = if ($itemSetWeaponFlag) { $itemSetWeaponFlag } elseif ($itemsWeaponFlag) { $itemsWeaponFlag } else { $null }

  $builds += [pscustomobject][ordered]@{
    file = $relativeFile
    selectedSkill = $selectedLabel
    activeSkillSet = $activeSkillSet
    mainSocketGroup = $mainSocketGroup
    skillSetCount = @($skillSetSummaries | Where-Object { $null -ne $_.id }).Count
    enabledSkillCount = @($skillSetSummaries | ForEach-Object { $_.labels } | Where-Object { $_ -and $_ -ne "Unknown skill" }).Count
    useSecondWeaponSet = $useSecondWeaponSet
    hasPrimaryGear = $hasPrimaryGear
    hasSwapGear = $hasSwapGear
    slots = $slotSummary
    skillSets = @($skillSetSummaries | ForEach-Object {
      [ordered]@{
        id = $_.id
        labels = @($_.labels | Select-Object -First 8)
      }
    })
  }
}

$summary = [pscustomobject][ordered]@{
  buildsPath = $BuildsPath
  xmlFileCount = $files.Count
  buildCount = $builds.Count
  parseFailureCount = $failedBuilds.Count
  buildsWithPrimaryGear = @($builds | Where-Object { $_.hasPrimaryGear }).Count
  buildsWithSwapGear = @($builds | Where-Object { $_.hasSwapGear }).Count
  buildsWithMultipleSkillSets = @($builds | Where-Object { $_.skillSetCount -gt 1 }).Count
  buildsWithSwapGearAndMultipleSkillSets = @($builds | Where-Object { $_.hasSwapGear -and $_.skillSetCount -gt 1 }).Count
  buildsUsingSecondWeaponSet = @($builds | Where-Object { $_.useSecondWeaponSet -eq "true" }).Count
  buildsWithSwapGearAndSecondWeaponSetActive = @($builds | Where-Object { $_.hasSwapGear -and $_.useSecondWeaponSet -eq "true" }).Count
  weaponSwapValidationCandidates = @($builds | Where-Object { $_.hasSwapGear -and $_.skillSetCount -gt 1 } | ForEach-Object {
    [ordered]@{
      file = $_.file
      selectedSkill = $_.selectedSkill
      activeSkillSet = $_.activeSkillSet
      mainSocketGroup = $_.mainSocketGroup
      skillSetCount = $_.skillSetCount
      useSecondWeaponSet = $_.useSecondWeaponSet
    }
  })
  builds = $builds
  failedBuilds = $failedBuilds
}

if ($Json) {
  $summary | ConvertTo-Json -Depth 8
  exit 0
}

if ($Markdown) {
  Write-MarkdownBuildCoverageReport $summary
  exit 0
}

Write-Host "PoB Item Delta build coverage scan"
Write-Host "Builds path: $BuildsPath"
Write-Host "XML files found: $($summary.xmlFileCount)"
Write-Host "Builds scanned: $($summary.buildCount)"
Write-Host "XML files skipped after parse/read errors: $($summary.parseFailureCount)"
Write-Host "With primary weapon/offhand gear: $($summary.buildsWithPrimaryGear)"
Write-Host "With swap weapon/offhand gear: $($summary.buildsWithSwapGear)"
Write-Host "With multiple skill sets: $($summary.buildsWithMultipleSkillSets)"
Write-Host "With swap gear and multiple skill sets: $($summary.buildsWithSwapGearAndMultipleSkillSets)"
Write-Host "Using weapon set II now: $($summary.buildsUsingSecondWeaponSet)"
Write-Host "With swap gear and weapon set II active: $($summary.buildsWithSwapGearAndSecondWeaponSetActive)"
Write-Host ""

if ($summary.weaponSwapValidationCandidates.Count -gt 0) {
  Write-Host "Roadmap validation candidates:"
  foreach ($candidate in $summary.weaponSwapValidationCandidates) {
    $weaponSetLabel = if ($candidate.useSecondWeaponSet -eq "true") { "weapon set II active" } else { "weapon set I/default" }
    Write-Host "- $($candidate.file): $($candidate.selectedSkill); skill set $($candidate.activeSkillSet), group $($candidate.mainSocketGroup); $($candidate.skillSetCount) skill set(s); $weaponSetLabel"
  }
  Write-Host ""
} else {
  Write-Host "Roadmap validation candidates: none found with both swap gear and multiple skill sets."
  Write-Host ""
}

if ($summary.failedBuilds.Count -gt 0) {
  Write-Host "Skipped XML files:"
  foreach ($failure in @($summary.failedBuilds | Select-Object -First 10)) {
    Write-Host "- $($failure.file): $($failure.error)"
  }
  if ($summary.failedBuilds.Count -gt 10) {
    Write-Host "- ... $($summary.failedBuilds.Count - 10) more"
  }
  Write-Host ""
}

foreach ($build in $builds) {
  $swapLabel = if ($build.hasSwapGear) { "swap gear" } else { "no swap gear" }
  $weaponSetLabel = if ($build.useSecondWeaponSet -eq "true") { "weapon set II active" } else { "weapon set I/default" }
  Write-Host "- $($build.file): $($build.selectedSkill); skill set $($build.activeSkillSet), group $($build.mainSocketGroup); $($build.skillSetCount) skill set(s); $swapLabel; $weaponSetLabel"
}
