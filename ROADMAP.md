# ROADMAP.md

## Direction
Build a local-only PoE2/PoB2 item delta tool that helps players decide whether a pasted candidate item is worth equipping or buying.

The end product should be easy for non-developers to run: one local app, current saved PoB2 build detection, pasted trade item text, PoB-native recalculated before/after deltas, clear verdicts, and safe save/backup flows.

The core tool stays build agnostic. Build-specific logic, including CoC Frostbolt/Frost Wall modeling, remains optional and layered on top of the generic comparison flow.

## Current Baseline
- Status: working local MVP.
- Stack: npm workspaces, TypeScript, Express backend, Vite React frontend, shared API types.
- Current flow: detects current saved PoB2 build, accepts pasted item text, creates a temporary build copy, equips the candidate, recalculates through the optional PoB Lua bridge when enabled, and shows before/after deltas.
- Safety: original build is not overwritten unless the user explicitly clicks Save and confirms; save creates a backup first. Temp builds can be opened in a PoB preview process without writing the temp path back to `Settings.xml`.
- Build-agnostic workflow: users can choose a target skill from the saved build, compare primary or swap weapon slots, keep multiple temp-copy comparisons in a session compare list, and rank them by overall, DPS, sustain, ES/life, resists, attributes, or spirit priorities.
- Remaining caveats: exact real-world paste samples, active weapon-set calculation scenarios, fuller offhand compatibility rules, custom model validation, and public release publishing still need more work.

## Fully Live End Product
Done means:
- A friend can download or clone the app, run it locally, and compare items without Codex or manual environment setup.
- The app finds PoB2 paths or guides the user through setup.
- PoB-native recalculation is available from the UI by default when prerequisites are present.
- Trade-site item text works reliably across common gear slots and item formats.
- The report quickly answers upgrade/downgrade/mixed, then offers detailed deltas.
- Save actions are explicit, backed up, and reversible.
- The app remains local-only and never uploads build or item data.

## Phase 1: Reliability Hardening
Goal: make the current compare flow trustworthy across real trade items.

Status: mostly complete; keep collecting exact real paste examples as players find edge cases.

Tasks:
- In progress: Add real copied item samples for every supported slot: weapon, offhand, shield/focus/quiver, rings, amulet, belt, helm, body armour, gloves, and boots.
  - Done: Add representative copied/trade-style fixture samples for weapon, wand, sceptre, spear, flail, axe, mace, sword, bow, crossbow, dagger, claw, quarterstaff, trap tool, shield, focus, quiver, rings, amulet, belt, helm, body armour, gloves, and boots.
  - Done: Add a copyable parser report action for failed pasted items so exact real samples can be captured locally with slot/error context.
  - Done: Allow Copy item report before or after temp-copy creation so successful real trade samples can be captured with the selected slot too.
  - Done: Add a GitHub issue template for failed item pastes, wrong slot inference, and offhand replacement issues.
  - TODO: Replace or supplement sanitized fixtures with exact pasted examples from real user/trade-site copies as they are collected.
- In progress: Handle more trade text formats: missing rarity, missing `Item Class:`, corrupted items, quality, requirements, forged/rune lines, sockets, implicits, explicits, and unusual separators.
  - Done: Cover missing rarity, missing `Item Class:`, corrupted/quality/requirements/forged/socket lines, and unusual separators in representative samples.
  - Done: Document the workflow for turning copied parser reports into regression fixtures in `docs/ai/real-item-sample-workflow.md`.
  - Done: Add a local `npm run inspect:item-report -- <report.md>` helper that extracts copied parser reports or raw item text, reruns the parser, and prints slot compatibility plus fixture hints.
  - Done: Add copyable fixture-entry and test-case hints to the item report inspector so exact pasted examples can become regression fixtures with less manual translation.
  - Done: Add a copyable GitHub issue snippet to the item report inspector so exact pasted examples can be reported consistently before fixture work.
  - TODO: Add more exact implicit/explicit edge cases from real pasted examples.
- Done: Improve parser errors so they explain the fix in player terms.
- In progress: Add slot-specific compatibility tests for one-handed, two-handed, offhand, jewelry, armour, and empty slot cases.
  - Done: Cover one-handed weapon families, two-handed weapon families, trap tools, shield/focus/quiver offhand, jewelry, armour slots, incompatible slot rejection, unknown item type rejection, and incomplete text rejection.
  - Done: Add focused fixture coverage for occupied offhand replacement, empty swap offhand equip with weapon set II, and empty primary weapon replacement without touching offhand.
  - Done: Add a known before/after XML import regression for a representative staff replacement, including item count, inserted item text, slot remapping, preserved existing items, and cached-stat delta behavior.
  - TODO: Add more empty-slot and alternate weapon/offhand cases from exact real builds as they are reported.
