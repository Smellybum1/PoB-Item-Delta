import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { XMLParser } from "fast-xml-parser";

import type { BuildSkillOption, BuildWeaponSet, CurrentBuildResponse, EquippedSlotSummary, ImportantStat } from "@pob-item-delta/shared";

export const DEFAULT_POB_USER_DATA_DIR = "D:\\Documents\\OneDrive\\Documents\\Path of Building (PoE2)";
export const DEFAULT_SETTINGS_PATH = path.join(DEFAULT_POB_USER_DATA_DIR, "Settings.xml");

const xmlParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: false,
  textNodeName: "#text",
  trimValues: false
});

const statLabels = new Map<string, string>([
  ["CombinedDPS", "Combined DPS"],
  ["TotalDPS", "Total DPS"],
  ["AverageHit", "Average hit"],
  ["CritChance", "Crit chance"],
  ["Speed", "Cast/attack rate"],
  ["ManaCost", "Mana cost"],
  ["ManaPerSecondCost", "Mana cost/sec"],
  ["ManaRegenRecovery", "Mana regen"],
  ["EnergyShield", "Energy shield"],
  ["Life", "Life"],
  ["FireResist", "Fire resist"],
  ["ColdResist", "Cold resist"],
  ["LightningResist", "Lightning resist"],
  ["ChaosResist", "Chaos resist"],
  ["Str", "Strength"],
  ["Dex", "Dexterity"],
  ["Int", "Intelligence"],
  ["Spirit", "Spirit"],
  ["SpiritUnreserved", "Unreserved spirit"]
]);

const preferredSlotOrder = [
  "Weapon 1",
  "Weapon 2",
  "Weapon 1 Swap",
  "Weapon 2 Swap",
  "Helmet",
  "Body Armour",
  "Gloves",
  "Boots",
  "Belt",
  "Ring 1",
  "Ring 2",
  "Amulet"
];

interface GetCurrentBuildOptions {
  settingsPath?: string;
}

interface XmlRecord {
  [key: string]: unknown;
}

interface ItemSummary {
  id: string;
  itemName: string | null;
  baseType: string | null;
  rarity: string | null;
}

export type BuildDetails = Pick<CurrentBuildResponse, "character" | "selectedSkill" | "skillOptions" | "activeWeaponSet" | "stats" | "slots" | "warnings">;

export async function getCurrentBuild(options: GetCurrentBuildOptions = {}): Promise<CurrentBuildResponse> {
  const settingsPath = options.settingsPath ?? process.env.POB2_SETTINGS_PATH ?? DEFAULT_SETTINGS_PATH;
  const base = emptyResponse(settingsPath);

  if (!(await canRead(settingsPath))) {
    return {
      ...base,
      status: "missing-settings",
      message: "PoB settings were not found. Set POB2_SETTINGS_PATH or use the default PoB2 user data path."
    };
  }

  let settingsRoot: XmlRecord;
  try {
    settingsRoot = parseXml(await readFile(settingsPath, "utf8"));
  } catch {
    return {
      ...base,
      status: "parse-error",
      message: "PoB settings could not be parsed."
    };
  }

  const modeNode = getRecord(getRecord(settingsRoot.PathOfBuilding2)?.Mode);
  const mode = readString(modeNode?.mode);
  const args = toArray(modeNode?.Arg).map((arg) => readString(getRecord(arg)?.string)).filter(isPresent);
  const buildPath = args[0] ? path.normalize(args[0]) : null;
  const buildName = args[1] ?? null;

  if (mode !== "BUILD") {
    return {
      ...base,
      status: "not-build-mode",
      message: "PoB is not currently in build mode.",
      mode,
      buildPath,
      buildName
    };
  }

  if (!buildPath) {
    return {
      ...base,
      status: "missing-build-path",
      message: "PoB settings did not include a current build path.",
      mode,
      buildName
    };
  }

  if (!(await canRead(buildPath))) {
    return {
      ...base,
      status: "build-file-missing",
      message: "The current saved build file was not found.",
      mode,
      buildPath,
      buildName,
      fileName: path.basename(buildPath)
    };
  }

  try {
    const [buildStats, buildXml] = await Promise.all([stat(buildPath), readFile(buildPath, "utf8")]);
    const details = parseBuildDetailsFromXml(buildXml);

    return {
      ...base,
      status: "ready",
      message: "Current saved PoB build detected.",
      mode,
      buildPath,
      buildName,
      fileName: path.basename(buildPath),
      lastModified: buildStats.mtime.toISOString(),
      sizeBytes: buildStats.size,
      ...details
    };
  } catch {
    return {
      ...base,
      status: "parse-error",
      message: "The current saved build file could not be parsed.",
      mode,
      buildPath,
      buildName,
      fileName: path.basename(buildPath)
    };
  }
}

