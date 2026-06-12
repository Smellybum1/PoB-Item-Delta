import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { XMLBuilder, XMLParser } from "fast-xml-parser";

import type { BuildSkillSelection, BuildWeaponSet, ItemTextComparison, ItemTextSnapshot } from "@pob-item-delta/shared";

import { importItemText, normalizeSlotName, type EquipmentSlot, type ParsedItemText } from "./itemText.js";
import { applySkillSelectionToBuildXml } from "./skillSelection.js";
import { applyWeaponSetSelectionToBuildXml, readWeaponSetFromBuildXml } from "./weaponSetSelection.js";

interface XmlRecord {
  [key: string]: unknown;
}

export interface EquipCandidateResult {
  tempXml: string;
  candidate: ParsedItemText;
  candidateItemId: string;
  equippedSlot: EquipmentSlot;
  clearedSlots: EquipmentSlot[];
  itemComparison: ItemTextComparison;
  selectedWeaponSet: BuildWeaponSet | null;
  warnings: string[];
}

export interface TemporaryEquippedBuildResult extends Omit<EquipCandidateResult, "tempXml"> {
  sourceBuildPath: string;
  tempBuildPath: string;
}

export class TempEquipError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "TempEquipError";
  }
}

interface CreateTemporaryEquippedBuildOptions {
  sourceBuildPath: string;
  itemText: string;
  selectedSkill?: BuildSkillSelection | undefined;
  selectedWeaponSet?: BuildWeaponSet | undefined;
  slotName: string;
  tempRoot?: string;
}

interface CleanupTemporaryBuildsOptions {
  tempRoot?: string;
  olderThanMs?: number;
  maxFiles?: number;
  now?: number;
}

const defaultTempRoot = path.join(os.tmpdir(), "pob-item-delta");
const tempBuildStaleMs = 24 * 60 * 60 * 1000;
const tempBuildMaxFiles = 50;
const tempBuildFilePattern = /\.candidate-\d+-[a-z0-9]+\.xml$/i;

const xmlParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: false,
  textNodeName: "#text",
  trimValues: false
});

const xmlBuilder = new XMLBuilder({
  attributeNamePrefix: "",
  format: true,
  ignoreAttributes: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: true,
  textNodeName: "#text"
});

export async function createTemporaryEquippedBuild(options: CreateTemporaryEquippedBuildOptions): Promise<TemporaryEquippedBuildResult> {
  const sourceXml = await readFile(options.sourceBuildPath, "utf8");
  const equipResult = equipCandidateInBuildXml(sourceXml, options.itemText, options.slotName);
  const selectedWeaponSet = options.selectedWeaponSet ?? weaponSetForSlot(equipResult.equippedSlot) ?? readWeaponSetFromBuildXml(sourceXml);
  const tempXml = applyWeaponSetSelectionToBuildXml(applySkillSelectionToBuildXml(equipResult.tempXml, options.selectedSkill), selectedWeaponSet);
  const tempRoot = options.tempRoot ?? defaultTempRoot;
  await mkdir(tempRoot, { recursive: true });
  await cleanupTemporaryBuilds({ tempRoot }).catch(() => undefined);

  const parsedPath = path.parse(options.sourceBuildPath);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempBuildPath = path.join(tempRoot, `${parsedPath.name}.candidate-${suffix}${parsedPath.ext || ".xml"}`);
  await writeFile(tempBuildPath, tempXml, "utf8");

  const { tempXml: _tempXml, ...rest } = equipResult;
  return {
    ...rest,
    selectedWeaponSet,
    sourceBuildPath: options.sourceBuildPath,
    tempBuildPath
  };
}

export async function cleanupTemporaryBuilds(options: CleanupTemporaryBuildsOptions = {}): Promise<number> {
  const tempRoot = path.resolve(options.tempRoot ?? defaultTempRoot);
  const olderThanMs = options.olderThanMs ?? tempBuildStaleMs;
  const maxFiles = options.maxFiles ?? tempBuildMaxFiles;
  const now = options.now ?? Date.now();
  await mkdir(tempRoot, { recursive: true });

  const entries = await readdir(tempRoot, { withFileTypes: true });
  const candidates = (
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && tempBuildFilePattern.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(tempRoot, entry.name);
          const fileStat = await stat(filePath);
          return {
            filePath,
            mtimeMs: fileStat.mtimeMs
          };
        })
    )
  ).sort((left, right) => left.mtimeMs - right.mtimeMs);

  const staleCutoff = now - olderThanMs;
  const stale = candidates.filter((candidate) => candidate.mtimeMs < staleCutoff);
  const fresh = candidates.filter((candidate) => candidate.mtimeMs >= staleCutoff);
  const excess = maxFiles >= 0 && fresh.length > maxFiles ? fresh.slice(0, fresh.length - maxFiles) : [];
  const deletePaths = [...new Set([...stale, ...excess].map((candidate) => candidate.filePath))];

  await Promise.all(deletePaths.map((filePath) => rm(filePath, { force: true })));
  return deletePaths.length;
}

