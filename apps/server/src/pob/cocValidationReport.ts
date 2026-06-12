import {
  calculateCocFrostModel,
  type CocFrostModelAssumptions,
  type CocFrostModelConfidence,
  type CocFrostModelResult,
  type TargetSizeProfile
} from "@pob-item-delta/shared";

export type CocValidationReportInspectionStatus =
  | "ready-for-review"
  | "partial-observations"
  | "needs-observations"
  | "missing-model-profile"
  | "not-coc-report";

export interface CocValidationObservationField {
  label: string;
  value: string;
  complete: boolean;
}

export interface CocValidationReportInspection {
  source: "coc-validation-report" | "unknown";
  status: CocValidationReportInspectionStatus;
  generatedAt: string | null;
  buildName: string | null;
  buildFile: string | null;
  reportTargetSkill: string | null;
  confidence: CocFrostModelConfidence | null;
  assumptions: CocFrostModelAssumptions | null;
  modelOutput: {
    currentPobDps: number | null;
    currentAverageHit: number | null;
    modelStatus: string | null;
    pobNativeDpsUsedByModel: number | null;
    customModeledDps: number | null;
    frostboltEventsPerSecond: number | null;
    critGatedTriggersPerSecond: number | null;
  };
  recalculatedModel: CocFrostModelResult | null;
  formulaReview: CocValidationFormulaReview;
  repeatSampleReviews: CocValidationRepeatSampleReview[];
  completeRepeatSampleCount: number;
  aggregateRepeatSampleReview: CocValidationFormulaReview;
  observations: CocValidationObservationField[];
  missingObservationFields: string[];
  messages: string[];
  suggestedIssueSnippet: string;
}

export interface CocValidationFormulaReview {
  expected: number | null;
  actual: number | null;
  deltaPercent: number | null;
  verdict: "missing-comparison" | "close-match" | "moderate-difference" | "model-mismatch";
  recommendation: string;
}

export interface CocValidationRepeatSampleReview extends CocValidationFormulaReview {
  label: string;
}

const reportHeading = "# PoB Item Delta CoC Frost model validation report";
const validConfidence = new Set<CocFrostModelConfidence>(["rough", "validated", "experimental"]);
const validTargetSizeProfiles = new Set<TargetSizeProfile>(["small", "medium", "large"]);

const observationLabels = [
  "Observation source",
  "Target/boss",
  "Test duration or sample count",
  "Observed Frostbolt casts/sec",
  "Observed Frostbolt crit chance",
  "Observed collisions/cast",
  "Observed explosions hitting boss",
  "Observed triggered spells/sec",
  "Observed DPS, kill time, or health movement",
  "Expected result from model",
  "Actual result observed"
] as const;

const requiredObservationLabels = observationLabels.filter((label) => label !== "Expected result from model");

