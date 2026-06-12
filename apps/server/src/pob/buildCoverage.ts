import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

import type {
  BuildCoverageBuildRow,
  BuildCoverageReportResponse,
  BuildCoverageSkippedFile,
  BuildCoverageSummary,
  BuildWeaponSet
} from "@pob-item-delta/shared";

interface XmlRecord {
  [key: string]: unknown;
}

interface ScanBuildsOptions {
  buildsPath: string;
}

interface SlotSummary {
  itemId: string | null;
  itemName: string | null;
}

const xmlParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: false,
  textNodeName: "#text",
  trimValues: false
});

const weaponSlotNames = ["Weapon 1", "Weapon 2", "Weapon 1 Swap", "Weapon 2 Swap"] as const;

export async function createBuildCoverageReport(options: ScanBuildsOptions): Promise<BuildCoverageReportResponse> {
  const generatedAt = new Date().toISOString();
  const summary = await scanBuildsPath(options.buildsPath, generatedAt);

  return {
    generatedAt,
    summary,
    markdown: formatBuildCoverageMarkdown(summary),
    warnings: [
      "Build coverage reports use relative build filenames only. Review filenames for private character names before sharing.",
      "The scanner is read-only and does not edit, open, or upload builds."
    ]
  };
}

async function scanBuildsPath(buildsPath: string, generatedAt: string): Promise<BuildCoverageSummary> {
  const files = (await listXmlFiles(buildsPath)).sort((left, right) => left.localeCompare(right));
  const builds: BuildCoverageBuildRow[] = [];
  const failedBuilds: BuildCoverageSkippedFile[] = [];

  for (const filePath of files) {
    const relativeFile = toRelativeBuildPath(buildsPath, filePath);
    try {
      builds.push(parseBuildCoverageRow(relativeFile, await readFile(filePath, "utf8")));
    } catch (error) {
      failedBuilds.push({
        file: relativeFile,
        error: error instanceof Error ? error.message : "Unable to parse build XML."
      });
    }
  }

  const weaponSwapValidationCandidates = builds.filter((build) => build.hasSwapGear && build.skillSetCount > 1);

  return {
    generatedAt,
    xmlFileCount: files.length,
    buildCount: builds.length,
    parseFailureCount: failedBuilds.length,
    buildsWithPrimaryGear: builds.filter((build) => build.hasPrimaryGear).length,
    buildsWithSwapGear: builds.filter((build) => build.hasSwapGear).length,
    buildsWithMultipleSkillSets: builds.filter((build) => build.skillSetCount > 1).length,
    buildsWithSwapGearAndMultipleSkillSets: weaponSwapValidationCandidates.length,
    buildsUsingSecondWeaponSet: builds.filter((build) => build.activeWeaponSet === "swap").length,
    buildsWithSwapGearAndSecondWeaponSetActive: builds.filter((build) => build.hasSwapGear && build.activeWeaponSet === "swap").length,
    weaponSwapValidationCandidates,
    builds,
    failedBuilds
  };
}

async function listXmlFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listXmlFiles(entryPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xml")) {
      files.push(entryPath);
    }
  }

  return files;
}