export function equipCandidateInBuildXml(buildXml: string, itemText: string, slotName: string): EquipCandidateResult {
  const targetSlot = normalizeSlotName(slotName);
  if (!targetSlot) {
    throw new TempEquipError(`Unsupported equipment slot: ${slotName}`, 400);
  }

  const candidate = importItemText(itemText);
  if (!candidate.name || !candidate.baseType) {
    throw new TempEquipError(
      "Candidate item text must include the item name and base type. Paste the full copied equipment text from trade or PoE, starting with lines like item name then base type.",
      400
    );
  }
  if (candidate.compatibleSlots.length === 0) {
    throw new TempEquipError(
      "Could not work out which equipment slot this item uses. Paste a full weapon, offhand, jewellery, armour, belt, helmet, gloves, or boots item.",
      400
    );
  }
  if (candidate.compatibleSlots.length > 0 && !candidate.compatibleSlots.includes(targetSlot)) {
    throw new TempEquipError(
      `Candidate item looks like ${formatSlotList(candidate.compatibleSlots)} gear, so it cannot be equipped in ${targetSlot}. Choose a compatible slot or paste a different item.`,
      400
    );
  }

  const root = parseXml(buildXml);
  delete root["?xml"];
  const pob = getRecord(root.PathOfBuilding2);
  const items = getRecord(pob?.Items);
  if (!pob || !items) {
    throw new TempEquipError("Build XML does not include an Items section.", 422);
  }

  const itemSet = findActiveItemSet(items);
  const slots = toRecordArray(itemSet.Slot);
  const slot = slots.find((candidateSlot) => readString(candidateSlot.name) === targetSlot);
  if (!slot) {
    throw new TempEquipError(`Active item set does not include ${targetSlot}.`, 422);
  }

  const replacedItemId = readString(slot.itemId) ?? "0";
  const currentItems = toRecordArray(items.Item);
  const itemById = new Map(currentItems.flatMap((item) => {
    const id = readString(item.id);
    return id ? ([[id, item]] satisfies [string, XmlRecord][]) : [];
  }));
  const currentItemText = replacedItemId === "0" ? null : readString(itemById.get(replacedItemId)?.["#text"]);
  const candidateItemId = nextItemId(currentItems);
  currentItems.push({
    id: candidateItemId,
    "#text": `\n${candidate.normalizedText}\n`
  });
  items.Item = currentItems;
  itemSet.Slot = slots;
  slot.itemId = candidateItemId;

  const clearedSlots: EquipmentSlot[] = [];
  const pairedOffhand = pairedOffhandToClear(targetSlot, candidate.clearsSlots);
  if (pairedOffhand) {
    const clearSlot = slots.find((candidateSlot) => readString(candidateSlot.name) === pairedOffhand);
    if (clearSlot && readString(clearSlot.itemId) !== "0") {
      clearSlot.itemId = "0";
      clearedSlots.push(pairedOffhand);
    }
  }

  const tempXml = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build(root)}`;
  return {
    tempXml,
    candidate,
    candidateItemId,
    equippedSlot: targetSlot,
    clearedSlots,
    itemComparison: {
      slot: targetSlot,
      current: summarizeItemText(currentItemText),
      candidate: {
        itemName: candidate.name,
        baseType: candidate.baseType,
        rarity: candidate.rarity,
        text: candidate.normalizedText
      }
    },
    selectedWeaponSet: null,
    warnings: [...candidate.warnings]
  };
}

function findActiveItemSet(items: XmlRecord): XmlRecord {
  const activeItemSet = readString(items.activeItemSet) ?? "1";
  const itemSet = toRecordArray(items.ItemSet).find((candidate) => readString(candidate.id) === activeItemSet);
  if (!itemSet) {
    throw new TempEquipError(`Active item set ${activeItemSet} was not found.`, 422);
  }
  return itemSet;
}

function nextItemId(items: XmlRecord[]): string {
  const maxId = items.reduce((max, item) => {
    const id = Number(readString(item.id));
    return Number.isFinite(id) ? Math.max(max, id) : max;
  }, 0);
  return String(maxId + 1);
}

function parseXml(xml: string): XmlRecord {
  const parsed = xmlParser.parse(xml);
  if (!parsed || typeof parsed !== "object") {
    throw new TempEquipError("Invalid XML", 422);
  }
  return parsed as XmlRecord;
}

function getRecord(value: unknown): XmlRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as XmlRecord) : undefined;
}

function toRecordArray(value: unknown): XmlRecord[] {
  if (value === undefined || value === null) {
    return [];
  }
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    const record = getRecord(item);
    return record ? [record] : [];
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function summarizeItemText(text: string | null): ItemTextSnapshot {
  if (!text) {
    return {
      itemName: null,
      baseType: null,
      rarity: null,
      text: null
    };
  }

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rarityLine = lines.find((line) => line.toLowerCase().startsWith("rarity:"));
  const rarityIndex = rarityLine ? lines.indexOf(rarityLine) : -1;

  return {
    itemName: (rarityIndex >= 0 ? lines[rarityIndex + 1] : lines[0]) ?? null,
    baseType: (rarityIndex >= 0 ? lines[rarityIndex + 2] : lines[1]) ?? null,
    rarity: rarityLine?.replace(/^rarity:/i, "").trim() || null,
    text
  };
}

function formatSlotList(slots: EquipmentSlot[]): string {
  if (slots.length <= 1) {
    return slots[0] ?? "unknown-slot";
  }
  const head = slots.slice(0, -1).join(", ");
  return `${head} or ${slots.at(-1)}`;
}

function pairedOffhandToClear(targetSlot: EquipmentSlot, clearsSlots: EquipmentSlot[]): EquipmentSlot | null {
  if (targetSlot === "Weapon 1" && clearsSlots.includes("Weapon 2")) {
    return "Weapon 2";
  }
  if (targetSlot === "Weapon 1 Swap" && clearsSlots.includes("Weapon 2 Swap")) {
    return "Weapon 2 Swap";
  }
  return null;
}

function weaponSetForSlot(slot: EquipmentSlot): BuildWeaponSet | null {
  if (slot === "Weapon 1" || slot === "Weapon 2") {
    return "primary";
  }
  if (slot === "Weapon 1 Swap" || slot === "Weapon 2 Swap") {
    return "swap";
  }
  return null;
}
