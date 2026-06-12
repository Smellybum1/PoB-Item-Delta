# Packaging Notes

## Current Decision

The near-term friend-share path is a Windows local web app launcher:

- Build the TypeScript server and Vite React frontend.
- Let the Express production server serve `apps/web/dist` and `/api/*` from one `127.0.0.1` origin.
- Start/stop it with `tools/windows/Start-PoB-Item-Delta.cmd` and `tools/windows/Stop-PoB-Item-Delta.cmd`.
- Create a shareable zip with `npm run release:zip`.
- Create the primary portable Windows zip with `npm run release:zip:portable`.

This avoids adding Electron/Tauri before the core item comparison behavior settles, while still giving non-developers a double-clickable local app.

Default lean zips require Node.js LTS and do not include `node_modules` or a portable Node runtime. The launcher installs npm dependencies on first run when `node_modules` is absent. The portable Windows zip includes official Node.js and staged dependencies, and is the easiest friend-facing artifact.

## Installer Revisit: 0.1.0

Decision: do not add Electron or Tauri for the 0.1.0 public release candidate.

Reasons:

- The portable Windows zip already runs without a separate Node.js install.
- The local web app keeps one backend process and one browser UI, which matches the current architecture and PoB Lua bridge behavior.
- Adding a desktop shell now would add installer/signing/auto-update/UI-shell maintenance before real player feedback proves that those costs solve a concrete problem.
- The current release gate already validates the portable runtime, start/stop helper, local-only privacy wording, support inspectors, build scanner, release notes, and publish packet.

Revisit a true installer after 0.1.x feedback if users consistently need one or more of:

- Start menu shortcuts and uninstall support.
- Auto-update or update notifications.
- Desktop-window behavior without a visible browser.
- Windows signing or a more polished security prompt story.
- File association or drag/drop workflows that are awkward in the browser.

Until then, the release recommendation stays: publish the portable Windows zip as the primary asset and the lean zip as a secondary asset.

## Evidence

- `apps/server/src/index.ts` serves the built web app when `apps/web/dist/index.html` exists.
- `npm run build` produces both server and web build outputs.
- `npm run release:zip` creates `output/releases/PoB-Item-Delta-0.1.0.zip` with built app assets, screenshot-backed help assets, friend-facing docs, release QA evidence, and a `release-manifest.json`.
- `tools/windows/New-PoB-Item-Delta-Release.ps1 -IncludeNodeModules` creates a larger dependency-staged zip. Preflight passed on 2026-06-12 for `output/portable-test/PoB-Item-Delta-0.1.0.zip` with 7,143 archive entries and `includesNodeModules: true`.
- `tools/windows/New-PoB-Item-Delta-PortableRelease.ps1` downloads the pinned official Node.js Windows x64 zip, verifies SHA256, and then calls the main release script with staged dependencies and portable runtime flags.
- `tools/windows/New-PoB-Item-Delta-Release.ps1` can stage `runtime/node` from `-PortableNodePath` or `-PortableNodeZipPath`; the launcher prefers that runtime before PATH Node. On 2026-06-12, the official Node.js v24.16.0 Windows x64 zip was SHA256-verified, then used to build `output/releases/PoB-Item-Delta-0.1.0-portable-win-x64.zip`.
- Portable runtime QA on 2026-06-12 extracted the final portable zip to a clean folder, started it on `127.0.0.1:5199` with Node/npm absent from PATH, verified `/api/health` and built React HTML, and stopped it cleanly. Details are in `docs/ai/portable-runtime-qa-2026-06-12.md`.
- Launcher QA on 2026-06-11 started the app on `127.0.0.1:5184`; `/api/health` returned `{"status":"ok"}` and `/` returned built React HTML from the same server.
- Wrapper QA on 2026-06-11 verified `tools/windows/Start-PoB-Item-Delta.cmd` starts the same production server and records launcher state.
- Launcher hardening on 2026-06-12 kept `.cmd` windows open on failure by default, added `POB_ITEM_DELTA_NO_PAUSE=1` for scripted checks, and improved missing Node/npm setup instructions.
- `tools/windows/Stop-PoB-Item-Delta.cmd` closed the QA server and the health endpoint stopped responding.
- Clean zip QA on 2026-06-11 extracted the release zip to a clean temp folder, let the launcher run `npm install`, started the app on `127.0.0.1:5194`, verified `/api/health`, verified built React HTML, and stopped the app.
- Post-QA hardening added `README.md`, `docs/github-release.md`, `docs/ai/real-item-sample-workflow.md`, and a local-only Copy item report path for failed or successful item pastes.
- Support inspectors for parser reports, build validation reports, and CoC validation reports run from built `apps/server/dist/tools/*.js` entrypoints so release zips do not need the dev-only `tsx` runner. Packaging QA evidence for this is in `docs/ai/release-qa-2026-06-12-support-inspectors.md`.

## Remaining Packaging Work

- Publish the portable Windows zip as the primary public asset; keep the lean zip as a secondary asset for users who already have Node.js LTS.
- Revisit Electron/Tauri only after post-release feedback shows a true installer would solve a real user problem.
- Publish a GitHub release only after explicit user approval, using `docs/github-release.md`.