- Done: Add automatic cleanup for stale/crowded temp build copies.

Done when pasted trade items rarely fail, and failures explain exactly what to change.

## Phase 2: Native PoB Calculation As Default
Goal: make PoB Lua recalculation feel built in rather than a terminal flag.

Status: complete for the local MVP; continue hardening if new PoB launcher/runtime shapes appear.

Tasks:
- Done: Replace `POB_LUA_ENABLED=true` with an in-app setting saved in a local settings file.
- Done: Add first-run bridge setup and health checks.
  - Done: PoB install folder and PoB `Settings.xml` path are editable in the app and saved locally.
  - Done: Lua bridge checks use the configured PoB install folder.
  - Done: Add runtime mirror readiness check.
  - Done: Add friend-friendly first-run guidance and path examples.
- Done: Add a Recalculate button for the latest temp copy.
- Done: Improve bridge failure recovery: show cause, keep XML fallback honest, and offer retry.
- Done: Harden bridge lifecycle so temp runtime mirrors are cleaned up and duplicate launcher processes are avoided.
- Done: Keep installed PoB folders read-only unless the user explicitly approves otherwise.

Done when native recalculation works from the UI without manual environment variables.

## Phase 3: Better Decision UI
Goal: answer "should I use this item?" quickly.

Status: complete for the local MVP; continue tuning wording and thresholds from real player feedback.

Tasks:
- Done: Keep the compact verdict summary above the full table.
- Done: Add weighted priorities for common player concerns: DPS, sustain, ES/life, resists, attributes, spirit/reservation.
- Done: Add warnings for broken requirements, resistance losses, mana sustain risk, reservation/spirit issues, and offhand clearing.
- Done: Add short "why this changed" explanations, such as average hit gain, crit loss, cast rate gain, or mana sustain loss.
- Done: Add side-by-side current item versus candidate item text.
- Done: Add filters for all stats, changed stats, damage-only, defence-only, and sustain-only.

Done when a user can understand the result in about 10 seconds, then inspect details if needed.

## Phase 4: Save And Build Safety
Goal: make experimentation safe.

Status: complete for the local MVP; continue hardening if new PoB launcher/runtime shapes appear.

Tasks:
- Done: Add Open temp build in PoB.
- Done: Add Save as new build.
- Done: Add backup manager: list backups, restore backup, and show backup path after save.
- Done: Add explicit save preview: original path, temp path, backup behavior, item replaced, and slots cleared.
- Done: Add guard when the current PoB build changes after the temp copy was created.
- Done: Add recovery docs for manual restore.

Done when users can test and save upgrades without fear of losing a build.

## Phase 5: Build-Agnostic Power
Goal: work well for other players and builds.

Status: in progress.

Tasks:
- Done: Improve active skill detection and offer manual skill selection when ambiguous.
  - Done: Expose saved build skill groups in the current-build API.
  - Done: Add a Target Skill selector in the UI.
  - Done: Apply the selected skill to temporary comparison XML without mutating the original build.
- In progress: Support alternate skill sets and weapon swap scenarios.
  - Done: Manual target skill selection can choose across saved skill sets.
  - Done: Primary and swap weapon slots are visible/selectable.
  - Done: Swap-slot comparisons calculate with weapon set II by applying PoB `useSecondWeaponSet` to temporary comparison XML.
  - Done: Add a GitHub issue template for build validation reports covering target skill, weapon swap, PoB-native recalculation, save/backup, and CoC model observations.
  - Done: Add an in-app Copy build report action with safe build, skill, weapon-set, slot, latest comparison, and observation fields for real-build validation.
  - Done: Add a local `npm run inspect:build-report -- <report.md>` helper that checks copied build validation reports for a temp comparison, filled observation fields, weapon-swap/target-skill scope, and PoB Lua recalculation status.
  - Done: Add a copyable GitHub issue snippet to the build report inspector so real build-validation evidence can be reported consistently.
  - Done: Add a read-only build coverage scanner for saved PoB2 build folders.
  - Done: Improve the build coverage scanner so it auto-discovers common Windows Documents/OneDrive PoB2 build folders and can use `POB2_BUILDS_PATH` before requiring `-BuildsPath`.
  - Done: Harden the build coverage scanner for friend folders by scanning nested build folders and reporting unreadable XML files without aborting the whole scan.
  - Done: Add a path-sanitized Markdown mode to the build coverage scanner for copyable friend/support reports.
  - Done: Add an in-app Copy build scan action that copies a path-sanitized build coverage Markdown report without requiring terminal commands.
  - Done: Scan the local build folder on 2026-06-12: 8 builds found, 4 with swap gear, 0 with multiple skill sets, and 0 saved as weapon set II active.
  - Done: Extend the build coverage scanner to surface roadmap validation candidates: builds with both swap gear and multiple saved skill sets.
  - TODO: Validate real mid-combat weapon-swap builds with skill groups socketed across both weapon sets.
