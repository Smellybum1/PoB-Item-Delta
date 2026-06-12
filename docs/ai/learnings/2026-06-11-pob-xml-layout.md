---
tags: [pob2, xml, integration]
scope: PoB2 saved build XML parsing
trigger: Current-build endpoint initially found cached stats but missed selected skill and equipped slots.
evidence: `0.5 Frostbolt CoC Comet.xml` stores `Build`, `Skills`, `Items`, `Config`, and `Calcs` as sibling nodes under `PathOfBuilding2`; `PlayerStat` nodes are inside `Build`.
validation: `/api/current-build` returned selected skill `Frostbolt`, active skill set `1`, and equipped slots after parser update; `npm test` covers both safe settings parsing and summary extraction.
accepted_into: `apps/server/src/pob/currentBuild.ts`, `docs/ai/project.md`
---
# Learning
- Problem: Treating `Skills` and `Items` as children of `Build` misses active skill and item set data in real PoB2 XML.
- Rule for next time: Parse PoB2 saved builds from the `PathOfBuilding2` root and read `Build`, `Skills`, and `Items` as sibling sections.
- Example: `Build.mainSocketGroup="10"` plus `Skills.activeSkillSet="1"` maps to the 10th `Skill` in `SkillSet id="1"`, which was `Frostbolt` in the current fixture.
- Rejected alternatives: Do not infer selected skill from cached stat names or UI labels when the XML has explicit skill set/socket group fields.
