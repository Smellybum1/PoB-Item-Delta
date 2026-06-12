---
date: 2026-06-11
topic: PoB2 Lua calculation bridge entry points
trigger: Roadmap Milestone 7 needed evidence for PoB-native recalculation from temporary candidate builds.
evidence: Local PoB2 install at `D:\Games\Path of Building Community (PoE2)` contains `Path of Building-PoE2.exe`, `Classes/CompareEntry.lua`, `Modules/Build.lua`, `Launch.lua`, `LaunchServer.lua`, bundled `lua/dkjson.lua`, and SimpleGraphic runtime files.
---

# Learning

- `Classes/CompareEntry.lua` is the most relevant calculation wrapper found so far. It loads saved build XML, creates `ConfigTab`, `ItemsTab`, `TreeTab`, `SkillsTab`, and `CalcsTab`, calls `calcsTab:BuildOutput()`, and exposes `GetOutput()` as `calcsTab.mainOutput`.
- `Modules/Build.lua` saves cached `<PlayerStat>` values from `self.calcsTab.mainOutput`, so a PoB-native recalculation bridge should read `mainOutput` after `BuildOutput()` rather than trusting stale saved XML stats.
- `LaunchServer.lua` is only an OAuth redirect listener on localhost ports `49082`-`49084`; it is not a general calculation API.
- `Path of Building-PoE2.exe` can launch a wrapper script directly when the first script line names the host DLL with `#@ SimpleGraphic`; this is the working external headless command path for now.
- The wrapper must run from a PoB-shaped runtime directory so nested module loads and bundled dependencies resolve correctly.

# Guidance

- Keep the Node backend bridge behind the existing integration boundary; fail closed to the XML cached report when the Lua runner is unavailable.
- Do not write into the installed PoB folder without explicit user approval. Prefer the repo-owned wrapper copied into a temporary runtime mirror during a controlled local run.
- When extending native calculation, add protocol actions around `CompareEntry`/`mainOutput` first before reaching deeper into PoB internals.
