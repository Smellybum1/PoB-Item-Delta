export type BuildValidationReportInspectionStatus =
  | "ready-for-review"
  | "partial-observations"
  | "needs-observations"
  | "no-temp-comparison"
  | "not-build-report";

export interface BuildValidationObservationField {
  label: string;
  value: string;
  complete: boolean;
}

export interface BuildValidationReportInspection {
  source: "build-validation-report" | "unknown";
  status: BuildValidationReportInspectionStatus;
  generatedAt: string | null;
  appVersion: string | null;
  buildStatus: string | null;
  luaBridgeStatus: string | null;
  luaBridgeCanStart: boolean | null;
  detectedStats: number | null;
  detectedSlots: number | null;
  buildName: string | null;
  buildFile: string | null;
  character: string | null;
  savedActiveWeaponSet: string | null;
  savedSelectedSkill: string | null;
  reportTargetSkill: string | null;
  targetSkillSetGroup: string | null;
  selectedUiSlot: string | null;
  selectedUiWeaponSet: string | null;
  tempComparison: {
    hasComparison: boolean;
    candidateItem: string | null;
    candidateBaseClass: string | null;
    equippedSlot: string | null;
    selectedComparisonWeaponSet: string | null;
    clearedSlots: string | null;
    comparisonSource: string | null;
    comparisonStatus: string | null;
    comparisonSkill: string | null;
    warnings: string | null;
  };
  highSignalDeltaCount: number;
  compareListCount: number | null;
  observationFields: BuildValidationObservationField[];
  missingObservationFields: string[];
  focus: {
    weaponSwap: boolean;
    targetSkill: boolean;
    luaBridge: boolean;
    saveBackup: boolean;
    slotReplacement: boolean;
  };
  messages: string[];
  suggestedIssueSnippet: string;
}

const reportHeading = "# PoB Item Delta build validation report";

const observationLabels = [
  "Expected active skill in PoB",
  "Actual active skill shown/calculated",
  "Expected weapon set",
  "Actual weapon set shown/calculated",
  "Expected equipped slot/item replacement",
  "Actual equipped slot/item replacement",
  "PoB-native recalculation matched the app report",
  "Save/backup behavior looked correct",
  "Anything confusing in the UI",
  "Screenshots or notes"
] as const;

const requiredObservationLabels = observationLabels.filter((label) => label !== "Anything confusing in the UI" && label !== "Screenshots or notes");

