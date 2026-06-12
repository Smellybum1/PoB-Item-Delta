import { importItemText, normalizeSlotName, type EquipmentSlot, type ParsedItemText } from "./itemText.js";

export type ItemTextReportSource = "parser-report" | "raw-item-text";

export type ItemTextReportInspectionStatus =
  | "ready"
  | "incomplete-item-text"
  | "unknown-item-family"
  | "unknown-selected-slot"
  | "selected-slot-incompatible";

export interface ItemTextReportInspection {
  source: ItemTextReportSource;
  status: ItemTextReportInspectionStatus;
  messages: string[];
  selectedSlotText: string | null;
  selectedSlot: EquipmentSlot | null;
  itemText: string;
  itemTextLineCount: number;
  item: ParsedItemText;
  suggestedFixtureKey: string;
  suggestedFixtureEntry: string;
  suggestedTestCase: string;
  suggestedIssueSnippet: string;
}

export function inspectItemTextReport(input: string): ItemTextReportInspection {
  const report = extractReportFields(input);
  const item = importItemText(report.itemText);
  const selectedSlot = report.selectedSlotText ? normalizeSlotName(report.selectedSlotText) : null;
  const status = getInspectionStatus(item, report.selectedSlotText, selectedSlot);
  const messages = getInspectionMessages(status, item, report.selectedSlotText, selectedSlot);

  return {
    source: report.source,
    status,
    messages,
    selectedSlotText: report.selectedSlotText,
    selectedSlot,
    itemText: report.itemText,
    itemTextLineCount: report.itemText.replace(/\r/g, "").split("\n").filter(Boolean).length,
    item,
    suggestedFixtureKey: suggestFixtureKey(item),
    suggestedFixtureEntry: formatFixtureEntry(suggestFixtureKey(item), report.itemText),
    suggestedTestCase: formatTestCaseHint(suggestFixtureKey(item), item),
    suggestedIssueSnippet: formatIssueSnippet(status, report.selectedSlotText, selectedSlot, item, report.itemText)
  };
}

export function formatItemTextInspection(inspection: ItemTextReportInspection): string {
  const item = inspection.item;
  const lines = [
    "PoB Item Delta item text inspection",
    "",
    `Source: ${inspection.source}`,
    `Status: ${inspection.status}`,
    `Selected slot: ${inspection.selectedSlot ?? inspection.selectedSlotText ?? "-"}`,
    `Parsed item: ${formatMaybe(item.name)} / ${formatMaybe(item.baseType)}`,
    `Rarity: ${formatMaybe(item.rarity)}`,
    `Item class: ${formatMaybe(item.itemClass)}`,
    `Compatible slots: ${formatSlotList(item.compatibleSlots)}`,
    `Clears slots: ${formatSlotList(item.clearsSlots)}`,
    `Pasted item text lines: ${inspection.itemTextLineCount}`,
    "",
    "Messages:",
    ...formatBullets(inspection.messages),
    "",
    "Fixture hint:",
    `- Suggested key: ${inspection.suggestedFixtureKey}`,
    "- Add the exact pasted item text to apps/server/src/__fixtures__/itemTextSamples.ts.",
    "- Add or extend a focused case in apps/server/src/__tests__/tempEquip.test.ts with the parsed slots above.",
    "",
    "Copyable fixture entry:",
    inspection.suggestedFixtureEntry,
    "",
    "Copyable test case hint:",
    inspection.suggestedTestCase,
    "",
    "Copyable GitHub issue snippet:",
    inspection.suggestedIssueSnippet
  ];

  if (item.warnings.length > 0) {
    lines.splice(lines.indexOf("Fixture hint:"), 0, "Parser warnings:", ...formatBullets(item.warnings), "");
  }

  return `${lines.join("\n")}\n`;
}

