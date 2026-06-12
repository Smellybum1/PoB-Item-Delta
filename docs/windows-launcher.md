# Windows Launcher

Use this when you want to run PoB Item Delta as a local app without keeping terminal commands in your head.

## Requirements

- Windows.
- Node.js LTS with npm available on `PATH` for the lean zip or source checkout. The portable Windows zip includes Node.
- Path of Building Community for PoE2 installed locally.
- This project folder or a future release zip extracted to a normal writable folder.

## Create A Shareable Zip

From the project folder:

```powershell
npm run release:zip
```

The zip is written to `output/releases/`. It includes built app files, source/package files, the Windows launchers, docs, and a release manifest. The default zip does not include `node_modules` or a portable Node runtime; the launcher installs npm dependencies on first run when needed.

For a larger zip that should not need first-run dependency install:

```powershell
npm run release:zip -- -IncludeNodeModules
```

For a portable-runtime zip, download an official Windows x64 Node.js zip from `https://nodejs.org/`, then pass it to the release script:

```powershell
npm run release:zip:portable
```

That portable command downloads the pinned official Node.js Windows x64 zip, verifies its SHA256 checksum, stages dependencies, and writes the portable artifact. You can still pass `-NodeVersion`, `-ForceDownload`, `-SkipBuild`, or release-script paths after `--` when needed.

The launcher prefers `runtime\node\node.exe` and `runtime\node\npm.cmd` when they are present, then falls back to Node/npm on `PATH`.

Current release artifacts:

- `PoB-Item-Delta-0.1.0-portable-win-x64.zip`: primary friend/public zip; includes official Node.js v24.16.0 Windows x64 runtime and staged dependencies.
- `PoB-Item-Delta-0.1.0.zip`: lean secondary zip; requires local Node.js LTS.

There is no Electron/Tauri installer for 0.1.0. The portable Windows zip is the current easiest setup path; a true installer should wait until player feedback shows a need for shortcuts, uninstall support, auto-update, signing polish, or desktop-window behavior.

## Start

Double-click:

```text
tools/windows/Start-PoB-Item-Delta.cmd
```

The launcher:

- installs npm dependencies if `node_modules` is missing and npm is available;
- builds the server and web app if build output is missing;
- starts one hidden local server on `http://127.0.0.1:5174`;
- serves both the React UI and `/api/*` from that same local server;
- opens the app in your browser.

If startup fails from a double-click, the command window stays open so you can read the fix. For scripted checks, set `POB_ITEM_DELTA_NO_PAUSE=1` before running the `.cmd` wrapper.

For a custom port:

```powershell
tools/windows/Start-PoB-Item-Delta.cmd -Port 5184
```

## Stop

Double-click:

```text
tools/windows/Stop-PoB-Item-Delta.cmd
```

The stop helper reads the launcher state from `%LOCALAPPDATA%\PoB Item Delta\launcher\server.json` and stops the matching local server process.

## Logs

Launcher logs are local:

```text
%LOCALAPPDATA%\PoB Item Delta\logs\server.out.log
%LOCALAPPDATA%\PoB Item Delta\logs\server.err.log
```

## Privacy

The launcher binds the app to `127.0.0.1`, which means it is intended for this computer only.

The app reads local PoB settings/build XML and writes local app settings, temp candidate build files, and explicit backup/save outputs. It does not upload builds or pasted item text to a cloud service.

## Troubleshooting

- If Node.js or npm is missing, install Node.js LTS from `https://nodejs.org/`, open a new command window, and rerun the launcher.
- If the port is busy, stop the other process or run the launcher with `-Port <free port>`.
- If the app opens but PoB setup is not ready, use the in-app PoB Native Calculation panel to set the PoB install folder and PoB `Settings.xml` path.