export function inspectBuildValidationReport(input: string): BuildValidationReportInspection {
  const normalized = input.replace(/\r/g, "");
  const source = normalized.includes(reportHeading) ? "build-validation-report" : "unknown";
  const tempComparison = parseTempComparison(normalized);
  const observationFields = observationLabels.map((label) => {
    const value = readLineValue(normalized, label) ?? "";
    return {
      label,
      value,
      complete: isCompleteObservation(value)
    };
  });
  const missingObservationFields = observationFields
    .filter((field) => requiredObservationLabels.includes(field.label as (typeof requiredObservationLabels)[number]) && !field.complete)
    .map((field) => field.label);
  const selectedUiSlot = readNullableValue(normalized, "Selected UI slot");
  const selectedUiWeaponSet = readNullableValue(normalized, "Selected UI slot weapon set");
  const savedSelectedSkill = readNullableValue(normalized, "Saved selected skill");
  const reportTargetSkill = readNullableValue(normalized, "Current report target skill");
  const luaBridgeStatus = readNullableValue(normalized, "PoB Lua bridge");
  const inspection: BuildValidationReportInspection = {
    source,
    status: "not-build-report",
    generatedAt: readNullableValue(normalized, "Generated"),
    appVersion: readNullableValue(normalized, "App version"),
    buildStatus: readNullableValue(normalized, "Build status"),
    luaBridgeStatus,
    luaBridgeCanStart: parseBoolean(readLineValue(normalized, "Lua bridge can start")),
    ...parseDetectedCounts(readLineValue(normalized, "Detected stats/slots")),
    buildName: readNullableValue(normalized, "Build name"),
    buildFile: readNullableValue(normalized, "Build file"),
    character: readNullableValue(normalized, "Character"),
    savedActiveWeaponSet: readNullableValue(normalized, "Saved active weapon set"),
    savedSelectedSkill,
    reportTargetSkill,
    targetSkillSetGroup: readNullableValue(normalized, "Target skill set/group"),
    selectedUiSlot,
    selectedUiWeaponSet,
    tempComparison,
    highSignalDeltaCount: countListItemsBetween(normalized, "## High-signal deltas", "## Compare list"),
    compareListCount: parseNumberValue(readLineValue(normalized, "Candidate comparisons kept in session")),
    observationFields,
    missingObservationFields,
    focus: {
      weaponSwap: isSwapText(selectedUiSlot) || isSwapText(selectedUiWeaponSet) || isSwapText(tempComparison.selectedComparisonWeaponSet),
      targetSkill: Boolean(savedSelectedSkill && reportTargetSkill && savedSelectedSkill !== reportTargetSkill),
      luaBridge: Boolean(luaBridgeStatus && luaBridgeStatus !== "disabled") || tempComparison.comparisonStatus === "pob-lua-recalculated",
      saveBackup: hasCompletedObservation(observationFields, "Save/backup behavior looked correct"),
      slotReplacement: Boolean(tempComparison.equippedSlot || tempComparison.clearedSlots)
    },
    messages: [],
    suggestedIssueSnippet: ""
  };

  inspection.status = getInspectionStatus(inspection);
  inspection.messages = buildMessages(inspection);
  inspection.suggestedIssueSnippet = formatIssueSnippet(inspection);
  return inspection;
}

export function formatBuildValidationInspection(inspection: BuildValidationReportInspection): string {
  const lines = [
    "PoB Item Delta build validation inspection",
    "",
    `Source: ${inspection.source}`,
    `Status: ${inspection.status}`,
    `Generated: ${inspection.generatedAt ?? "-"}`,
    `App version: ${inspection.appVersion ?? "-"}`,
    `Build: ${inspection.buildName ?? "-"} / ${inspection.buildFile ?? "-"}`,
    `Build status: ${inspection.buildStatus ?? "-"}`,
    `Character: ${inspection.character ?? "-"}`,
    `Lua bridge: ${inspection.luaBridgeStatus ?? "-"}; can start: ${formatBoolean(inspection.luaBridgeCanStart)}`,
    `Detected stats/slots: ${formatCount(inspection.detectedStats)}/${formatCount(inspection.detectedSlots)}`,
    "",
    "Skill and slot:",
    `- Saved selected skill: ${inspection.savedSelectedSkill ?? "-"}`,
    `- Report target skill: ${inspection.reportTargetSkill ?? "-"}`,
    `- Target skill set/group: ${inspection.targetSkillSetGroup ?? "-"}`,
    `- Selected UI slot: ${inspection.selectedUiSlot ?? "-"}`,
    `- Selected UI weapon set: ${inspection.selectedUiWeaponSet ?? "-"}`,
    "",
    "Latest temp comparison:",
    `- Candidate item: ${inspection.tempComparison.candidateItem ?? "-"}`,
    `- Candidate base/class: ${inspection.tempComparison.candidateBaseClass ?? "-"}`,
    `- Equipped slot: ${inspection.tempComparison.equippedSlot ?? "-"}`,
    `- Selected comparison weapon set: ${inspection.tempComparison.selectedComparisonWeaponSet ?? "-"}`,
    `- Cleared slots: ${inspection.tempComparison.clearedSlots ?? "-"}`,
    `- Comparison source/status: ${inspection.tempComparison.comparisonSource ?? "-"}/${inspection.tempComparison.comparisonStatus ?? "-"}`,
    `- Comparison skill: ${inspection.tempComparison.comparisonSkill ?? "-"}`,
    `- High-signal deltas: ${inspection.highSignalDeltaCount}`,
    `- Session compare-list count: ${formatCount(inspection.compareListCount)}`,
    "",
    "Focus flags:",
    `- Weapon swap: ${formatBoolean(inspection.focus.weaponSwap)}`,
    `- Target skill override: ${formatBoolean(inspection.focus.targetSkill)}`,
    `- PoB-native recalculation: ${formatBoolean(inspection.focus.luaBridge)}`,
    `- Save/backup observation: ${formatBoolean(inspection.focus.saveBackup)}`,
    `- Slot replacement: ${formatBoolean(inspection.focus.slotReplacement)}`,
    "",
    "Observation fields:",
    ...inspection.observationFields.map((field) => `- ${field.complete ? "[x]" : "[ ]"} ${field.label}: ${field.value || "-"}`),
    "",
    "Messages:",
    ...formatBullets(inspection.messages),
    "",
    "Copyable GitHub issue snippet:",
    inspection.suggestedIssueSnippet
  ];

  return `${lines.join("\n")}\n`;
}