- In progress: Make slot rules more complete for PoE2 weapon/offhand types.
  - Done: Offhand compatibility includes primary and swap offhand slots.
  - Done: Two-handed weapons clear only the paired offhand for the selected weapon set.
  - Done: Add PoB-data-backed coverage for one-hand axe/mace/sword/dagger/claw/sceptre/spear/flail, two-hand axe/mace/sword/bow/crossbow/quarterstaff, trap tool, and quiver offhand slot inference.
  - Done: Add PoB-data-backed coverage for talisman and fishing rod as two-handed weapon families.
  - TODO: Add more PoE2-specific weapon/offhand family rules from exact real pasted examples.
- Done: Allow comparing multiple pasted candidate items in one session.
- Done: Add a compare list with ranking by selected priority.
- Done: Keep build-specific models off by default.

Done when the app works well for friends with different classes, skills, and gear setups.

## Phase 6: Custom Models
Goal: make optional build-specific modeling useful without confusing the default workflow.

Status: in progress.

Tasks:
- In progress: Improve the CoC Frostbolt/Frost Wall model with clearer assumptions and validation notes.
  - Done: Keep the model behind an optional Enable profile toggle.
  - Done: Show formula notes and a visible confidence label inside the model panel.
  - Done: Add a copyable CoC validation report with assumptions, current model output, formula notes, and repeatable observation fields.
  - Done: Document the observation workflow in `docs/coc-model-validation.md`.
  - Done: Add a local `npm run inspect:coc-report -- <report.md>` helper that checks copied CoC validation reports for missing observations, parseable assumptions, and modeled-vs-observed numeric differences.
  - Done: Add conservative formula-review verdicts to the CoC report inspector: missing comparison, close match, moderate difference, or model mismatch.
  - Done: Add a copyable GitHub issue snippet to the CoC report inspector so repeatable formula observations can be reported consistently.
  - Done: Add repeat-sample result rows to CoC validation reports and aggregate repeat-sample review in the inspector.
  - TODO: Validate or revise the formula against repeatable gameplay/PoB observations.
- Done: Allow model profiles to be saved per build.
  - Done: Store per-build CoC Frost model profiles in local app settings.
  - Done: Load the saved profile automatically when that build path is active.
  - Done: Normalize older or malformed settings files safely on read.
- Done: Add import/export for model assumptions.
  - Done: Export a copyable JSON profile.
  - Done: Apply pasted profile JSON without saving until the user clicks Save profile.
- Done: Show PoB-native DPS and custom modeled DPS together.
- Done: Add confidence labels for rough, validated, or experimental formulas.

Done when custom modeling helps specific builds while the default item comparison remains generic.

## Phase 7: Packaging For Friends
Goal: make the app easy to run outside the dev environment.

Status: complete for the first lean and portable Windows zips; true installer work is deferred until post-release feedback shows a concrete need.

Tasks:
- Done: Choose packaging path for the next shareable milestone.
  - Done: Use a Windows local web app launcher first: build once, run one Express server on `127.0.0.1`, and serve the React UI plus `/api/*` from the same origin.
  - Done: Revisit Electron/Tauri for 0.1.0 and keep the portable Windows zip as the primary asset; defer a true installer until users need shortcuts, uninstall support, auto-update, a desktop shell, signing polish, or file-association workflows.
- Done: Add one-click local launcher for prod use.
  - Done: `tools/windows/Start-PoB-Item-Delta.cmd` starts the local app, installs dependencies if missing, builds if output is missing, records launcher state, writes local logs, and opens the browser.
  - Done: `tools/windows/Stop-PoB-Item-Delta.cmd` stops the launched server.
  - Done: Launcher command wrappers keep the window open on failure and the start helper gives friendly Node/npm setup instructions.