export function inspectCocValidationReport(input: string): CocValidationReportInspection {
  const normalized = input.replace(/\r/g, "");
  const source = normalized.includes(reportHeading) ? "coc-validation-report" : "unknown";
  const confidence = parseConfidence(readLineValue(normalized, "Confidence"));
  const assumptions = parseAssumptions(normalized);
  const modelOutput = {
    currentPobDps: parseNumberValue(readLineValue(normalized, "Current PoB DPS")),
    currentAverageHit: parseNumberValue(readLineValue(normalized, "Current average hit")),
    modelStatus: readNullableValue(normalized, "Model status"),
    pobNativeDpsUsedByModel: parseNumberValue(readLineValue(normalized, "PoB-native DPS used by model")),
    customModeledDps: parseNumberValue(readLineValue(normalized, "Custom modeled DPS")),
    frostboltEventsPerSecond: parseNumberValue(readLineValue(normalized, "Frostbolt events/sec")),
    critGatedTriggersPerSecond: parseNumberValue(readLineValue(normalized, "Crit-gated triggers/sec"))
  };
  const recalculatedModel =
    assumptions && modelOutput.currentAverageHit !== null
      ? calculateCocFrostModel({
          pobNativeDps: modelOutput.pobNativeDpsUsedByModel ?? modelOutput.currentPobDps,
          selectedSkillAverageHit: modelOutput.currentAverageHit,
          assumptions
        })
      : null;
  const observations = observationLabels.map((label) => {
    const value = readLineValue(normalized, label) ?? "";
    return {
      label,
      value,
      complete: isCompleteObservation(value)
    };
  });
  const missingObservationFields = observations
    .filter((field) => requiredObservationLabels.includes(field.label as (typeof requiredObservationLabels)[number]) && !field.complete)
    .map((field) => field.label);
  const status = getInspectionStatus(source, assumptions, observations, missingObservationFields);
  const formulaReview = reviewFormulaComparison(
    readObservationValue(observations, "Expected result from model"),
    readObservationValue(observations, "Actual result observed")
  );
  const repeatSampleReviews = parseRepeatSampleReviews(normalized);
  const completeRepeatSampleReviews = repeatSampleReviews.filter((review) => review.deltaPercent !== null);
  const aggregateRepeatSampleReview = reviewAggregateRepeatSamples(completeRepeatSampleReviews);

  const inspection: CocValidationReportInspection = {
    source,
    status,
    generatedAt: readNullableValue(normalized, "Generated"),
    buildName: readNullableValue(normalized, "Build name"),
    buildFile: readNullableValue(normalized, "Build file"),
    reportTargetSkill: readNullableValue(normalized, "Report target skill"),
    confidence,
    assumptions,
    modelOutput,
    recalculatedModel,
    formulaReview,
    repeatSampleReviews,
    completeRepeatSampleCount: completeRepeatSampleReviews.length,
    aggregateRepeatSampleReview,
    observations,
    missingObservationFields,
    messages: [],
    suggestedIssueSnippet: ""
  };
  inspection.messages = buildMessages(inspection);
  inspection.suggestedIssueSnippet = formatIssueSnippet(inspection);
  return inspection;
}

export function formatCocValidationInspection(inspection: CocValidationReportInspection): string {
  const lines = [
    "PoB Item Delta CoC validation inspection",
    "",
    `Source: ${inspection.source}`,
    `Status: ${inspection.status}`,
    `Generated: ${inspection.generatedAt ?? "-"}`,
    `Build: ${inspection.buildName ?? "-"} / ${inspection.buildFile ?? "-"}`,
    `Report target skill: ${inspection.reportTargetSkill ?? "-"}`,
    `Confidence: ${inspection.confidence ?? "-"}`,
    "",
    "Model profile:",
    ...formatAssumptionLines(inspection.assumptions),
    "",
    "Model output:",
    `- Current PoB DPS: ${formatNumber(inspection.modelOutput.currentPobDps)}`,
    `- Current average hit: ${formatNumber(inspection.modelOutput.currentAverageHit)}`,
    `- Model status: ${inspection.modelOutput.modelStatus ?? "-"}`,
    `- PoB-native DPS used by model: ${formatNumber(inspection.modelOutput.pobNativeDpsUsedByModel)}`,
    `- Custom modeled DPS: ${formatNumber(inspection.modelOutput.customModeledDps)}`,
    `- Recalculated modeled DPS: ${formatNumber(inspection.recalculatedModel?.modeledDps ?? null)}`,
    "",
    "Formula review:",
    `- Expected result: ${formatNumber(inspection.formulaReview.expected)}`,
    `- Actual result: ${formatNumber(inspection.formulaReview.actual)}`,
    `- Delta: ${formatMaybePercent(inspection.formulaReview.deltaPercent)}`,
    `- Verdict: ${inspection.formulaReview.verdict}`,
    `- Recommendation: ${inspection.formulaReview.recommendation}`,
    "",
    "Repeat sample review:",
    `- Completed samples: ${inspection.completeRepeatSampleCount}`,
    `- Aggregate expected result: ${formatNumber(inspection.aggregateRepeatSampleReview.expected)}`,
    `- Aggregate actual result: ${formatNumber(inspection.aggregateRepeatSampleReview.actual)}`,
    `- Aggregate delta: ${formatMaybePercent(inspection.aggregateRepeatSampleReview.deltaPercent)}`,
    `- Aggregate verdict: ${inspection.aggregateRepeatSampleReview.verdict}`,
    ...inspection.repeatSampleReviews.map(
      (sample) =>
        `- ${sample.label}: expected ${formatNumber(sample.expected)}, actual ${formatNumber(sample.actual)}, delta ${formatMaybePercent(
          sample.deltaPercent
        )}, verdict ${sample.verdict}`
    ),
    "",
    "Observation fields:",
    ...inspection.observations.map((field) => `- ${field.complete ? "[x]" : "[ ]"} ${field.label}: ${field.value || "-"}`),
    "",
    "Messages:",
    ...formatBullets(inspection.messages),
    "",
    "Copyable GitHub issue snippet:",
    inspection.suggestedIssueSnippet
  ];

  return `${lines.join("\n")}\n`;
}