function parseTempComparison(text: string): BuildValidationReportInspection["tempComparison"] {
  const candidateItem = readNullableValue(text, "Candidate item");
  const comparisonStatus = readNullableValue(text, "Comparison status");
  return {
    hasComparison: Boolean(candidateItem || comparisonStatus),
    candidateItem,
    candidateBaseClass: readNullableValue(text, "Candidate base/class"),
    equippedSlot: readNullableValue(text, "Equipped slot"),
    selectedComparisonWeaponSet: readNullableValue(text, "Selected comparison weapon set"),
    clearedSlots: readNullableValue(text, "Cleared slots"),
    comparisonSource: readNullableValue(text, "Comparison source"),
    comparisonStatus,
    comparisonSkill: readNullableValue(text, "Comparison skill"),
    warnings: readNullableValue(text, "Warnings")
  };
}

function getInspectionStatus(inspection: BuildValidationReportInspection): BuildValidationReportInspectionStatus {
  if (inspection.source !== "build-validation-report") {
    return "not-build-report";
  }
  if (!inspection.tempComparison.hasComparison) {
    return "no-temp-comparison";
  }
  if (inspection.missingObservationFields.length === 0) {
    return "ready-for-review";
  }
  const completedRequired = requiredObservationLabels.length - inspection.missingObservationFields.length;
  return completedRequired > 0 ? "partial-observations" : "needs-observations";
}

function buildMessages(inspection: BuildValidationReportInspection): string[] {
  const messages: string[] = [];

  switch (inspection.status) {
    case "not-build-report":
      messages.push("Input does not look like a PoB Item Delta build validation report.");
      break;
    case "no-temp-comparison":
      messages.push("The report has no latest temp comparison. Create a temp copy before copying a build validation report.");
      break;
    case "needs-observations":
      messages.push("Fill the observation fields before using this report as real-build validation evidence.");
      break;
    case "partial-observations":
      messages.push(`${inspection.missingObservationFields.length} required observation field(s) still need evidence before this is ready for review.`);
      break;
    case "ready-for-review":
      messages.push("Required observation fields are filled. Review screenshots/notes before closing a roadmap validation gap.");
      break;
  }

  if (inspection.missingObservationFields.length > 0) {
    messages.push(`Missing: ${inspection.missingObservationFields.join(", ")}.`);
  }
  if (inspection.focus.weaponSwap) {
    messages.push("Weapon-swap behavior is in scope for this report. Confirm PoB and the app agree on weapon set I/II.");
  }
  if (inspection.focus.targetSkill) {
    messages.push("Target skill override is in scope for this report. Confirm the recalculated skill matches the intended skill group.");
  }
  if (inspection.tempComparison.comparisonStatus && inspection.tempComparison.comparisonStatus !== "pob-lua-recalculated") {
    messages.push("Comparison was not PoB Lua recalculated; treat DPS evidence as XML-cached unless the report notes an external PoB check.");
  }
  if (inspection.luaBridgeCanStart === false && hasCompletedObservation(inspection.observationFields, "PoB-native recalculation matched the app report")) {
    messages.push("Report says PoB-native recalculation was observed, but diagnostics said the Lua bridge could not start. Re-check the setup.");
  }

  return messages;
}