function extractReportFields(input: string): {
  source: ItemTextReportSource;
  selectedSlotText: string | null;
  itemText: string;
} {
  const normalized = input.replace(/\r/g, "");
  const selectedSlotText = normalized.match(/^Selected slot:\s*(.+)$/m)?.[1]?.trim() || null;
  const pastedTextHeading = normalized.search(/^## Pasted item text\s*$/m);

  if (pastedTextHeading >= 0) {
    const pastedTextSection = normalized.slice(pastedTextHeading);
    const fencedText = pastedTextSection.match(/```(?:text)?\n([\s\S]*?)\n```/);
    if (fencedText?.[1]) {
      return {
        source: "parser-report",
        selectedSlotText,
        itemText: fencedText[1].trimEnd()
      };
    }
  }

  return {
    source: "raw-item-text",
    selectedSlotText,
    itemText: normalized.trimEnd()
  };
}

function getInspectionStatus(
  item: ParsedItemText,
  selectedSlotText: string | null,
  selectedSlot: EquipmentSlot | null
): ItemTextReportInspectionStatus {
  if (!item.name || !item.baseType) {
    return "incomplete-item-text";
  }
  if (item.compatibleSlots.length === 0) {
    return "unknown-item-family";
  }
  if (selectedSlotText && !selectedSlot) {
    return "unknown-selected-slot";
  }
  if (selectedSlot && !item.compatibleSlots.includes(selectedSlot)) {
    return "selected-slot-incompatible";
  }
  return "ready";
}

function getInspectionMessages(
  status: ItemTextReportInspectionStatus,
  item: ParsedItemText,
  selectedSlotText: string | null,
  selectedSlot: EquipmentSlot | null
): string[] {
  switch (status) {
    case "ready":
      return selectedSlot || selectedSlotText
        ? ["The pasted item text parses and the selected slot is compatible."]
        : ["The pasted item text parses. No selected slot was provided, so use the compatible slots as the fixture expectation."];
    case "incomplete-item-text":
      return [
        "The parser could not find both an item name and base type. Keep the exact copied header lines in the fixture before changing parser rules."
      ];
    case "unknown-item-family":
      return [
        "The item header parsed, but no supported slot family was inferred. Add a minimal slot-family rule only after confirming the exact item type."
      ];
    case "unknown-selected-slot":
      return [`Selected slot "${selectedSlotText ?? "-"}" is not one of the app's supported slot names.`];
    case "selected-slot-incompatible":
      return [
        `${item.name ?? "Candidate item"} looks compatible with ${formatSlotList(item.compatibleSlots)}, not ${
          selectedSlot ?? selectedSlotText ?? "-"
        }.`
      ];
  }
}

function suggestFixtureKey(item: ParsedItemText): string {
  const source = item.name ?? item.baseType ?? "real item sample";
  const words = source.toLowerCase().match(/[a-z0-9]+/g) ?? ["real", "item", "sample"];
  return words
    .map((word, index) => (index === 0 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`))
    .join("");
}

function formatFixtureEntry(key: string, itemText: string): string {
  return `  ${key}: ${JSON.stringify(itemText)}`;
}

function formatTestCaseHint(key: string, item: ParsedItemText): string {
  return `  { label: ${JSON.stringify(key)}, text: itemTextSamples.${key}, slots: ${JSON.stringify(item.compatibleSlots)}, clears: ${JSON.stringify(
    item.clearsSlots
  )}, name: ${JSON.stringify(item.name)} }`;
}

function formatIssueSnippet(
  status: ItemTextReportInspectionStatus,
  selectedSlotText: string | null,
  selectedSlot: EquipmentSlot | null,
  item: ParsedItemText,
  itemText: string
): string {
  const expectedSlot = selectedSlot ?? selectedSlotText ?? "TODO";
  return [
    "## What happened?",
    "",
    "- [ ] The app rejected the item text.",
    "- [ ] The app accepted the item but chose the wrong slot family.",
    "- [ ] The app equipped the item but replacement/offhand behavior looked wrong.",
    "- [ ] Other:",
    "",
    "## Parser Report",
    "",
    "```text",
    `Inspector status: ${status}`,
    `Parsed item: ${item.name ?? "-"} / ${item.baseType ?? "-"}`,
    `Compatible slots: ${formatSlotList(item.compatibleSlots)}`,
    `Clears slots: ${formatSlotList(item.clearsSlots)}`,
    "",
    "Pasted item text:",
    itemText,
    "```",
    "",
    "## Expected Slot",
    "",
    "```text",
    expectedSlot,
    "```",
    "",
    "## Notes",
    "",
    "Remove account names, private character names, and full local filesystem paths before posting. Keep item text formatting exact."
  ].join("\n");
}

function formatMaybe(value: string | null): string {
  return value || "-";
}

function formatSlotList(slots: readonly EquipmentSlot[]): string {
  return slots.length > 0 ? slots.join(", ") : "-";
}

function formatBullets(values: readonly string[]): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : ["- None"];
}
