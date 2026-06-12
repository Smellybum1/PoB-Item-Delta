import { describe, expect, it } from "vitest";

import { formatCocValidationInspection, inspectCocValidationReport } from "../pob/cocValidationReport.js";

describe("CoC validation report inspection", () => {
  it("recognizes an app report that still needs repeatable observations", () => {
    const inspection = inspectCocValidationReport(buildReport({ observations: blankObservations() }));

    expect(inspection.source).toBe("coc-validation-report");
    expect(inspection.status).toBe("needs-observations");
    expect(inspection.confidence).toBe("rough");
    expect(inspection.assumptions).toEqual({
      frostboltCastsPerSecond: 2,
      frostboltCritChancePercent: 50,
      averageFrostboltCollisionsPerCast: 1.5,
      averageFrostboltExplosionsHittingBoss: 2,
      triggeredSpellTriggersPerSecond: 4,
      targetSizeProfile: "medium"
    });
    expect(inspection.recalculatedModel?.modeledDps).toBe(9000);
    expect(inspection.missingObservationFields).toContain("Observed triggered spells/sec");
    expect(inspection.formulaReview.verdict).toBe("missing-comparison");
    expect(inspection.completeRepeatSampleCount).toBe(0);
    expect(inspection.aggregateRepeatSampleReview.verdict).toBe("missing-comparison");
    expect(formatCocValidationInspection(inspection)).toContain("Fill the repeatable observation fields");
  });

  it("marks a filled close-match observation report as ready for formula review", () => {
    const inspection = inspectCocValidationReport(
      buildReport({
        observations: [
          "Observation source: gameplay notes and PoB screen",
          "Target/boss: Test boss",
          "Test duration or sample count: 3 x 20 second clips",
          "Observed Frostbolt casts/sec: 2.1",
          "Observed Frostbolt crit chance: 49%",
          "Observed collisions/cast: 1.4",
          "Observed explosions hitting boss: 1.8",
          "Observed triggered spells/sec: 3.8",
          "Observed DPS, kill time, or health movement: 10% boss health in 6 seconds",
          "Expected result from model: 9000",
          "Actual result observed: 8100"
        ]
      })
    );

    expect(inspection.status).toBe("ready-for-review");
    expect(inspection.missingObservationFields).toEqual([]);
    expect(inspection.formulaReview).toEqual({
      expected: 9000,
      actual: 8100,
      deltaPercent: -10,
      verdict: "close-match",
      recommendation: "Observed result is within 10% of the model. Keep collecting repeat samples before marking confidence validated."
    });
    expect(inspection.messages).toContain("Observed result is -10% versus the expected model result.");
    expect(formatCocValidationInspection(inspection)).toContain("Verdict: close-match");
    expect(inspection.suggestedIssueSnippet).toContain("Formula verdict: close-match");
    expect(inspection.suggestedIssueSnippet).toContain("Actual result observed: 8100");
    expect(formatCocValidationInspection(inspection)).toContain("Copyable GitHub issue snippet:");
  });

  it("summarizes completed repeat sample rows for aggregate formula review", () => {
    const inspection = inspectCocValidationReport(
      buildReport({
        observations: [
          "Observation source: gameplay notes and PoB screen",
          "Target/boss: Test boss",
          "Test duration or sample count: 3 repeat samples",
          "Observed Frostbolt casts/sec: 2.1",
          "Observed Frostbolt crit chance: 49%",
          "Observed collisions/cast: 1.4",
          "Observed explosions hitting boss: 1.8",
          "Observed triggered spells/sec: 3.8",
          "Observed DPS, kill time, or health movement: sample notes below",
          "Expected result from model: 9000",
          "Actual result observed: 8300"
        ],
        repeatSamples: [
          "Sample 1 expected result from model: 9000",
          "Sample 1 actual result observed: 8100",
          "Sample 2 expected result from model: 9000",
          "Sample 2 actual result observed: 8500",
          "Sample 3 expected result from model: TODO",
          "Sample 3 actual result observed: TODO"
        ]
      })
    );

    expect(inspection.repeatSampleReviews).toHaveLength(3);
    expect(inspection.completeRepeatSampleCount).toBe(2);
    expect(inspection.aggregateRepeatSampleReview.expected).toBe(9000);
    expect(inspection.aggregateRepeatSampleReview.actual).toBe(8300);
    expect(inspection.aggregateRepeatSampleReview.deltaPercent).toBeCloseTo(-7.7778, 3);
    expect(inspection.aggregateRepeatSampleReview.verdict).toBe("close-match");
    expect(inspection.messages).toContain("2 repeat sample(s) complete; aggregate verdict is close-match with -7.78% delta.");
    expect(formatCocValidationInspection(inspection)).toContain("Completed samples: 2");
    expect(formatCocValidationInspection(inspection)).toContain("Aggregate verdict: close-match");
    expect(inspection.suggestedIssueSnippet).toContain("Repeat samples complete: 2");
    expect(inspection.suggestedIssueSnippet).toContain("Sample 2: expected 9000, actual 8500");
  });

  it("flags a large modeled-vs-observed mismatch for formula revision", () => {
    const inspection = inspectCocValidationReport(
      buildReport({
        observations: [
          "Observation source: gameplay notes and PoB screen",
          "Target/boss: Test boss",
          "Test duration or sample count: 3 x 20 second clips",
          "Observed Frostbolt casts/sec: 2.1",
          "Observed Frostbolt crit chance: 49%",
          "Observed collisions/cast: 1.4",
          "Observed explosions hitting boss: 1.8",
          "Observed triggered spells/sec: 3.8",
          "Observed DPS, kill time, or health movement: 10% boss health in 6 seconds",
          "Expected result from model: 9000",
          "Actual result observed: 6000"
        ]
      })
    );

    expect(inspection.status).toBe("ready-for-review");
    expect(inspection.formulaReview.verdict).toBe("model-mismatch");
    expect(inspection.formulaReview.deltaPercent).toBeCloseTo(-33.3333, 4);
    expect(inspection.messages).toContain("Observed result differs by more than 25%. Treat the model as rough and revise assumptions or formula notes.");
  });

  it("flags a validated confidence label when evidence is incomplete", () => {
    const inspection = inspectCocValidationReport(buildReport({ confidence: "validated", observations: ["Observation source: PoB screen"] }));

    expect(inspection.status).toBe("partial-observations");
    expect(inspection.messages).toContain(
      "Confidence is marked validated, but the report is not ready for review. Keep confidence rough or experimental until evidence is complete."
    );
  });

  it("rejects unrelated input", () => {
    const inspection = inspectCocValidationReport("not a validation report");

    expect(inspection.status).toBe("not-coc-report");
    expect(inspection.messages[0]).toContain("does not look like");
  });
});