function countListItemsBetween(text: string, heading: string, nextHeading: string): number {
  const start = text.indexOf(heading);
  if (start < 0) {
    return 0;
  }
  const afterStart = text.slice(start + heading.length);
  const end = afterStart.indexOf(nextHeading);
  const section = end >= 0 ? afterStart.slice(0, end) : afterStart;
  return section.split("\n").filter((line) => line.trim().startsWith("- ")).length;
}

function parseDetectedCounts(value: string | null): { detectedStats: number | null; detectedSlots: number | null } {
  const match = value?.match(/(\d+)\s*\/\s*(\d+)/);
  return {
    detectedStats: match ? Number(match[1]) : null,
    detectedSlots: match ? Number(match[2]) : null
  };
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

function parseBoolean(value: string | null): boolean | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "no") {
    return false;
  }
  return null;
}

function isCompleteObservation(value: string): boolean {
  const normalized = value.trim();
  return Boolean(normalized) && normalized !== "-" && !/^todo\b/i.test(normalized);
}

function hasCompletedObservation(fields: readonly BuildValidationObservationField[], label: string): boolean {
  return fields.some((field) => field.label === label && field.complete);
}

function isSwapText(value: string | null): boolean {
  return /\b(swap|weapon set ii|weapon set 2)\b/i.test(value ?? "");
}

function formatBoolean(value: boolean | null): string {
  return value === null ? "-" : value ? "yes" : "no";
}

function formatCount(value: number | null): string {
  return value === null ? "-" : `${value}`;
}

function formatBullets(values: readonly string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- None"];
}

function formatIssueSnippet(inspection: BuildValidationReportInspection): string {
  return [
    "## What happened?",
    "",
    "- [ ] Target skill looked wrong.",
    "- [ ] Weapon swap behavior looked wrong.",
    "- [ ] PoB-native recalculation looked wrong.",
    "- [ ] Save/backup behavior looked wrong.",
    "- [ ] Slot replacement or offhand clearing looked wrong.",
    "- [ ] Other:",
    "",
    "## Build Validation Report",
    "",
    "```text",
    `Inspector status: ${inspection.status}`,
    `Build: ${inspection.buildName ?? "-"} / ${inspection.buildFile ?? "-"}`,
    `Saved selected skill: ${inspection.savedSelectedSkill ?? "-"}`,
    `Report target skill: ${inspection.reportTargetSkill ?? "-"}`,
    `Selected UI slot: ${inspection.selectedUiSlot ?? "-"}`,
    `Selected UI weapon set: ${inspection.selectedUiWeaponSet ?? "-"}`,
    `Candidate item: ${inspection.tempComparison.candidateItem ?? "-"}`,
    `Equipped slot: ${inspection.tempComparison.equippedSlot ?? "-"}`,
    `Comparison status: ${inspection.tempComparison.comparisonStatus ?? "-"}`,
    `Missing observations: ${inspection.missingObservationFields.length > 0 ? inspection.missingObservationFields.join(", ") : "-"}`,
    "```",
    "",
    "## Observations",
    "",
    "```text",
    ...inspection.observationFields.map((field) => `${field.label}: ${field.value || "TODO"}`),
    "```",
    "",
    "## Notes",
    "",
    "Remove account names, private character names, and full local filesystem paths before posting. Attach screenshots or short notes when they help prove the observation."
  ].join("\n");
}