function parseAssumptions(text: string): CocFrostModelAssumptions | null {
  const frostboltCastsPerSecond = parseNumberValue(readLineValue(text, "Frostbolt casts/sec"));
  const frostboltCritChancePercent = parseNumberValue(readLineValue(text, "Frostbolt crit chance"));
  const averageFrostboltCollisionsPerCast = parseNumberValue(readLineValue(text, "Collisions/cast"));
  const averageFrostboltExplosionsHittingBoss = parseNumberValue(readLineValue(text, "Explosions hitting boss"));
  const triggeredSpellTriggersPerSecond = parseNumberValue(readLineValue(text, "Triggered spells/sec"));
  const targetSizeProfile = parseTargetSizeProfile(readLineValue(text, "Target size profile"));

  if (
    frostboltCastsPerSecond === null ||
    frostboltCritChancePercent === null ||
    averageFrostboltCollisionsPerCast === null ||
    averageFrostboltExplosionsHittingBoss === null ||
    triggeredSpellTriggersPerSecond === null ||
    !targetSizeProfile
  ) {
    return null;
  }

  return {
    frostboltCastsPerSecond,
    frostboltCritChancePercent,
    averageFrostboltCollisionsPerCast,
    averageFrostboltExplosionsHittingBoss,
    triggeredSpellTriggersPerSecond,
    targetSizeProfile
  };
}

function getInspectionStatus(
  source: CocValidationReportInspection["source"],
  assumptions: CocFrostModelAssumptions | null,
  observations: CocValidationObservationField[],
  missingObservationFields: string[]
): CocValidationReportInspectionStatus {
  if (source !== "coc-validation-report") {
    return "not-coc-report";
  }
  if (!assumptions) {
    return "missing-model-profile";
  }
  const completedRequired = requiredObservationLabels.length - missingObservationFields.length;
  if (missingObservationFields.length === 0) {
    return "ready-for-review";
  }
  if (completedRequired > 0 || observations.some((field) => field.complete)) {
    return "partial-observations";
  }
  return "needs-observations";
}

function buildMessages(inspection: CocValidationReportInspection): string[] {
  const messages: string[] = [];

  switch (inspection.status) {
    case "not-coc-report":
      messages.push("Input does not look like a PoB Item Delta CoC Frost model validation report.");
      break;
    case "missing-model-profile":
      messages.push("The report heading was found, but one or more model profile assumptions could not be parsed.");
      break;
    case "needs-observations":
      messages.push("Fill the repeatable observation fields before using this report to validate or revise the formula.");
      break;
    case "partial-observations":
      messages.push(
        `${inspection.missingObservationFields.length} required observation field(s) still need evidence before this is ready for formula review.`
      );
      break;
    case "ready-for-review":
      messages.push("Required observation fields are filled. Compare the observed result against the model before changing confidence.");
      break;
  }

  if (inspection.missingObservationFields.length > 0) {
    messages.push(`Missing: ${inspection.missingObservationFields.join(", ")}.`);
  }

  const recalculatedModeledDps = inspection.recalculatedModel?.modeledDps ?? null;
  if (
    recalculatedModeledDps !== null &&
    inspection.modelOutput.customModeledDps !== null &&
    Math.abs(recalculatedModeledDps - inspection.modelOutput.customModeledDps) > 0.01
  ) {
    messages.push("The parsed assumptions do not reproduce the report's custom modeled DPS. Re-copy the report before reviewing evidence.");
  }

  if (inspection.formulaReview.deltaPercent !== null) {
    messages.push(`Observed result is ${formatSignedPercent(inspection.formulaReview.deltaPercent)} versus the expected model result.`);
    messages.push(inspection.formulaReview.recommendation);
  }

  if (inspection.repeatSampleReviews.length > 0) {
    if (inspection.completeRepeatSampleCount === 0) {
      messages.push("Repeat sample rows are present, but no numeric expected/actual sample is complete yet.");
    } else {
      messages.push(
        `${inspection.completeRepeatSampleCount} repeat sample(s) complete; aggregate verdict is ${inspection.aggregateRepeatSampleReview.verdict} with ${formatMaybePercent(
          inspection.aggregateRepeatSampleReview.deltaPercent
        )} delta.`
      );
      if (inspection.completeRepeatSampleCount < 2) {
        messages.push("Collect at least two completed repeat samples before raising model confidence.");
      }
    }
  }

  if (inspection.confidence === "validated" && inspection.status !== "ready-for-review") {
    messages.push("Confidence is marked validated, but the report is not ready for review. Keep confidence rough or experimental until evidence is complete.");
  }
  if (inspection.confidence === "validated" && inspection.completeRepeatSampleCount > 0 && inspection.completeRepeatSampleCount < 2) {
    messages.push("Confidence is marked validated, but fewer than two repeat samples are complete. Keep confidence experimental until repeated evidence agrees.");
  }

  return messages;
}

