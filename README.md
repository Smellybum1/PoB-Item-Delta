# PoB Item Delta

Local-only Path of Building item comparison for Path of Exile 2.

PoB Item Delta reads the PoB2 build you last saved, lets you paste copied PoE2 trade item text, creates a temporary build copy with that item equipped, and shows before/after stat deltas. The original build is not overwritten unless you explicitly choose Save over original and confirm.

## Status

This is a working Windows localhost MVP.

Current strengths:

- Detects the current saved PoB2 build from local PoB settings.
- Supports common weapon, offhand, jewelry, and armour slots.
- Can use PoB-native Lua recalculation when configured, with XML cached-stat fallback.
- Shows a decision summary, detailed deltas, warnings, current/candidate item text, and a session compare list.
- Includes safe save flows, backups, restore, and a Windows start/stop launcher.

Known limits:

- The lean zip requires Node.js LTS; use the `portable-win-x64` zip to run without installing Node separately.
- Exact trade-site paste edge cases still need more real samples.
- The optional CoC Frostbolt/Frost Wall model is assumption-driven until validated against repeatable observations.

Release builders can create lean, dependency-staged, or portable-runtime zips; see `docs/windows-launcher.md`.

There is no installer yet. For 0.1.1, the portable Windows zip is the intended easy setup path.

## Requirements

- Windows.
- Node.js LTS with npm on `PATH` for the lean/source zip. The portable Windows zip includes Node.
- Path of Building Community for PoE2 installed locally.
- A saved PoB2 build.

## Run From A Release Zip

1. Download and extract `PoB-Item-Delta-0.1.1-portable-win-x64.zip` to a writable folder for the easiest setup. Use `PoB-Item-Delta-0.1.1.zip` only if you already have Node.js LTS installed.
2. Double-click `tools/windows/Start-PoB-Item-Delta.cmd`.
3. Wait for first-run dependency install if prompted by the lean zip launcher.
4. Open `http://127.0.0.1:5174` if the browser does not open automatically.
5. In the app, check PoB Native Calculation and setup paths.

If Node.js or npm is missing, the launcher window stays open with setup instructions. Install Node.js LTS, open a new command window, and run the launcher again.

To stop it, double-click `tools/windows/Stop-PoB-Item-Delta.cmd`.

## Run From Source

```powershell
npm install
npm run dev
```

For the local production path:

```powershell
npm run build
npm start
```

Create a shareable zip:

```powershell
npm run release:zip
npm run release:zip:portable
```

## Use The App

1. Save your current build in PoB2.
2. Refresh PoB Item Delta.
3. Choose the target skill and gear slot.
4. Paste the full item text copied from PoE2 trade or in-game.
5. Click Create temp copy.
6. Review the verdict, deltas, warnings, and side-by-side item text.
7. Save only if you want to keep the result.

Click Copy item report when a pasted item needs parser or slot follow-up. It copies a local-only report with the selected slot, exact pasted item text, and any parser error so the format can be turned into a regression fixture.

`npm run inspect:item-report -- <report.md>` can turn that report into parsed slot details, a fixture/test hint, and a copyable GitHub issue snippet.

## Report Validation Issues

When the GitHub repo is public, use the issue templates:

- Item paste failed: for parser failures, wrong slot inference, or offhand replacement issues.
- Build validation: for target skill, weapon swap, PoB-native recalculation, save/backup, or CoC model observations.

Remove account names, private character names, and full local paths before posting reports.

For target-skill, weapon-swap, slot replacement, or recalculation issues, click Copy build report in Help & Diagnostics. It copies local-only build context without full local paths or raw pasted item text.

For weapon swap or target-skill issues, use Help & Diagnostics -> Copy build scan for a path-sanitized Markdown summary of your saved PoB2 builds. `docs/build-coverage-scan.md` also explains the read-only terminal scanner.

For CoC Frostbolt/Frost Wall model issues, `docs/coc-model-validation.md` explains how to copy a model validation report, collect repeatable sample rows, and inspect the aggregate verdict.

Local support helpers can inspect copied reports before sharing. Each inspector prints a short readiness summary, and the parser/build/CoC report inspectors can produce copyable GitHub issue snippets:

```powershell
npm run inspect:item-report -- <parser-report-or-item-text.md>
npm run inspect:build-report -- <build-report.md>
npm run inspect:coc-report -- <coc-report.md>
```

In the portable Windows zip, use `.\runtime\node\npm.cmd run ...` if `npm` is not on `PATH`.

## Privacy And Safety

- The app binds to `127.0.0.1`.
- Build files and pasted item text stay on your computer.
- Temporary candidate builds are written locally.
- Save over original requires confirmation and creates a backup first.
- Diagnostics are designed to avoid full local build paths.

## More Docs

- `START_HERE.md`: short user quick start.
- `docs/windows-launcher.md`: launcher, logs, ports, and troubleshooting.
- `docs/release-preflight.md`: read-only release zip and privacy/safety preflight.
- `docs/build-coverage-scan.md`: read-only build scan for skill-set and weapon-swap support cases.
- `docs/coc-model-validation.md`: validation workflow for the optional CoC Frost model.
- `docs/release-qa.md`: release QA checklist.
- `docs/github-release.md`: GitHub release publishing checklist.
- `ROADMAP.md`: product roadmap and remaining validation work.