export function parseBuildDetailsFromXml(buildXml: string): BuildDetails {
  return parseBuildDetails(parseXml(buildXml));
}

function parseBuildDetails(buildRoot: XmlRecord): BuildDetails {
  const pob = getRecord(buildRoot.PathOfBuilding2);
  const build = getRecord(pob?.Build);
  if (!build) {
    return {
      character: null,
      selectedSkill: null,
      skillOptions: [],
      activeWeaponSet: null,
      stats: [],
      slots: [],
      warnings: ["Build XML did not include a Build node."]
    };
  }

  const mainSocketGroup = readNumber(build.mainSocketGroup);
  const skills = getRecord(pob?.Skills) ?? getRecord(build.Skills);
  const items = getRecord(pob?.Items) ?? getRecord(build.Items);
  const activeSkillSet = readNumber(skills?.activeSkillSet);
  const skillOptions = extractSkillOptions(skills);

  return {
    character: {
      className: readString(build.className),
      ascendClassName: readString(build.ascendClassName),
      level: readNumber(build.level)
    },
    selectedSkill: {
      mainSocketGroup,
      activeSkillSet,
      label: findSelectedSkillLabel(skills, activeSkillSet, mainSocketGroup)
    },
    skillOptions,
    activeWeaponSet: readActiveWeaponSet(items),
    stats: extractImportantStats(build),
    slots: extractSlots(items),
    warnings: [
      "XML-first mode reads the current saved build. Save in PoB before comparing if you changed the build."
    ]
  };
}

function extractSkillOptions(skills: XmlRecord | undefined): BuildSkillOption[] {
  if (!skills) {
    return [];
  }

  return toArray(skills.SkillSet)
    .map(getRecord)
    .flatMap((skillSet): BuildSkillOption[] => {
      const activeSkillSet = readNumber(skillSet?.id);
      if (!activeSkillSet) {
        return [];
      }
      return toArray(skillSet?.Skill)
        .map(getRecord)
        .flatMap((skill, index): BuildSkillOption[] => {
          if (!skill) {
            return [];
          }
          const label = readSkillLabel(skill);
          if (!label) {
            return [];
          }
          return [
            {
              activeSkillSet,
              mainSocketGroup: index + 1,
              label,
              enabled: readString(skill.enabled) !== "false"
            }
          ];
        });
    });
}

function readActiveWeaponSet(items: XmlRecord | undefined): BuildWeaponSet | null {
  if (!items) {
    return null;
  }

  const activeItemSet = readString(items.activeItemSet) ?? "1";
  const itemSet = toArray(items.ItemSet)
    .map(getRecord)
    .find((candidate) => readString(candidate?.id) === activeItemSet);
  const rawValue = readString(itemSet?.useSecondWeaponSet) ?? readString(items.useSecondWeaponSet);
  return rawValue === "true" ? "swap" : "primary";
}