- Done: Add first-run setup screen for PoB paths and bridge checks.
- Done: Bundle app dependencies where practical for the first shareable zip.
  - Done: The launcher checks for `node_modules` and runs `npm install` when needed.
  - Done: The release script can build a larger dependency-staged zip with `-IncludeNodeModules`.
  - Done: The launcher prefers a packaged `runtime\node\node.exe` when present, and the release script can stage a portable Node runtime from a local folder or official Node zip.
  - Done: The default lean zip does not include `node_modules` or a portable Node runtime; Node.js LTS remains a prerequisite for that artifact.
  - Done: Built and smoked `PoB-Item-Delta-0.1.0-portable-win-x64.zip` using the official Node.js v24.16.0 Windows x64 zip and staged dependencies.
  - Done: Add `npm run release:zip:portable` to download/verify official Node.js and build the portable Windows artifact repeatably.
  - Done: Decision: make the portable Windows zip the primary friend/public asset and keep the lean zip as a smaller secondary asset.
- Done: Produce a release zip or installer.
  - Done: `npm run release:zip` creates `output/releases/PoB-Item-Delta-0.1.0.zip`.
  - Done: Clean extraction smoke verified the zip can install dependencies, start from `tools/windows/Start-PoB-Item-Delta.cmd`, serve `/api/health`, serve built React HTML, and stop with the stop helper.
- Done: Add clear local-only privacy notes.
  - Done: `docs/windows-launcher.md` explains localhost binding, local files read/written, logs, and no cloud uploads.

Done when a friend can install or unzip the app, run it, and compare an item without terminal commands.

## Phase 8: Polish And Release
Goal: make it feel like a real tool.

Status: in progress.

Tasks:
- Done: Add app name, icon, and version number.
  - Done: App title/fav icon are present, and the header now shows the package version from safe diagnostics.
- Done: Add an in-app help page with screenshots.
  - Done: Add a compact Help & Diagnostics panel with copy-item guidance and local-only support details.
  - Done: Add a collapsible visual walkthrough with setup/readiness and delta-report screenshots.
- Done: Add "how to copy item text" guidance.
- Done: Add copyable diagnostics for support.
  - Done: `GET /api/diagnostics` returns safe status/count/version details without full local build paths.
  - Done: The Help & Diagnostics panel can refresh and copy that payload.
  - Done: The Help & Diagnostics panel can copy a local-only build validation report without full local paths or raw pasted item text.
- Done: Add changelog and release notes.
  - Done: `CHANGELOG.md` includes the 0.1.0 release candidate notes.
- Done: Add friend-facing repository documentation.
  - Done: `README.md` covers zip/source setup, usage, privacy, safety, and known limits.
- Done: Add a manual QA checklist for each release.
  - Done: `docs/release-qa.md` covers tests, build, clean zip smoke, app smoke, local-only safety, and release notes.
  - Done: 0.1.0 release QA evidence captured in `docs/ai/release-qa-2026-06-11.md`; destructive real-build save actions were verified through automated tests instead of performed on the user's live build.
- Done: Add a read-only release preflight that checks required files, package contents, manifest values, built support inspector entrypoints, in-app build-scan support, and forbidden local/private file shapes before sharing.
- Done: Add a GitHub Actions CI workflow that runs Windows install, tests, build, lean/portable release packaging, release preflight, readiness dry-run, asset summary, release-notes preview, and publish-packet dry-run after push or pull request.
- In progress: Publish a GitHub release.
  - Done: `docs/github-release.md` captures the local preflight, asset checklist, release notes draft, and post-publish smoke steps.
  - Done: Add a read-only GitHub release readiness helper that checks local zip/preflight/git/tag state, remote tag availability, generated-path git visibility, and lists approval-gated external writes.
  - Done: Add a read-only release asset summary helper that prints zip sizes and SHA256 hashes for GitHub release notes.
  - Done: Add a read-only release notes generator that appends the current checksum table to the GitHub release draft.
  - Done: Add release-notes preview verification to the readiness helper so asset names and checksums are checked before approval.
  - Done: Add a temp-only build coverage scanner smoke to the readiness helper so nested-folder scanning and unreadable XML reporting are verified before release approval.
  - Done: Add a read-only publish packet helper that prints the approval-gated commit/push/CI/tag/release handoff commands plus current asset context without executing external writes.
  - TODO: Commit, push, wait for CI, tag, and publish after explicit user approval.

Done when the app is ready to share publicly.

## Recommended Next Milestone
Finish the remaining validation and release-readiness work:
- Validate or revise the CoC Frostbolt/Frost Wall formula against repeatable gameplay or PoB observations.
- Keep collecting real-build validation for players with different active weapon-set behavior and weapon/offhand setups.
- Commit/push, wait for CI, tag, and publish the first GitHub release when the user approves the external write.
