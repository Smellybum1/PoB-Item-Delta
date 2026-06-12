# PoB Item Delta

PoB Item Delta is a local-only Path of Building item comparison tool for Path of Exile 2.

## Quick Start On Windows

1. Use `PoB-Item-Delta-0.1.1-portable-win-x64.zip` for easiest setup. If you use the smaller lean zip or source checkout, install Node.js LTS first.
2. Extract this folder somewhere writable.
3. Double-click `tools/windows/Start-PoB-Item-Delta.cmd`.
4. Your browser should open `http://127.0.0.1:5174`.
5. In the app, check the PoB Native Calculation panel and set your PoB install folder and PoB `Settings.xml` path if needed.

If the launcher says Node.js or npm is missing, install Node.js LTS from `https://nodejs.org/`, open a new command window, and run the launcher again.

To stop the local server, double-click `tools/windows/Stop-PoB-Item-Delta.cmd`.

## How To Use

1. Save your current build in Path of Building Community for PoE2.
2. Refresh PoB Item Delta.
3. Pick the gear slot to compare.
4. Paste item text copied from the official PoE2 trade site.
5. Click Create temp copy.
6. Review the delta report.
7. Only save if you want to keep the result; overwrite saves ask for confirmation and create a backup first.

## Privacy

This app binds to `127.0.0.1` and is intended to run on your computer only. It reads local PoB settings/build XML files and writes local app settings, temporary candidate build copies, and explicit backups. It does not upload build files or pasted item text.

## More Help

See `docs/windows-launcher.md` for launcher details, logs, custom ports, and troubleshooting.

Use Help & Diagnostics -> Copy build report if target skill, weapon swap, slot replacement, or recalculation behavior looks wrong.

See `docs/build-coverage-scan.md` if a build-specific target skill or weapon swap issue needs a read-only support scan.

See `docs/coc-model-validation.md` if the optional CoC Frost model needs repeatable observation notes.

For copied support reports, `README.md` lists local inspector commands that can check parser, build, and CoC validation reports before sharing.