function readObservationValue(observations: readonly CocValidationObservationField[], label: string): string {
  return observations.find((field) => field.label === label)?.value ?? "";
}

function reviewFormulaComparison(expectedText: string, actualText: string): CocValidationFormulaReview {
  const expected = parseNumberValue(expectedText);
  const actual = parseNumberValue(actualText);
  return reviewFormulaNumbers(expected, actual);
}

function reviewFormulaNumbers(expected: number | null, actual: number | null): CocValidationFormulaReview {
  if (expected === null || actual === null || expected === 0) {
    return {
      expected,
      actual,
      deltaPercent: null,
      verdict: "missing-comparison",
      recommendation: "Fill numeric expected and actual results before using this report to review the formula."
    };
  }

  const deltaPercent = ((actual - expected) / Math.abs(expected)) * 100;
  const absoluteDelta = Math.abs(deltaPercent);
  if (absoluteDelta <= 10) {
    return {
      expected,
      actual,
      deltaPercent,
      verdict: "close-match",
      recommendation: "Observed result is within 10% of the model. Keep collecting repeat samples before marking confidence validated."
    };
  }
  if (absoluteDelta <= 25) {
    return {
      expected,
      actual,
      deltaPercent,
      verdict: "moderate-difference",
      recommendation: "Observed result differs by 10-25%. Recheck assumptions and collect more samples before revising the formula."
    };
  }
  return {
    expected,
    actual,
    deltaPercent,
    verdict: "model-mismatch",
    recommendation: "Observed result differs by more than 25%. Treat the model as rough and revise assumptions or formula notes."
  };
}

function parseRepeatSampleReviews(text: string): CocValidationRepeatSampleReview[] {
  const rows = new Map<string, { expectedText?: string; actualText?: string }>();
  const order: string[] = [];
  const samplePattern = /^Sample\s+(.+?)\s+(expected result from model|actual result observed):\s*(.*)$/gim;
  let match: RegExpExecArray | null;

  while ((match = samplePattern.exec(text)) !== null) {
    const label = `Sample ${match[1]?.trim() ?? ""}`.trim();
    if (!rows.has(label)) {
      rows.set(label, {});
      order.push(label);
    }
    const row = rows.get(label);
    if (!row) {
      continue;
    }
    if (match[2]?.toLowerCase() === "expected result from model") {
      row.expectedText = match[3]?.trim() ?? "";
    } else {
      row.actualText = match[3]?.trim() ?? "";
    }
  }

  return order.map((label) => {
    const row = rows.get(label);
    const review = reviewFormulaComparison(row?.expectedText ?? "", row?.actualText ?? "");
    return { label, ...review };
  });
}

function reviewAggregateRepeatSamples(samples: readonly CocValidationRepeatSampleReview[]): CocValidationFormulaReview {
  const completeSamples = samples.filter((sample) => sample.expected !== null && sample.actual !== null && sample.expected !== 0);
  if (completeSamples.length === 0) {
    return reviewFormulaNumbers(null, null);
  }
  const expected = average(completeSamples.map((sample) => sample.expected ?? 0));
  const actual = average(completeSamples.map((sample) => sample.actual ?? 0));
  return reviewFormulaNumbers(expected, actual);
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function readNullableValue(text: string, label: string): string | null {
  const value = readLineValue(text, label)?.trim();
  return value && value !== "-" ? value : null;
}

function readLineValue(text: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^${escapedLabel}:\\s*(.*)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function parseConfidence(value: string | null): CocFrostModelConfidence | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && validConfidence.has(normalized as CocFrostModelConfidence) ? (normalized as CocFrostModelConfidence) : null;
}

function parseTargetSizeProfile(value: string | null): TargetSizeProfile | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && validTargetSizeProfiles.has(normalized as TargetSizeProfile) ? (normalized as TargetSizeProfile) : null;
}

