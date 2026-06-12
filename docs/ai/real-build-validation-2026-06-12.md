# Real Build Validation: Weapon Swap Coverage

Date: 2026-06-12

Scope: read-only scan of the local PoB2 build folder to validate Phase 5 build-agnostic and weapon-swap assumptions against real saved builds.

## Command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-BuildCoverage.ps1
```

The scanner auto-discovered `D:\Documents\OneDrive\Documents\Path of Building (PoE2)\Builds`. The explicit fallback command is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/windows/Test-PoB-BuildCoverage.ps1 -BuildsPath 'D:\Documents\OneDrive\Documents\Path of Building (PoE2)\Builds'
```

## Result

- Builds scanned: 8.
- XML files skipped after parse/read errors: 0.
- Builds with primary weapon/offhand gear: 8.
- Builds with swap weapon/offhand gear: 4.
- Builds with multiple skill sets: 0.
- Builds with both swap gear and multiple skill sets: 0.
- Builds using weapon set II in the saved XML: 0.
- Builds with both swap gear and weapon set II active: 0.

Real saved builds with swap gear were present:

- `0.4 Frostbolt Cast on Crit.xml`
- `0.5 Frostbolt CoC Comet.xml`
- `Ice Nova Abyssal Final lvl 97.xml`
- `Ice Nova Abyssal.xml`

## Interpretation

This validates that the app must continue to expose and safely handle swap weapon slots for real local builds, not just fixtures.

No real local build currently proves the harder case where a build has both weapon-swap gear and multiple saved skill sets. The scanner now reports this as `With swap gear and multiple skill sets` plus a `Roadmap validation candidates` section, so a future friend/local build can be identified quickly. The repo fixture still covers multiple skill-set parsing synthetically, and temp-equip tests cover swap-slot XML mutation, but a real multi-skill-set swap build remains needed before closing the roadmap validation TODO.

## Follow-Up

- Follow-up scan on 2026-06-12 after release-readiness hardening found the same coverage shape: 8 builds scanned, 4 with swap gear, 0 with multiple skill sets, 0 with both swap gear and multiple skill sets, and 0 saved with weapon set II active.
- The no-argument scanner now finds the local OneDrive Documents build folder, so friend/local support can start with the simpler command and only use `-BuildsPath` as a fallback.
- A synthetic scanner smoke check found a valid XML in a nested folder and reported an intentionally bad XML file as skipped, which keeps friend support scans useful when old exports or malformed files are mixed into a build folder.
- Keep the Phase 5 TODO open for a real build with multiple skill sets and swap gear.
- Use `tools/windows/Test-PoB-BuildCoverage.ps1 -Markdown` when friends report target skill or weapon swap issues and need a copyable support report. Use `-Json` when machine-readable output is needed.
