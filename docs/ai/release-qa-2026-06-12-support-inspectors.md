# Release QA: Support Inspectors

Date: 2026-06-12

Scope: verify the parser/build/CoC support inspector commands are packaged as built JavaScript entrypoints and included in both current release zips.

## Changes Verified

- Root support scripts now route through workspace scripts that execute built `apps/server/dist/tools/*.js` files.
- Release preflight now requires the inspector source files and built archive entrypoints.
- Release QA docs include smoke checks for `inspect:item-report`, `inspect:build-report`, and `inspect:coc-report`.
- Inspector docs include portable Windows usage with `.\runtime\node\npm.cmd` when `npm` is not on PATH.

## Commands Run

```powershell
npm run build
npm run inspect:item-report --
npm run inspect:build-report --
npm run inspect:coc-report --
npm run typecheck
npm test
npm run release:zip -- -SkipBuild
npm run release:zip:portable -- -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1 -ZipPath output/releases/PoB-Item-Delta-0.1.0-portable-win-x64.zip -Json
.\runtime\node\npm.cmd run inspect:item-report --
```

## Evidence

- `npm run build` passed.
- Root inspector smoke tests passed using built `node dist/tools/...` commands.
- `npm run typecheck` passed.
- `npm test` passed: shared 3 tests, server 73 tests.
- Lean zip rebuilt: `output/releases/PoB-Item-Delta-0.1.0.zip`.
- Portable zip rebuilt: `output/releases/PoB-Item-Delta-0.1.0-portable-win-x64.zip`.
- Lean preflight passed with required repo files and archive entries present.
- Portable preflight passed with required repo files and archive entries present.
- Portable staging smoke passed through bundled `runtime\node\npm.cmd run inspect:item-report --`.

Exact archive byte sizes can change after doc-only release handoff updates. Use the latest `Test-PoB-Item-Delta-ReleasePreflight.ps1 -Json` output before publishing.

## Remaining Release Gate

Commit, push, tag, and publish still require explicit user approval.

## Follow-Up: Build Scanner Readiness Smoke

Later release-readiness hardening added a temp-only build coverage scanner smoke to `tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1`. The smoke creates a nested representative build plus one intentionally unreadable XML file under the OS temp folder, then verifies the scanner reports two XML files, one parsed build, one skipped file, and path-sanitized Markdown output. This protects the friend-support scanner behavior without touching real PoB builds.

## Follow-Up: Publish Packet

`tools/windows/Get-PoB-Item-Delta-PublishPacket.ps1` now generates a read-only approval packet after release readiness passes. It prints the approval-gated commit, push, CI wait, tag, and GitHub release handoff commands plus current asset paths and checksums. It does not execute external writes.

GitHub CI now runs the same helper with `-SkipRemote` after the release notes preview, so the packet format is checked after push without probing remote tags or publishing anything.

## Follow-Up: Item Paste Issue Snippets

`npm run inspect:item-report -- <report.md>` now prints a copyable GitHub issue snippet in addition to fixture-entry and test-case hints. This makes exact pasted item samples easier to report consistently before converting them into regression fixtures.

## Follow-Up: Build And CoC Issue Snippets

`npm run inspect:build-report -- <report.md>` and `npm run inspect:coc-report -- <report.md>` now also print copyable GitHub issue snippets. This keeps real-build validation and CoC formula observations consistent before they are converted into fixtures, docs, or formula changes.