function buildReport({
  confidence = "rough",
  observations,
  repeatSamples = []
}: {
  confidence?: "rough" | "validated" | "experimental";
  observations: string[];
  repeatSamples?: string[];
}): string {
  return [
    "# PoB Item Delta CoC Frost model validation report",
    "",
    "Generated: 2026-06-12T00:00:00.000Z",
    "",
    "## Build context",
    "",
    "Build name: Frostbolt Build",
    "Build file: Frostbolt Build.xml",
    "Report target skill: Frostbolt",
    "",
    "## Model profile",
    "",
    `Confidence: ${confidence}`,
    "Frostbolt casts/sec: 2",
    "Frostbolt crit chance: 50%",
    "Collisions/cast: 1.5",
    "Explosions hitting boss: 2",
    "Triggered spells/sec: 4",
    "Target size profile: medium",
    "",
    "## Current model output",
    "",
    "Current PoB DPS: 5,000",
    "Current average hit: 1,000",
    "Model status: ready",
    "PoB-native DPS used by model: 5,000",
    "Custom modeled DPS: 9,000",
    "Frostbolt events/sec: 7",
    "Crit-gated triggers/sec: 2",
    "",
    "## Repeatable observation fields",
    "",
    ...observations,
    "",
    "## Repeat sample results",
    "",
    ...repeatSamples
  ].join("\n");
}

function blankObservations(): string[] {
  return [
    "Observation source: TODO (PoB screen, gameplay test, video, or notes)",
    "Target/boss: TODO",
    "Test duration or sample count: TODO",
    "Observed Frostbolt casts/sec: TODO",
    "Observed Frostbolt crit chance: TODO",
    "Observed collisions/cast: TODO",
    "Observed explosions hitting boss: TODO",
    "Observed triggered spells/sec: TODO",
    "Observed DPS, kill time, or health movement: TODO",
    "Expected result from model: TODO",
    "Actual result observed: TODO"
  ];
}
