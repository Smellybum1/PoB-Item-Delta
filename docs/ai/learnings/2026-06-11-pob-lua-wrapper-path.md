---
date: 2026-06-11
topic: Repo-owned PoB Lua wrapper path
trigger: Milestone 7 needed a bridge runner path without modifying the installed PoB2 folder.
evidence: `apps/server/src/pob/luaBridge.ts` now prepares a temporary PoB-shaped runtime mirror; `tools/pob-lua/HeadlessWrapper.lua` runs through the installed PoB2 launcher.
---

# Learning

- Do not require `HeadlessWrapper.lua` to live inside the PoB install. Keep the canonical wrapper in this repo and copy it into a temporary runtime mirror for bridge runs.
- The PoB launcher can run a first-argument Lua script when the script begins with `#@ SimpleGraphic`; this gives the wrapper access to the bundled SimpleGraphic Lua host and stdout JSON-lines protocol.
- `LoadModule` resolves relative to the script directory, so launching the repo file directly fails for nested PoB modules. Use a temporary mirror containing top-level PoB Lua files and links to `Classes`, `Modules`, `Data`, `TreeData`, `lua`, `Assets`, and `SimpleGraphic`.
- The wrapper must initialize enough PoB runtime state for headless calculation, including render initialization, a minimal `launch` stub, jewel radii, and a passive-tree `LoadImage` no-op.

# Guidance

- Treat the temporary runtime mirror as disposable bridge infrastructure. Create it per bridge process, and remove it when the process stops.
- Keep the installed PoB folder read-only from this tool unless the user explicitly approves otherwise.
- Native recalculation is validated only when `load_build_xml` followed by `get_stats` returns `CompareEntry`/`mainOutput` values; otherwise fall back to cached XML stats with a visible warning.
