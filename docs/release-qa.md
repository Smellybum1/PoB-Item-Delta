# Release QA Checklist

Use this before sharing a zip or publishing a GitHub release.

## Build And Tests

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run release:zip -- -SkipBuild` after the final build.
- [ ] Run `npm run release:zip:portable -- -SkipBuild` after the final build.
- [ ] Confirm `output/releases/PoB-Item-Delta-<version>.zip` exists.
- [ ] Confirm `output/releases/PoB-Item-Delta-<version>-portable-win-x64.zip` exists.
- [ ] Run `tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1`.
- [ ] Run `tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1 -ZipPath output/releases/PoB-Item-Delta-<version>-portable-win-x64.zip`.
- [ ] Run `tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1` and confirm it reports `ready-for-approval`, including remote tag availability and build coverage scanner JSON/Markdown smoke, before any external publish step.
- [ ] Run `tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1` and keep the asset sizes/checksums with the release notes.
- [ ] Run `npm run release:notes` and confirm it prints the GitHub release body plus current checksum table.
- [ ] Run `npm run release:packet` and confirm it prints the approval-gated command sequence plus current release assets without executing external writes.
- [ ] After pushing the release branch, confirm the GitHub `CI` workflow passes before creating or publishing the release tag.

## Clean Zip Smoke

- [ ] Extract the zip into a clean temp folder.
- [ ] Run `tools/windows/Start-PoB-Item-Delta.cmd -Port 5186 -NoBrowser -SkipBuild`.
- [ ] Confirm `http://127.0.0.1:5186/api/health` returns `{"status":"ok"}`.
- [ ] Confirm `http://127.0.0.1:5186/` serves the PoB Item Delta UI.
- [ ] Run `tools/windows/Stop-PoB-Item-Delta.cmd`.
- [ ] Confirm the health endpoint no longer responds.
- [ ] Run the start wrapper with `POB_ITEM_DELTA_NO_PAUSE=1` and `PATH` stripped of PowerShell/Node; confirm it exits non-zero and prints failure guidance.
- [ ] For dependency-staged or portable-runtime zips, run preflight against that zip path and smoke start with Node/npm absent from `PATH`.
- [ ] Remove the temp extraction.

## App Smoke

- [ ] Open the app.
- [ ] Confirm app version appears in the header.
- [ ] Confirm Help & Diagnostics appears and Copy diagnostics works.
- [ ] Confirm Copy build report works and does not include full local paths or raw pasted item text.
- [ ] Confirm Copy build scan works and does not include the full local build folder path.
- [ ] Confirm PoB Native Calculation shows setup/readiness checks.
- [ ] Refresh current build after saving in PoB.
- [ ] Paste a representative trade item and create a temp copy.
- [ ] Confirm the delta report appears and original build is unchanged.
- [ ] Enable the optional CoC Frost model and confirm Copy validation report copies local-only model context.
- [ ] Confirm Save over original still requires confirmation.
- [ ] Confirm Save as new build writes a sibling build without changing the original.

## Build Support Smoke

- [ ] Run `tools/windows/Test-PoB-BuildCoverage.ps1 -BuildsPath <PoB2 Builds folder>`.
- [ ] Run `tools/windows/Test-PoB-BuildCoverage.ps1 -BuildsPath <PoB2 Builds folder> -Markdown` and confirm it omits the full local builds folder path.
- [ ] Confirm it prints XML file count, parsed build count, skipped XML count, swap-gear counts, multiple-skill-set counts, and one row per parsed build.
- [ ] Run the same command with `-Json` and confirm the JSON can be copied into a support note after private paths are removed.
- [ ] Run `npm run inspect:item-report -- <parser-report-or-item-text.md>` against a local sample and confirm it prints parsed slot compatibility.
- [ ] Run `npm run inspect:build-report -- <build-report.md>` against a local sample and confirm it flags observation readiness.
- [ ] Run `npm run inspect:coc-report -- <coc-report.md>` against a local sample and confirm it flags observation readiness.

## Local-Only Safety

- [ ] Confirm the app URL uses `127.0.0.1`.
- [ ] Confirm diagnostics do not include full local build paths.
- [ ] Confirm build validation reports do not include full local build paths or raw pasted item text.
- [ ] Confirm docs state that build files and pasted item text are not uploaded.
- [ ] Confirm launcher logs are under `%LOCALAPPDATA%\PoB Item Delta\logs`.

## Release Notes

- [ ] Update `CHANGELOG.md`.
- [ ] Update `README.md` if user setup, requirements, privacy behavior, or known limits changed.
- [ ] Update `START_HERE.md` if setup steps changed.
- [ ] Update `docs/windows-launcher.md` if launcher behavior changed.
- [ ] Update `docs/release-preflight.md` if release-preflight behavior changed.
- [ ] Update `docs/build-coverage-scan.md` if build scanner behavior changed.
- [ ] Update `docs/coc-model-validation.md` if model validation-report behavior changed.
- [ ] Update `ROADMAP.md` with completed and remaining release work.
- [ ] Update `.github/workflows/ci.yml` if release package commands or preflight commands change.
- [ ] Confirm `output/` release artifacts are attached to the GitHub release only, not staged for commit.
