# GitHub Release Checklist

Use this when publishing a PoB Item Delta release to GitHub. Publishing is an external write, so get explicit user approval before pushing commits, tags, or release assets.

## Current Release Candidate

- Version: `0.1.1`
- Primary zip asset: `output/releases/PoB-Item-Delta-0.1.1-portable-win-x64.zip`
- Secondary lean zip asset: `output/releases/PoB-Item-Delta-0.1.1.zip`
- QA evidence: `docs/ai/release-qa-2026-06-11.md`
- Support-inspector packaging QA: `docs/ai/release-qa-2026-06-12-support-inspectors.md`
- Changelog: `CHANGELOG.md`

## Local Preflight

Run from the repo root:

```powershell
npm test
npm run build
npm run release:zip -- -SkipBuild
npm run release:zip:portable -- -SkipBuild
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1 -ZipPath output/releases/PoB-Item-Delta-0.1.1-portable-win-x64.zip
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1
npm run release:notes
npm run release:packet
```

Then verify the final archive:

- includes `README.md`,
- includes `START_HERE.md`,
- includes `CHANGELOG.md`,
- includes `ROADMAP.md`,
- includes `docs/build-coverage-scan.md`,
- includes `docs/coc-model-validation.md`,
- includes `docs/release-preflight.md`,
- includes `docs/ai/release-qa-2026-06-11.md`,
- includes `docs/ai/release-qa-2026-06-12-support-inspectors.md`,
- includes `tools/windows/Get-PoB-Item-Delta-GitHubReleaseNotes.ps1`,
- includes `tools/windows/Get-PoB-Item-Delta-PublishPacket.ps1`,
- includes `tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1`,
- includes `tools/windows/Start-PoB-Item-Delta.cmd`,
- includes `tools/windows/Test-PoB-BuildCoverage.ps1`,
- includes `tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1`,
- includes `tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1`,
- includes built support inspector entrypoints under `apps/server/dist/tools`,
- includes built web assets under `apps/web/dist`.

Current local preflight evidence:

- Lean zip: latest local preflight passed with required repo files and archive entries present.
- Portable zip: latest local preflight passed with required repo files, archive entries, staged dependencies, and portable Node runtime present.
- Portable support smoke: passed with `.\runtime\node\npm.cmd run inspect:item-report --`.
- GitHub release readiness helper reports `ready-for-approval` when local checks pass, `v0.1.1` is available locally and on `origin`, generated artifacts are not visible to git, the build coverage scanner smoke passes, the release notes preview includes expected assets/checksums, and only external writes remain. Use `-SkipRemote` only for offline dry-runs.
- Publish packet helper prints the exact approval-gated commit/push/CI/tag/release handoff commands plus current assets/checksums without executing external writes.
- GitHub CI prints the publish packet with `-SkipRemote` so the handoff format is checked after push without publishing anything.

Use the latest `-Json` preflight output for exact archive sizes before publishing.
Use `tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1` for copyable asset sizes and SHA256 hashes.
Use `npm run release:notes` for a copyable GitHub release body that appends the current checksum table to the draft below.
Use `npm run release:packet` for a read-only publish packet after readiness is green.

Then verify the repository source includes:

- `.github/workflows/ci.yml`,
- `.github/ISSUE_TEMPLATE/item-paste-failed.md`,
- `.github/ISSUE_TEMPLATE/build-validation.md`.

## Repository Prep

Before release publishing:

1. Review `git status --short`.
2. Confirm no local secrets, PoB user settings, build XMLs, temp folders, `node_modules`, `dist`, or `output` release artifacts are staged.
3. Confirm `.github/ISSUE_TEMPLATE/` includes item paste and build validation templates.
4. Confirm `.github/workflows/ci.yml` is present so GitHub can run the Windows release preflight after push.
5. Commit the release candidate.
6. Push the branch to `origin`.
7. Wait for the GitHub `CI` workflow to pass on the pushed branch.
8. Create and push tag `v0.1.1`.

For the first publish, `origin/main` may not exist yet; the readiness helper reports this as informational. A remote `v0.1.1` tag already existing is a blocker.

Do not run the push or tag commands without explicit approval.

After explicit approval, `npm run release:packet` prints the command sequence and release asset context to follow. Treat every command in that packet as approval-gated.

## Release Notes Draft

Title:

```text
PoB Item Delta 0.1.1
```

Body:

```markdown
Patch release for the PoB-native calculation bridge.

Fixes:
- Keeps the PoB Lua bridge warm between native recalculations so repeated item comparisons do not pay the full PoB startup cost each time.
- Skips duplicate runtime mirror preflight work on the hot comparison path. Setup diagnostics still run the full readiness checks.

Still included from 0.1.0:
- Current saved PoB2 build detection.
- Pasted trade item text to temporary build copy.
- PoB Lua bridge recalculation when configured, with XML fallback.
- DPS, average hit, crit, speed, mana, ES/life, resist, attribute, and spirit deltas.
- Safe save flows, backups, restore, and Open temp build in PoB.
- Local-only Windows launcher and portable-runtime zip.

Requirements:
- Windows.
- Use the portable Windows zip for easiest setup; the smaller lean zip requires Node.js LTS with npm.
- Path of Building Community for PoE2 installed locally.

Privacy:
- Runs on 127.0.0.1.
- Does not upload build files or pasted item text.
- Original builds are not overwritten unless explicitly confirmed.

Known limits:
- The lean zip requires Node.js separately; the portable Windows zip includes Node.js v24.16.0.
- There is no installer yet; use the portable Windows zip for easiest setup.
- More real pasted item samples are still needed for parser hardening.
- The CoC Frostbolt/Frost Wall model remains assumption-driven until validated with repeatable observations.
```

Attach:

```text
output/releases/PoB-Item-Delta-0.1.1-portable-win-x64.zip
output/releases/PoB-Item-Delta-0.1.1.zip
```

Attach these files to the GitHub release; do not commit the `output/` folder to the repository.

Optional checksum table:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1
```

Copyable release body with current checksums:

```powershell
npm run release:notes
```

## After Publishing

1. Download the release zip from GitHub.
2. Extract it to a clean folder.
3. Run `tools/windows/Start-PoB-Item-Delta.cmd -Port 5198 -NoBrowser -SkipBuild`.
4. Confirm `/api/health` returns `{"status":"ok"}`.
5. Confirm the app loads in the browser.
6. Stop it with `tools/windows/Stop-PoB-Item-Delta.cmd`.