function parseBuildCoverageRow(relativeFile: string, xml: string): BuildCoverageBuildRow {
  const root = getRecord(parseXml(xml).PathOfBuilding2);
  if (!root) {
    throw new Error("Missing PathOfBuilding2 root element.");
  }

  const build = getRecord(root.Build);
  const skills = getRecord(root.Skills);
  const items = getRecord(root.Items);
  if (!build || !skills || !items) {
    throw new Error("Missing one or more required Build, Skills, or Items sections.");
  }

  const activeSkillSet = readNumber(skills.activeSkillSet);
  const mainSocketGroup = readNumber(build.mainSocketGroup);
  const skillSetSummaries = toArray(skills.SkillSet)
    .map(getRecord)
    .flatMap((skillSet) => {
      const id = readNumber(skillSet?.id);
      if (!id) {
        return [];
      }
      return [
        {
          id,
          labels: toArray(skillSet?.Skill).map(getRecord).map(readSkillLabel)
        }
      ];
    });
  const selectedSkillSet = skillSetSummaries.find((skillSet) => skillSet.id === activeSkillSet);
  const selectedSkill = selectedSkillSet && mainSocketGroup ? selectedSkillSet.labels[mainSocketGroup - 1] ?? null : null;

  const itemSet = readActiveItemSet(items);
  const itemsById = readItemsById(items);
  const slots = Object.fromEntries(weaponSlotNames.map((slotName) => [slotName, readSlotSummary(itemSet, itemsById, slotName)])) as Record<
    (typeof weaponSlotNames)[number],
    SlotSummary
  >;

  const hasPrimaryGear = Boolean(slots["Weapon 1"].itemName || slots["Weapon 2"].itemName);
  const hasSwapGear = Boolean(slots["Weapon 1 Swap"].itemName || slots["Weapon 2 Swap"].itemName);

  return {
    file: relativeFile,
    selectedSkill,
    activeSkillSet,
    mainSocketGroup,
    skillSetCount: skillSetSummaries.length,
    enabledSkillCount: skillSetSummaries.flatMap((skillSet) => skillSet.labels).filter(Boolean).length,
    activeWeaponSet: readActiveWeaponSet(items, itemSet),
    hasPrimaryGear,
    hasSwapGear
  };
}

function readActiveItemSet(items: XmlRecord): XmlRecord | undefined {
  const activeItemSetId = readString(items.activeItemSet);
  const itemSets = toArray(items.ItemSet).map(getRecord);
  return itemSets.find((itemSet) => readString(itemSet?.id) === activeItemSetId) ?? itemSets[0];
}

function readItemsById(items: XmlRecord): Map<string, string | null> {
  const itemsById = new Map<string, string | null>();
  for (const item of toArray(items.Item).map(getRecord)) {
    const itemId = readString(item?.id);
    if (itemId) {
      itemsById.set(itemId, readItemName(readString(item?.["#text"])));
    }
  }
  return itemsById;
}

function readSlotSummary(itemSet: XmlRecord | undefined, itemsById: Map<string, string | null>, slotName: string): SlotSummary {
  const slot = toArray(itemSet?.Slot)
    .map(getRecord)
    .find((candidate) => readString(candidate?.name) === slotName);
  const itemId = readString(slot?.itemId);
  const itemName = itemId && itemId !== "0" ? itemsById.get(itemId) ?? null : null;
  return { itemId, itemName };
}