function parseNumberValue(value: string | null): number | null {
  if (!value || value.trim() === "-" || /^todo\b/i.test(value.trim())) {
    return null;
  }
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCompleteObservation(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && normalized !== "-" && !/^todo\b/i.test(normalized);
}

function formatAssumptionLines(assumptions: CocFrostModelAssumptions | null): string[] {
  if (!assumptions) {
    return ["- Missing or unparseable model assumptions."];
  }
  return [
    `- Frostbolt casts/sec: ${assumptions.frostboltCastsPerSecond}`,
    `- Frostbolt crit chance: ${assumptions.frostboltCritChancePercent}%`,
    `- Collisions/cast: ${assumptions.averageFrostboltCollisionsPerCast}`,
    `- Explosions hitting boss: ${assumptions.averageFrostboltExplosionsHittingBoss}`,
    `- Triggered spells/sec: ${assumptions.triggeredSpellTriggersPerSecond}`,
    `- Target size profile: ${assumptions.targetSizeProfile}`
  ];
}

function formatNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "-" : `${Math.round(value * 100) / 100}`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function formatMaybePercent(value: number | null): string {
  return value === null ? "-" : formatSignedPercent(value);
}

function formatBullets(values: readonly string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- None"];
}

function formatIssueSnippet(inspection: CocValidationReportInspection): string {
  return [
    "## What happened?",
    "",
    "- [ ] CoC model assumptions need review.",
    "- [ ] Observed result does not match modeled result.",
    "- [ ] Confidence label looks too high or too low.",
    "- [ ] Other:",
    "",
    "## CoC Model Validation Report",
    "",
    "```text",
    `Inspector status: ${inspection.status}`,
    `Formula verdict: ${inspection.formulaReview.verdict}`,
    `Formula delta: ${formatMaybePercent(inspection.formulaReview.deltaPercent)}`,
    `Repeat samples complete: ${inspection.completeRepeatSampleCount}`,
    `Repeat sample aggregate verdict: ${inspection.aggregateRepeatSampleReview.verdict}`,
    `Repeat sample aggregate delta: ${formatMaybePercent(inspection.aggregateRepeatSampleReview.deltaPercent)}`,
    `Build: ${inspection.buildName ?? "-"} / ${inspection.buildFile ?? "-"}`,
    `Report target skill: ${inspection.reportTargetSkill ?? "-"}`,
    `Confidence: ${inspection.confidence ?? "-"}`,
    `Custom modeled DPS: ${formatNumber(inspection.modelOutput.customModeledDps)}`,
    `Recalculated modeled DPS: ${formatNumber(inspection.recalculatedModel?.modeledDps ?? null)}`,
    `Missing observations: ${inspection.missingObservationFields.length > 0 ? inspection.missingObservationFields.join(", ") : "-"}`,
    "```",
    "",
    "## Assumptions",
    "",
    "```text",
    ...formatAssumptionLines(inspection.assumptions).map((line) => line.replace(/^- /, "")),
    "```",
    "",
    "## Observations",
    "",
    "```text",
    ...inspection.observations.map((field) => `${field.label}: ${field.value || "TODO"}`),
    "```",
    "",
    "## Repeat Samples",
    "",
    "```text",
    ...(inspection.repeatSampleReviews.length > 0
      ? inspection.repeatSampleReviews.map(
          (sample) =>
            `${sample.label}: expected ${formatNumber(sample.expected)}, actual ${formatNumber(sample.actual)}, delta ${formatMaybePercent(
              sample.deltaPercent
            )}, verdict ${sample.verdict}`
        )
      : ["No repeat sample rows found."]),
    "```",
    "",
    "## Notes",
    "",
    "Remove account names, private character names, and full local filesystem paths before posting. Keep test conditions repeatable: same build, boss, buffs, and PoB config."
  ].join("\n");
}
