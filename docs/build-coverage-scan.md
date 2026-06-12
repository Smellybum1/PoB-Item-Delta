# Build Coverage Scan

Use this read-only helper when a build behaves differently from the app's normal comparison flow, especially around target skills, weapon swap slots, or weapon set II.

The easiest path is in the app: Help & Diagnostics -> Copy build scan copies a path-sanitized Markdown report for the folder that contains the current saved build.

It scans saved PoB2 build XML files and reports:

- selected skill and socket group;
- number of skill sets in the saved build;
- whether primary and swap weapon slots contain gear;
- whether the saved build currently uses weapon set II;
- whether any build is a roadmap validation candidate with both swap gear and multiple skill sets;
- XML files that were skipped because they could not be parsed as PoB2 builds.

It scans nested folders too. It does not edit builds, open PoB, create temp copies, or upload anything.

## Run It

From the project folder:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-BuildCoverage.ps1
```

For copyable support output:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-BuildCoverage.ps1 -Json
```

For a friend/GitHub-ready Markdown summary that omits the full local builds folder path:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-BuildCoverage.ps1 -Markdown
```

The scanner auto-checks common Windows Documents and OneDrive locations, plus `POB2_BUILDS_PATH` when set. If it cannot find your folder, pass the `Builds` path manually:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-BuildCoverage.ps1 -BuildsPath "C:\Users\<you>\Documents\Path of Building (PoE2)\Builds"
```

## What To Share

For GitHub issues or friend support, prefer the in-app Copy build scan action or the `-Markdown` output. It includes summary counts, skipped XML count, roadmap validation candidates, and build rows while omitting the full local builds folder path. Remove private character names, account names, and sensitive build filenames before posting publicly.

## Inspect A Copied Build Report

When a player uses Help & Diagnostics -> Copy build report, save the copied report to a local `.md` file outside the repo, or under an ignored folder such as `fixtures/local/`.

Run:

```powershell
npm run inspect:build-report -- <report.md>
```

The inspector checks whether the report has a latest temp comparison, whether key observation fields are still TODO, whether weapon-swap or target-skill behavior is in scope, and whether the comparison was PoB Lua recalculated. It also prints a copyable GitHub issue snippet for consistent support reports. Use `npm run inspect:build-report -- --json <report.md>` for the full local inspection result.

## Closing The Weapon-Swap Validation Gap

The Phase 5 roadmap TODO needs a real saved build that has both:

- swap weapon/offhand gear, and
- more than one saved skill set.

The scanner prints `With swap gear and multiple skill sets` plus a `Roadmap validation candidates` section. In `-Markdown` mode, that section is already formatted for a support report. If that count is non-zero, use one of those builds for a normal app comparison, then copy a build validation report from Help & Diagnostics and inspect it with `npm run inspect:build-report -- <report.md>`.

Release zips include the built inspector. In a fresh source checkout, run `npm run build` before using the inspector if `apps/server/dist/` does not exist yet.

In the portable Windows zip, if `npm` is not on PATH, run the same command through the bundled runtime:

```powershell
.\runtime\node\npm.cmd run inspect:build-report -- <report.md>
```