function readItemName(text: string | null): string | null {
  const lines = (text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rarityIndex = lines.findIndex((line) => line.startsWith("Rarity:"));
  if (rarityIndex >= 0) {
    return lines[rarityIndex + 1] ?? null;
  }
  return lines[0] ?? null;
}

function readActiveWeaponSet(items: XmlRecord, activeItemSet: XmlRecord | undefined): BuildWeaponSet {
  const rawValue = readString(activeItemSet?.useSecondWeaponSet) ?? readString(items.useSecondWeaponSet);
  return rawValue === "true" ? "swap" : "primary";
}

function readSkillLabel(skill: XmlRecord | undefined): string | null {
  const label = readString(skill?.label);
  if (label) {
    return label;
  }
  const firstGem = toArray(skill?.Gem)
    .map(getRecord)
    .find((gem) => readString(gem?.nameSpec));
  return readString(firstGem?.nameSpec);
}

function formatBuildCoverageMarkdown(summary: BuildCoverageSummary): string {
  return [
    "# PoB Item Delta Build Coverage Report",
    "",
    `Generated: ${summary.generatedAt}`,
    "",
    "Local-only note: this report omits the full local builds folder path. Review build filenames for private character names before sharing.",
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| XML files found | ${summary.xmlFileCount} |`,
    `| Builds scanned | ${summary.buildCount} |`,
    `| XML files skipped after parse/read errors | ${summary.parseFailureCount} |`,
    `| With primary weapon/offhand gear | ${summary.buildsWithPrimaryGear} |`,
    `| With swap weapon/offhand gear | ${summary.buildsWithSwapGear} |`,
    `| With multiple skill sets | ${summary.buildsWithMultipleSkillSets} |`,
    `| With swap gear and multiple skill sets | ${summary.buildsWithSwapGearAndMultipleSkillSets} |`,
    `| Using weapon set II now | ${summary.buildsUsingSecondWeaponSet} |`,
    `| With swap gear and weapon set II active | ${summary.buildsWithSwapGearAndSecondWeaponSetActive} |`,
    "",
    "## Roadmap Validation Candidates",
    "",
    ...formatCandidateRows(summary.weaponSwapValidationCandidates),
    "",
    "## Skipped XML Files",
    "",
    ...formatSkippedRows(summary.failedBuilds),
    "",
    "## Build Rows",
    "",
    ...formatBuildRows(summary.builds),
    "",
    "## Suggested Follow-Up",
    "",
    "- If a roadmap validation candidate appears, run a normal item comparison on that build, then copy a build validation report from Help & Diagnostics.",
    "- Remove private character names from filenames before posting publicly.",
    ""
  ].join("\n");
}

function formatCandidateRows(rows: readonly BuildCoverageBuildRow[]): string[] {
  if (rows.length === 0) {
    return ["None found with both swap gear and multiple skill sets."];
  }
  return [
    "| Build file | Selected skill | Skill set/group | Skill sets | Weapon set |",
    "| --- | --- | --- | ---: | --- |",
    ...rows.map(
      (row) =>
        `| ${formatMarkdownValue(row.file)} | ${formatMarkdownValue(row.selectedSkill)} | ${formatMarkdownValue(formatSkillGroup(row))} | ${
          row.skillSetCount
        } | ${formatMarkdownValue(formatWeaponSet(row.activeWeaponSet))} |`
    )
  ];
}

function formatSkippedRows(rows: readonly BuildCoverageSkippedFile[]): string[] {
  if (rows.length === 0) {
    return ["None."];
  }
  return [
    "| File | Error |",
    "| --- | --- |",
    ...rows.slice(0, 10).map((row) => `| ${formatMarkdownValue(row.file)} | ${formatMarkdownValue(row.error)} |`),
    ...(rows.length > 10 ? ["", `_${rows.length - 10} additional skipped XML file(s) omitted._`] : [])
  ];
}

function formatBuildRows(rows: readonly BuildCoverageBuildRow[]): string[] {
  if (rows.length === 0) {
    return ["No valid PoB2 builds found."];
  }
  return [
    "| Build file | Selected skill | Skill set/group | Skill sets | Primary gear | Swap gear | Weapon set |",
    "| --- | --- | --- | ---: | --- | --- | --- |",
    ...rows.map(
      (row) =>
        `| ${formatMarkdownValue(row.file)} | ${formatMarkdownValue(row.selectedSkill)} | ${formatMarkdownValue(formatSkillGroup(row))} | ${
          row.skillSetCount
        } | ${formatYesNo(row.hasPrimaryGear)} | ${formatYesNo(row.hasSwapGear)} | ${formatMarkdownValue(formatWeaponSet(row.activeWeaponSet))} |`
    )
  ];
}

function formatSkillGroup(row: BuildCoverageBuildRow): string {
  return `${row.activeSkillSet ?? "-"}/${row.mainSocketGroup ?? "-"}`;
}

function formatWeaponSet(value: BuildWeaponSet): string {
  return value === "swap" ? "weapon set II active" : "weapon set I/default";
}

function formatYesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function formatMarkdownValue(value: string | null): string {
  if (!value) {
    return "-";
  }
  return value.replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
}

function toRelativeBuildPath(root: string, filePath: string): string {
  return path.relative(root, filePath).replaceAll(path.sep, "/") || path.basename(filePath);
}

function parseXml(xml: string): XmlRecord {
  const parsed = xmlParser.parse(xml);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid XML");
  }
  return parsed as XmlRecord;
}

function getRecord(value: unknown): XmlRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as XmlRecord) : undefined;
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
