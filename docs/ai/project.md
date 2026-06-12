# Project Memory

## Snapshot
- Product: local-only PoE2/PoB2 item delta tool for comparing the current saved PoB2 build item against pasted official trade/game item text.
- Status: working local MVP and 0.1.0 release candidate; first GitHub release is ready for explicit approval, but not committed, pushed, tagged, or published.
- Repo: `D:\Codex\PoB Item Delta`; origin `https://github.com/Smellybum1/PoB-Item-Delta.git`; branch `main`; no local commits yet.
- Stack: npm workspaces, TypeScript, Express backend, Vite React frontend, shared API package.
- Primary friend artifact: `output/releases/PoB-Item-Delta-0.1.0-portable-win-x64.zip`; lean secondary zip: `output/releases/PoB-Item-Delta-0.1.0.zip`.

## Commands
- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test`
- Typecheck/build: `npm run typecheck`, `npm run build`
- Local production: `npm run start:local`
- Windows launcher: `tools/windows/Start-PoB-Item-Delta.cmd`
- Stop helper: `tools/windows/Stop-PoB-Item-Delta.cmd`
- Lean zip: `npm run release:zip`
- Portable zip: `npm run release:zip:portable`
- Release preflight: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-ReleasePreflight.ps1`
- GitHub readiness: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-Item-Delta-GitHubReleaseReadiness.ps1`
- Release notes/assets: `npm run release:notes`; `powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1`
- Publish packet: `npm run release:packet`

## Key Paths
- `apps/server`: Express API, PoB XML/settings integration, Lua bridge client, report inspectors.
- `apps/web`: React UI and local dashboard flow.
- `packages/shared`: shared API/model types and CoC model math.
- `tools/pob-lua`: PoB wrapper scripts for headless/recalculation and temp preview.
- `tools/windows`: local launcher, packaging, preflight, release readiness, build coverage scanner.
- `ROADMAP.md`: source of remaining product work.

## Guardrails
- Local-only: never upload build, settings, item text, diagnostics, or reports.
- Do not overwrite a PoB build unless the user explicitly confirms Save; save creates backup first.
- Do not commit, push, tag, or publish without explicit user approval.
- Treat generated folders as disposable unless actively validating release artifacts: `tmp/`, `.playwright-cli/`, `dist/`, `node_modules/`, `output/`.
- PoB `Settings.xml` can contain sensitive fields; read only minimum required fields and never log or display raw settings.
- Keep generic item comparison build-agnostic; CoC Frostbolt/Frost Wall modeling stays optional and profile-based.
- Keep installed PoB folders read-only except for explicit user-approved actions.

## Current Capabilities
- Detects the current saved PoB2 build from configured local PoB settings.
- Creates temp build copies, equips pasted candidate items, compares before/after stats, and preserves originals.
- Optional PoB Lua bridge recalculates native stats when enabled/configured; XML cached stats remain fallback.
- Supports target skill selection, primary/swap weapon slots, save-as-new, save-over-original with backup, restore backup, and open temp build in PoB preview.
- UI includes verdict/priority cards, delta filters, side-by-side item text, compare list, help/walkthrough, diagnostics, item/build/CoC report copy actions, and in-app build scan.
- Parser coverage includes common armour/jewelry/offhand/weapon families, plus PoB-data-backed talisman and fishing rod as two-handed weapon families.

## Latest Validation
- `npm test`: passed after talisman/fishing rod parser update.
- `npm run build`: passed after talisman/fishing rod parser update.
- Lean and portable zips regenerated after the latest source/docs updates.
- Release preflight: passed for both zips.
- GitHub release readiness: `ready-for-approval`.
- Use `tools/windows/Get-PoB-Item-Delta-ReleaseAssets.ps1` for current zip sizes and SHA256s.

## Open Work
- Release: commit/push, wait for CI, tag `v0.1.0`, and publish GitHub release only after explicit user approval.
- Phase 1: collect exact real pasted item examples and add fixtures when formatting differs from representative samples.
- Phase 5: validate a real build that has both weapon-swap gear and multiple saved skill sets.
- Phase 5: add more PoE2-specific slot/offhand rules only from exact real pasted examples or PoB base-data evidence.
- Phase 6: validate or revise the CoC Frostbolt/Frost Wall formula against repeatable gameplay/PoB observations.

## Useful Evidence References
- Release docs: `docs/github-release.md`, `docs/release-preflight.md`, `docs/release-qa.md`
- Packaging evidence: `docs/ai/packaging.md`, `docs/ai/portable-runtime-qa-2026-06-12.md`
- Build validation evidence: `docs/ai/real-build-validation-2026-06-12.md`
- Slot-family audit: `docs/ai/slot-family-audit-2026-06-12.md`
- Real item sample workflow: `docs/ai/real-item-sample-workflow.md`
- CoC workflow: `docs/coc-model-validation.md`
