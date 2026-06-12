# Changelog

## 0.1.1 - 2026-06-12

### Fixed

- Kept the PoB Lua bridge warm between native recalculations so repeated item comparisons do not pay the full PoB startup cost each time.
- Skipped duplicate runtime mirror preflight work on the hot comparison path; setup diagnostics still run the full readiness checks.

## 0.1.0 - 2026-06-11

Initial local MVP release candidate.

### Added

- Current saved PoB2 build detection from local PoB settings.
- Item text paste flow for official PoE2 trade-style item blocks.
- Temporary build copy creation with candidate item equipped in the selected slot.
- PoB Lua bridge recalculation when enabled and configured, with XML cached-stat fallback.
- Delta report for DPS, average hit, crit chance, cast/attack rate, mana cost/sec, mana regen, ES, life, resists, attributes, and spirit.
- Decision summary, priority cards, warnings, changed-stat filters, and side-by-side current/candidate item text.
- Target skill selector and primary/swap weapon slot support.
- Compare list for multiple candidate items in one session.
- Safe save flows: Save over original with confirmation/backup, Save as new build, backup listing, and restore.
- Open temp build in PoB preview wrapper without changing PoB `Settings.xml`.
- Optional CoC Frostbolt/Frost Wall model with per-build profiles, import/export, and confidence labels.
- Local app settings for PoB paths, Lua bridge setting, and custom model profiles.
- Windows local launcher and stop helper, including failure guidance when prerequisites are missing.
- Optional dependency-staged and portable-runtime release packaging support for larger friend-ready zips.
- Repeatable `npm run release:zip:portable` command that downloads and verifies official Node.js before packaging.
- Shareable lean zip and portable Windows zip created with the release script.
- Installer revisit decision for 0.1.0: keep the portable Windows zip as the primary artifact and defer Electron/Tauri until post-release feedback shows a concrete installer need.
- In-app help with screenshot-backed walkthrough and copyable local diagnostics.
- Copyable item reports for failed or successful item pastes to help turn exact real trade text into fixtures.
- Item report inspector now prints copyable fixture-entry and test-case hints for adding exact pasted samples.
- Item report inspector now prints a copyable GitHub issue snippet for exact pasted samples.
- Local support inspectors for copied parser, build-validation, and CoC model validation reports.
- Build validation inspector now prints a copyable GitHub issue snippet for target skill, weapon swap, recalculation, save/backup, and slot observations.
- CoC validation inspector now prints a copyable GitHub issue snippet for repeatable model/formula observations.
- CoC validation reports now include repeat-sample result rows, and the inspector summarizes completed sample count plus aggregate verdict.
- Build coverage scanner now flags roadmap validation candidates with both swap gear and multiple saved skill sets.
- Build coverage scanner can auto-discover common Windows Documents/OneDrive PoB2 build folders before requiring a manual `-BuildsPath`.
- Build coverage scanner now scans nested folders and reports unreadable XML files without aborting the whole scan.
- Build coverage scanner now has a path-sanitized `-Markdown` report mode for friend/support sharing.
- Help & Diagnostics now includes Copy build scan, which copies a path-sanitized saved-build coverage report without requiring terminal commands.
- Release preflight now checks the in-app build-scan source, test, and built server module before a zip is shared.
- Item parser now recognizes PoB2 talismans and fishing rods as two-handed weapon families from local PoB base data.
- CoC validation inspector now reports a formula-review verdict for missing comparison, close match, moderate difference, or model mismatch.
- Read-only GitHub release readiness helper for final local zip/preflight/git/tag, remote tag availability, and generated-path checks before approval-gated publishing.
- Read-only release asset summary helper for GitHub release zip sizes and SHA256 hashes.
- Read-only release notes generator that prints the GitHub release body with current checksum table.
- Release readiness now verifies the generated release notes include expected asset names and checksums.
- Release readiness now runs a temp-only build coverage scanner smoke for nested-folder and unreadable-XML support.
- Read-only publish packet helper for the approval-gated commit, push, CI wait, tag, and GitHub release handoff.
- GitHub Actions CI workflow for Windows tests, build, lean/portable release packaging, release preflight, readiness dry-run, asset summary, release notes preview, and publish packet dry-run.
- Friend-facing `README.md` and GitHub release checklist.
- GitHub issue templates for item paste failures and build validation reports.

### Notes

- The lean zip requires Node.js LTS. The portable Windows zip includes official Node.js v24.16.0 and staged dependencies.
- The app is local-only and binds to `127.0.0.1`.
- Exact real trade samples and CoC formula validation still need more real-world evidence.