function findSelectedSkillLabel(skills: XmlRecord | undefined, activeSkillSet: number | null, mainSocketGroup: number | null): string | null {
  if (!skills || !activeSkillSet || !mainSocketGroup) {
    return null;
  }

  const skillSet = toArray(skills.SkillSet)
    .map(getRecord)
    .find((candidate) => readNumber(candidate?.id) === activeSkillSet);
  const skill = toArray(skillSet?.Skill).map(getRecord)[mainSocketGroup - 1];
  if (!skill) {
    return null;
  }

  return readSkillLabel(skill);
}

function readSkillLabel(skill: XmlRecord): string | null {
  const label = readString(skill.label);
  if (label) {
    return label;
  }

  const firstGem = toArray(skill.Gem).map(getRecord).find((gem) => readString(gem?.nameSpec));
  return readString(firstGem?.nameSpec);
}

function extractImportantStats(build: XmlRecord): ImportantStat[] {
  const valuesByStat = new Map<string, string>();
  for (const statNode of toArray(build.PlayerStat).map(getRecord)) {
    const key = readString(statNode?.stat);
    const value = readString(statNode?.value);
    if (key && value) {
      valuesByStat.set(key, value);
    }
  }

  return [...statLabels.entries()].flatMap(([key, label]) => {
    const value = valuesByStat.get(key);
    if (!value) {
      return [];
    }
    return [{ key, label, value: parseStatValue(value) }];
  });
}

function extractSlots(items: XmlRecord | undefined): EquippedSlotSummary[] {
  const activeItemSet = readString(items?.activeItemSet) ?? "1";
  const itemSummaries = new Map<string, ItemSummary>();

  for (const item of toArray(items?.Item).map(getRecord)) {
    const id = readString(item?.id);
    if (!id) {
      continue;
    }
    itemSummaries.set(id, summarizeItem(id, readString(item?.["#text"])));
  }

  const itemSet = toArray(items?.ItemSet)
    .map(getRecord)
    .find((candidate) => readString(candidate?.id) === activeItemSet);

  const slots = toArray(itemSet?.Slot)
    .map(getRecord)
    .flatMap((slot): EquippedSlotSummary[] => {
      const slotName = readString(slot?.name);
      const itemId = readString(slot?.itemId) ?? "0";
      if (!slotName || !preferredSlotOrder.includes(slotName)) {
        return [];
      }
      const item = itemSummaries.get(itemId);
      return [
        {
          slot: slotName,
          itemId,
          itemName: item?.itemName ?? null,
          baseType: item?.baseType ?? null,
          rarity: item?.rarity ?? null
        }
      ];
    });

  return slots.sort((a, b) => preferredSlotOrder.indexOf(a.slot) - preferredSlotOrder.indexOf(b.slot));
}

function summarizeItem(id: string, text: string | null): ItemSummary {
  const lines = (text ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rarityLine = lines.find((line) => line.startsWith("Rarity:"));
  const rarity = rarityLine?.replace("Rarity:", "").trim() || null;
  const rarityIndex = rarityLine ? lines.indexOf(rarityLine) : -1;
  const name = rarityIndex >= 0 ? lines[rarityIndex + 1] : lines[0];
  const baseType = rarityIndex >= 0 ? lines[rarityIndex + 2] : lines[1];

  return {
    id,
    itemName: name ?? null,
    baseType: baseType ?? null,
    rarity
  };
}

function parseXml(xml: string): XmlRecord {
  const parsed = xmlParser.parse(xml);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid XML");
  }
  return parsed as XmlRecord;
}

function emptyResponse(settingsPath: string): CurrentBuildResponse {
  return {
    status: "missing-settings",
    message: "",
    settingsPath,
    mode: null,
    buildPath: null,
    buildName: null,
    fileName: null,
    lastModified: null,
    sizeBytes: null,
    character: null,
    selectedSkill: null,
    skillOptions: [],
    activeWeaponSet: null,
    stats: [],
    slots: [],
    warnings: []
  };
}

async function canRead(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
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

function parseStatValue(value: string): number | string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
