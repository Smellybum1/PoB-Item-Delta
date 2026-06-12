# Release QA Evidence: 0.1.0

Date: 2026-06-11

Scope: release-readiness pass for the first shareable Windows localhost zip.

## Result

Status: pass with explicit non-published caveat.

The app is ready for a private/shareable zip candidate. Public GitHub release publishing is not done because that is an external write and needs explicit approval.

## Build And Tests

- Passed: `npm test`
  - Shared: 1 test file, 3 tests.
  - Server: 8 test files, 61 tests.
- Passed: `npm run build`
  - Shared TypeScript build passed.
  - Server TypeScript build passed.
  - Web TypeScript plus Vite production build passed.
- Passed: `npm run release:zip -- -SkipBuild`
  - Created `output/releases/PoB-Item-Delta-0.1.0.zip`.
  - Final archive evidence after parser-report and release-prep hardening: 99 files.
  - Final archive includes `README.md`, `docs/github-release.md`, `docs/ai/release-qa-2026-06-11.md`, `ROADMAP.md`, Windows launcher scripts, and help screenshots.
- Passed: portable Windows packaging on 2026-06-12
  - Created `output/releases/PoB-Item-Delta-0.1.0-portable-win-x64.zip`.
  - Built through `npm run release:zip:portable -- -SkipBuild`.
  - Built from SHA256-verified official Node.js v24.16.0 Windows x64 zip.
  - Final portable archive passed release preflight.
  - Detailed evidence: `docs/ai/portable-runtime-qa-2026-06-12.md`.

## Clean Zip Smoke

- Passed: extracted `output/releases/PoB-Item-Delta-0.1.0.zip` into a clean temp folder.
- Passed: ran `tools/windows/Start-PoB-Item-Delta.cmd -Port 5194 -NoBrowser -SkipBuild -StartupTimeoutSeconds 120`.
- Passed: first launch installed npm dependencies from the zip extraction.
  - npm added 203 packages.
  - npm audit reported 0 vulnerabilities.
- Passed: `http://127.0.0.1:5194/api/health` returned `{"status":"ok"}`.
- Passed: `http://127.0.0.1:5194/` returned HTTP 200 for the built UI.
- Passed: `tools/windows/Stop-PoB-Item-Delta.cmd` stopped the server.
- Passed: health endpoint stopped responding after stop.

## App Smoke

- Passed: launched production UI on `http://127.0.0.1:5193/`.
- Passed: header displayed `PoB Item Delta v0.1.0`.
- Passed: Help & Diagnostics displayed build, bridge, stat, and slot readiness.
- Passed: Copy diagnostics showed `Diagnostics copied.`
- Passed: PoB Native Calculation panel displayed setup/readiness checks and XML fallback messaging.
- Passed: pasted representative multiline copied item text into the UI.
- Passed: Create temp copy produced:
  - temp-copy ready status,
  - side-by-side current/candidate item text,
  - save preview,
  - Compare List entry,
  - Delta Report table.
- Passed: visual walkthrough expanded and rendered screenshots.
- Evidence screenshot: `output/playwright/release-qa-2026-06-11.png`.

## Post-QA Hardening

- Added a local-only Copy parser report action for failed item pastes. Later hardening renamed the user-facing action to Copy item report and made it available for successful pasted samples too.
- Added `docs/ai/real-item-sample-workflow.md` for turning exact failed paste reports into regression fixtures.
- Added `README.md` and `docs/github-release.md` so friends and release publishing have clear handoff docs.
- Added GitHub issue templates for item paste failures and build validation reports.
- Added fixture coverage for occupied offhand replacement, empty swap offhand equip with weapon set II, and empty primary weapon replacement without touching offhand.
- Added PoB-data-backed fixture coverage for sceptre, spear, flail, axe, mace, sword, bow, crossbow, dagger, claw, quarterstaff, trap tool, and quiver copied/trade-style item samples.
- Added a read-only saved-build coverage scanner for target-skill and weapon-swap support cases; local scan found 8 builds, including 4 with swap gear and 0 with multiple skill sets.
- Added a local-only Copy validation report action and docs for CoC Frost model observation collection.
- Added a local-only Copy build report action for target-skill, weapon-swap, slot replacement, recalculation, and save/backup validation without full local paths or raw pasted item text.
- Hardened Windows launcher failure handling so double-clicked command windows stay open on errors and missing Node/npm messages point to Node.js LTS plus launcher docs.
- Added optional dependency-staged and portable-runtime release packaging support. A dependency-staged test zip passed preflight, and the final portable Windows zip started from clean extraction on `127.0.0.1:5199` with Node/npm absent from PATH.
- Added a read-only release preflight for required files, archive contents, manifest values, and local/private file safety; latest run passed for the refreshed zip.
- Passed follow-up checks: `npm run typecheck`, `npm run build`, `npm test`, browser smoke of the parser-report error path, and browser smoke of the CoC validation-report copy flow.

## Local-Only Safety

- Passed: app URLs used `127.0.0.1`.
- Passed: direct `/api/diagnostics` check returned:
  - `version: "0.1.0"`,
  - `localOnly: true`,
  - no full Windows paths in the JSON payload.
- Passed: docs state that build files and pasted item text are not uploaded.
- Passed: launcher logs are written under `%LOCALAPPDATA%\PoB Item Delta\logs`.

## Save Safety

Not run against the user's real PoB build during release QA. This avoids destructive or irreversible writes to a live build.

Covered by automated tests that passed in this QA run:

- Save over original refuses without confirmation.
- Save over original creates a backup before overwrite.
- Save as new build creates a sibling build and preserves original/temp files.
- Backup restore requires confirmation and creates a pre-restore backup.
- Temp equip leaves original build bytes unchanged.

## Remaining Release Work

- Publish a GitHub release after explicit user approval.
- Keep collecting exact real pasted item samples.
- Validate or revise the optional CoC Frostbolt/Frost Wall formula against repeatable gameplay or PoB observations.
