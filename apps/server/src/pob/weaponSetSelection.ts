import { XMLBuilder, XMLParser } from "fast-xml-parser";

import type { BuildWeaponSet } from "@pob-item-delta/shared";

interface XmlRecord {
  [key: string]: unknown;
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

const xmlBuilder = new XMLBuilder({
  attributeNamePrefix: "",
  format: true,
  ignoreAttributes: false,
  suppressBooleanAttributes: false,
  suppressEmptyNode: true,
  textNodeName: "#text"
});

export class WeaponSetSelectionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "WeaponSetSelectionError";
  }
}

export function applyWeaponSetSelectionToBuildXml(buildXml: string, selectedWeaponSet: BuildWeaponSet | null | undefined): string {
  if (!selectedWeaponSet) {
    return buildXml;
  }

  const root = parseXml(buildXml);
  delete root["?xml"];
  const items = findItems(root);
  if (!items) {
    throw new WeaponSetSelectionError("Build XML does not include the Items section needed to select a weapon set.", 422);
  }

  const useSecondWeaponSet = selectedWeaponSet === "swap" ? "true" : "false";
  items.useSecondWeaponSet = useSecondWeaponSet;

  const activeItemSet = readString(items.activeItemSet) ?? "1";
  const itemSet = toRecordArray(items.ItemSet).find((candidate) => readString(candidate.id) === activeItemSet);
  if (itemSet) {
    itemSet.useSecondWeaponSet = useSecondWeaponSet;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build(root)}`;
}

export function readWeaponSetFromBuildXml(buildXml: string): BuildWeaponSet | null {
  const root = parseXml(buildXml);
  const items = findItems(root);
  if (!items) {
    return null;
  }

  const activeItemSet = readString(items.activeItemSet) ?? "1";
  const itemSet = toRecordArray(items.ItemSet).find((candidate) => readString(candidate.id) === activeItemSet);
  const rawValue = readString(itemSet?.useSecondWeaponSet) ?? readString(items.useSecondWeaponSet);
  return rawValue === "true" ? "swap" : "primary";
}

function parseXml(xml: string): XmlRecord {
  const parsed = xmlParser.parse(xml);
  if (!parsed || typeof parsed !== "object") {
    throw new WeaponSetSelectionError("Invalid build XML.", 422);
  }
  return parsed as XmlRecord;
}

function findItems(root: XmlRecord): XmlRecord | undefined {
  const pob = getRecord(root.PathOfBuilding2);
  const build = getRecord(pob?.Build);
  return getRecord(pob?.Items) ?? getRecord(build?.Items);
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
