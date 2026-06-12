import { XMLBuilder, XMLParser } from "fast-xml-parser";

import type { BuildSkillSelection } from "@pob-item-delta/shared";

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

export class SkillSelectionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "SkillSelectionError";
  }
}

export function applySkillSelectionToBuildXml(buildXml: string, selectedSkill: BuildSkillSelection | null | undefined): string {
  if (!selectedSkill) {
    return buildXml;
  }

  if (!Number.isInteger(selectedSkill.activeSkillSet) || selectedSkill.activeSkillSet <= 0) {
    throw new SkillSelectionError("Selected skill set must be a positive whole number.", 400);
  }
  if (!Number.isInteger(selectedSkill.mainSocketGroup) || selectedSkill.mainSocketGroup <= 0) {
    throw new SkillSelectionError("Selected skill socket group must be a positive whole number.", 400);
  }

  const root = parseXml(buildXml);
  delete root["?xml"];
  const pob = getRecord(root.PathOfBuilding2);
  const build = getRecord(pob?.Build);
  const skills = getRecord(pob?.Skills) ?? getRecord(build?.Skills);
  if (!build || !skills) {
    throw new SkillSelectionError("Build XML does not include the Build and Skills sections needed to select a skill.", 422);
  }

  const skillSet = toRecordArray(skills.SkillSet).find((candidate) => readNumber(candidate.id) === selectedSkill.activeSkillSet);
  if (!skillSet) {
    throw new SkillSelectionError(`Selected skill set ${selectedSkill.activeSkillSet} was not found in the build.`, 400);
  }

  const skill = toRecordArray(skillSet.Skill)[selectedSkill.mainSocketGroup - 1];
  if (!skill) {
    throw new SkillSelectionError(`Selected skill socket group ${selectedSkill.mainSocketGroup} was not found in skill set ${selectedSkill.activeSkillSet}.`, 400);
  }

  skills.activeSkillSet = String(selectedSkill.activeSkillSet);
  build.mainSocketGroup = String(selectedSkill.mainSocketGroup);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build(root)}`;
}

function parseXml(xml: string): XmlRecord {
  const parsed = xmlParser.parse(xml);
  if (!parsed || typeof parsed !== "object") {
    throw new SkillSelectionError("Invalid build XML.", 422);
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

function readNumber(value: unknown): number | null {
  const text = readString(value);
  if (!text) {
    return null;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
