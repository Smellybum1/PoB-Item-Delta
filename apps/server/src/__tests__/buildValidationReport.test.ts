import { describe, expect, it } from "vitest";

import { formatBuildValidationInspection, inspectBuildValidationReport } from "../pob/buildValidationReport.js";

describe("build validation report inspection", () => {
  it("marks a filled weapon-swap report as ready for review", () => {
    const inspection = inspectBuildValidationReport(buildReport({ observations: filledObservations() }));

    expect(inspection.source).toBe("build-validation-report");
    expect(inspection.status).toBe("ready-for-review");
    expect(inspection.focus.weaponSwap).toBe(true);
    expect(inspection.focus.targetSkill).toBe(true);
    expect(inspection.focus.luaBridge).toBe(true);
    expect(inspection.focus.slotReplacement).toBe(true);
    expect(inspection.detectedStats).toBe(19);
    expect(inspection.detectedSlots).toBe(9);
    expect(inspection.highSignalDeltaCount).toBe(2);
    expect(inspection.messages).toContain("Weapon-swap behavior is in scope for this report. Confirm PoB and the app agree on weapon set I/II.");
    expect(inspection.suggestedIssueSnippet).toContain("Inspector status: ready-for-review");
    expect(inspection.suggestedIssueSnippet).toContain("Selected UI slot: Weapon 1 Swap");
    expect(inspection.suggestedIssueSnippet).toContain("Expected weapon set: Weapon set II");
    expect(formatBuildValidationInspection(inspection)).toContain("Copyable GitHub issue snippet:");
  });

  it("flags a report copied before creating a temp comparison", () => {
    const inspection = inspectBuildValidationReport(
      buildReport({
        tempComparison: ["No temp comparison has been created in this browser session."],
        observations: blankObservations()
      })
    );

    expect(inspection.status).toBe("no-temp-comparison");
    expect(inspection.tempComparison.hasComparison).toBe(false);
    expect(formatBuildValidationInspection(inspection)).toContain("Create a temp copy before copying a build validation report.");
  });

  it("reports partially filled observation fields", () => {
    const inspection = inspectBuildValidationReport(
      buildReport({
        observations: [
          "Expected active skill in PoB: Frost Wall",
          "Actual active skill shown/calculated: Frost Wall",
          "Expected weapon set: Weapon set II"
        ]
      })
    );

    expect(inspection.status).toBe("partial-observations");
    expect(inspection.missingObservationFields).toContain("Actual weapon set shown/calculated");
    expect(inspection.messages[0]).toContain("required observation field");
  });

  it("rejects unrelated input", () => {
    const inspection = inspectBuildValidationReport("not a build report");

    expect(inspection.status).toBe("not-build-report");
    expect(inspection.messages[0]).toContain("does not look like");
  });
});

function buildReport({
  tempComparison = defaultTempComparison(),
  observations
}: {
  tempComparison?: string[];
  observations: string[];
}): string {
  return [
    "# PoB Item Delta build validation report",
    "",
    "Generated: 2026-06-12T00:00:00.000Z",
    "Local-only note: this report is copied to your clipboard only. It is not uploaded by the app.",
    "Path safety: this report includes build filenames and item names, but not full local paths or raw pasted item text.",
    "",
    "## App diagnostics",
    "",
    "App version: 0.1.0",
    "Build status: ready",
    "PoB Lua bridge: configured",
    "Lua bridge can start: true",
    "Detected stats/slots: 19/9",
    "",
    "## Build context",
    "",
    "Build name: Frostbolt Build",
    "Build file: Frostbolt Build.xml",
    "Character: Chronomancer Sorceress level 92",
    "Last modified: 2026-06-12",
    "Saved active weapon set: Weapon set I",
    "",
    "## Skill selection",
    "",
    "Saved selected skill: Frostbolt",
    "Current report target skill: Frost Wall",
    "Target skill set/group: 1/11",
    "",
    "Available skill options:",
    "- Frostbolt (set 1, group 10, enabled)",
    "- Frost Wall (set 1, group 11, enabled)",
    "",
    "## Current slot selection",
    "",
    "Selected UI slot: Weapon 1 Swap",
    "Selected UI slot weapon set: Weapon set II",
    "",
    "Equipped slots:",
    "- Weapon 1: Dire Beam (Gelid Staff) [RARE]",
    "- Weapon 1 Swap: Empty",
    "",
    "## Latest temp comparison",
    "",
    ...tempComparison,
    "",
    "## High-signal deltas",
    "",
    "- Combined DPS: 79,841 -> 111,046 (+31,205)",
    "- Average hit: 29,987 -> 41,707 (+11,720)",
    "",
    "## Compare list",
    "",
    "Candidate comparisons kept in session: 1",
    "- #1: Corruption Pillar into Weapon 1 Swap; DPS +31,205; source PoB Lua bridge",
    "",
    "## Observation fields",
    "",
    ...observations
  ].join("\n");
}

function defaultTempComparison(): string[] {
  return [
    "Candidate item: Corruption Pillar",
    "Candidate base/class: Pyrophyte Staff / Staff",
    "Equipped slot: Weapon 1 Swap",
    "Selected comparison weapon set: Weapon set II",
    "Cleared slots: Weapon 2 Swap",
    "Comparison source: PoB Lua bridge",
    "Comparison status: pob-lua-recalculated",
    "Comparison skill: Frost Wall",
    "Warnings: Two-handed weapon candidates clear the paired offhand when equipped in Weapon 1 or Weapon 1 Swap."
  ];
}

function filledObservations(): string[] {
  return [
    "Expected active skill in PoB: Frost Wall",
    "Actual active skill shown/calculated: Frost Wall",
    "Expected weapon set: Weapon set II",
    "Actual weapon set shown/calculated: Weapon set II",
    "Expected equipped slot/item replacement: Corruption Pillar in Weapon 1 Swap and Weapon 2 Swap cleared",
    "Actual equipped slot/item replacement: Corruption Pillar in Weapon 1 Swap and Weapon 2 Swap cleared",
    "PoB-native recalculation matched the app report: yes",
    "Save/backup behavior looked correct: not tested",
    "Anything confusing in the UI: no",
    "Screenshots or notes: local screenshot checked"
  ];
}

function blankObservations(): string[] {
  return [
    "Expected active skill in PoB: TODO",
    "Actual active skill shown/calculated: TODO",
    "Expected weapon set: TODO",
    "Actual weapon set shown/calculated: TODO",
    "Expected equipped slot/item replacement: TODO",
    "Actual equipped slot/item replacement: TODO",
    "PoB-native recalculation matched the app report: TODO",
    "Save/backup behavior looked correct: TODO",
    "Anything confusing in the UI: TODO",
    "Screenshots or notes: TODO"
  ];
}
