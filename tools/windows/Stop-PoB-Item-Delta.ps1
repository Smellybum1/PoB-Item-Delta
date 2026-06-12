param(
  [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  if (-not $Quiet) {
    Write-Host "[PoB Item Delta] $Message"
  }
}

$appDataRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "PoB Item Delta" } else { Join-Path $env:TEMP "PoB Item Delta" }
$statePath = Join-Path $appDataRoot "launcher\server.json"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Get-LauncherServerProcesses {
  $repoFragment = $repoRoot.ToLowerInvariant()
  Get-CimInstance Win32_Process |
    Where-Object {
      if (-not $_.CommandLine) {
        return $false
      }
      $commandLine = $_.CommandLine.ToLowerInvariant()
      $inRepo = $commandLine.Contains($repoFragment)
      $isProdServer = $commandLine.Contains("apps/server/dist/index.js") -or $commandLine.Contains("apps\server\dist\index.js")
      $isAbsoluteProdServer = $inRepo -and $isProdServer
      $isOldRelativeProdServer = $isProdServer -and -not $commandLine.Contains("tsx") -and -not $commandLine.Contains("src/index.ts")
      return $isAbsoluteProdServer -or $isOldRelativeProdServer
    }
}

function Stop-ServerProcess {
  param([int]$ServerPid)
  $process = Get-Process -Id $ServerPid -ErrorAction SilentlyContinue
  if ($process) {
    Write-Step "Stopping local server process $ServerPid..."
    Stop-Process -Id $ServerPid -Force
    try {
      Wait-Process -Id $ServerPid -Timeout 10
    } catch {
      Write-Step "Stop was requested, but process $ServerPid did not exit within 10 seconds."
    }
    return $true
  }
  return $false
}

if (-not (Test-Path $statePath)) {
  $matches = @(Get-LauncherServerProcesses)
  if ($matches.Count -eq 0) {
    Write-Step "No launcher state found. The app does not appear to be running from the Windows launcher."
    exit 0
  }

  foreach ($match in $matches) {
    [void](Stop-ServerProcess -ServerPid ([int]$match.ProcessId))
  }
  Write-Step "Stopped."
  exit 0
}

try {
  $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
  $serverPid = [int]$state.pid
} catch {
  Remove-Item -Path $statePath -Force -ErrorAction SilentlyContinue
  Write-Step "Removed unreadable launcher state."
  exit 0
}

$stopped = Stop-ServerProcess -ServerPid $serverPid
if (-not $stopped) {
  Write-Step "Launcher process $serverPid is no longer running."
  foreach ($match in @(Get-LauncherServerProcesses)) {
    [void](Stop-ServerProcess -ServerPid ([int]$match.ProcessId))
  }
}

Remove-Item -Path $statePath -Force -ErrorAction SilentlyContinue
Write-Step "Stopped."
