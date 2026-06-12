# Learning: PoB Temp Build Preview Opening

## Evidence

- Local PoB2 `Modules/Main.lua` reads `arg[1]` on startup only as a build-site/protocol import path, routes it through `buildSites.ParseImportLinkFromURI()`, and then calls `buildSites.DownloadBuild()`.
- Local PoB2 `Modules/BuildSiteTools.lua` supports `pob2://<site>/<id>` protocol forms for known websites, not direct local XML file paths.
- Local PoB2 `Modules/Main.lua` persists the current mode through `main:SaveSettings()`, which serializes `main:CallMode("GetArgs")`; `Modules/Build.lua` returns the current build path and build name from `buildMode:GetArgs()`.

## Rule

Do not implement Open temp build by passing an XML path as a launcher argument, and do not silently edit PoB `Settings.xml`.

Use a temporary PoB-shaped runtime mirror plus a wrapper script that loads normal `Launch.lua`, switches the in-memory mode to the temp build, and disables settings writes for that preview process.

## Tradeoff

If the user saves inside the preview PoB window, PoB writes to the temporary build copy. That is safer than writing to the original build or changing PoB's remembered active build, but the UI should continue to frame it as a preview/temp path.
