param(
  [int]$Port = 5174,
  [switch]$NoBrowser,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$ForceBuild,
  [int]$StartupTimeoutSeconds = 45
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Resolve-NodePath {
  $bundledNodePath = Join-Path $repoRoot "runtime\node\node.exe"
  if (Test-Path -LiteralPath $bundledNodePath -PathType Leaf) {
    return $bundledNodePath
  }

  $nodeExe = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
  if ($nodeExe) {
    return $nodeExe.Source
  }

  $nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    return $null
  }

  if ($nodeCommand.Source.EndsWith(".cmd", [System.StringComparison]::OrdinalIgnoreCase)) {
    $commandText = Get-Content -Path $nodeCommand.Source -Raw
    $match = [regex]::Match($commandText, '"([^"]*node\.exe)"')
    if ($match.Success -and (Test-Path $match.Groups[1].Value)) {
      return $match.Groups[1].Value
    }
  }

  return $nodeCommand.Source
}

function Resolve-NpmPath {
  foreach ($relativePath in @("runtime\node\npm.cmd", "runtime\node\npm")) {
    $bundledNpmPath = Join-Path $repoRoot $relativePath
    if (Test-Path -LiteralPath $bundledNpmPath -PathType Leaf) {
      return $bundledNpmPath
    }
  }

  $npmCommand = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmCommand) {
    return $npmCommand.Source
  }

  return $null
}

function Write-Step {
  param([string]$Message)
  Write-Host "[PoB Item Delta] $Message"
}

function New-PrerequisiteMessage {
  param(
    [string]$MissingTool,
    [string]$Detail
  )

  return @(
    "$MissingTool was not found.",
    "",
    $Detail,
    "",
    "Install Node.js LTS from https://nodejs.org/ and make sure npm is included on PATH.",
    "After installing, close this window, open a new one, and run tools\windows\Start-PoB-Item-Delta.cmd again.",
    "More help: $repoRoot\docs\windows-launcher.md"
  ) -join [Environment]::NewLine
}

function Invoke-Npm {
  param([string[]]$Arguments)
  if (-not $script:NpmPath) {
    throw (New-PrerequisiteMessage -MissingTool "npm" -Detail "npm normally installs with Node.js LTS. PoB Item Delta needs npm when dependencies or build output are missing.")
  }
  & $script:NpmPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
  }
}

function Test-LocalHealth {
  param([int]$CheckPort)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$CheckPort/api/health" -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-PortOpen {
  param([int]$CheckPort)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $asyncResult = $client.BeginConnect("127.0.0.1", $CheckPort, $null, $null)
    $connected = $asyncResult.AsyncWaitHandle.WaitOne(500)
    if ($connected) {
      $client.EndConnect($asyncResult)
    }
    return $connected
  } catch {
    return $false
  } finally {
    $client.Dispose()
  }
}

function Open-App {
  param([int]$OpenPort)
  if (-not $NoBrowser) {
    Start-Process "http://127.0.0.1:$OpenPort"
  }
}

$script:NodePath = Resolve-NodePath
$script:NpmPath = Resolve-NpmPath

if (-not $script:NodePath) {
  throw (New-PrerequisiteMessage -MissingTool "Node.js" -Detail "The first release zip uses your local Node.js runtime to install dependencies, build if needed, and start the local app.")
}

$appDataRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "PoB Item Delta" } else { Join-Path $env:TEMP "PoB Item Delta" }
$launcherRoot = Join-Path $appDataRoot "launcher"
$logRoot = Join-Path $appDataRoot "logs"
$statePath = Join-Path $launcherRoot "server.json"
$stdoutLog = Join-Path $logRoot "server.out.log"
$stderrLog = Join-Path $logRoot "server.err.log"
$serverDist = Join-Path $repoRoot "apps\server\dist\index.js"
$webDist = Join-Path $repoRoot "apps\web\dist\index.html"

New-Item -ItemType Directory -Force -Path $launcherRoot, $logRoot | Out-Null

if (Test-Path $statePath) {
  try {
    $state = Get-Content -Path $statePath -Raw | ConvertFrom-Json
    $serverPid = [int]$state.pid
    $statePort = [int]$state.port
    $process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($process -and (Test-LocalHealth -CheckPort $statePort)) {
      Write-Step "Already running at http://127.0.0.1:$statePort."
      Open-App -OpenPort $statePort
      exit 0
    }
  } catch {
    Write-Step "Removing stale launcher state."
  }
  Remove-Item -Path $statePath -Force -ErrorAction SilentlyContinue
}

if (Test-PortOpen -CheckPort $Port) {
  if (Test-LocalHealth -CheckPort $Port) {
    Write-Step "A compatible local server is already running at http://127.0.0.1:$Port."
    Open-App -OpenPort $Port
    exit 0
  }
  throw "Port $Port is already in use by another process. Stop that process or run this launcher with -Port <free port>."
}

Push-Location $repoRoot
try {
  $needsInstall = -not $SkipInstall -and -not (Test-Path (Join-Path $repoRoot "node_modules"))
  if ($needsInstall) {
    Write-Step "Installing npm dependencies..."
    Invoke-Npm @("install")
  }

  $needsBuild = $ForceBuild -or -not (Test-Path $serverDist) -or -not (Test-Path $webDist)
  if (-not $SkipBuild -and $needsBuild) {
    Write-Step "Building local app..."
    Invoke-Npm @("run", "build")
  }

  if (-not (Test-Path $serverDist)) {
    throw "Server build output is missing. Run npm run build, then try again."
  }
  if (-not (Test-Path $webDist)) {
    throw "Web build output is missing. Run npm run build, then try again."
  }

  Write-Step "Starting hidden local server on http://127.0.0.1:$Port..."
  $env:HOST = "127.0.0.1"
  $env:PORT = "$Port"
  $env:NODE_ENV = "production"
  $process = Start-Process `
    -FilePath $script:NodePath `
    -ArgumentList @("`"$serverDist`"") `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden `
    -PassThru

  $started = $false
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($process.HasExited) {
      throw "The local server exited early. Check $stderrLog and $stdoutLog."
    }
    if (Test-LocalHealth -CheckPort $Port) {
      $started = $true
      break
    }
    Start-Sleep -Milliseconds 500
  }

  if (-not $started) {
    throw "The local server did not become ready within $StartupTimeoutSeconds seconds. Check $stderrLog and $stdoutLog."
  }

  @{
    pid = $process.Id
    port = $Port
    startedAt = (Get-Date).ToUniversalTime().ToString("o")
    repoRoot = $repoRoot
    stdoutLog = $stdoutLog
    stderrLog = $stderrLog
  } | ConvertTo-Json | Set-Content -Path $statePath -Encoding UTF8

  Write-Step "Ready at http://127.0.0.1:$Port."
  Write-Step "Logs: $stdoutLog"
  Open-App -OpenPort $Port
} finally {
  Pop-Location
}
