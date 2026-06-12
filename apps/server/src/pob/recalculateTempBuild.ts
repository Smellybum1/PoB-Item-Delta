import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BuildSkillSelection, BuildWeaponSet, DeltaReport, ImportantStat, LuaBridgeStatusResponse, RecalculateTempBuildResponse } from "@pob-item-delta/shared";

import { compareStats } from "./compareStats.js";
import { parseBuildDetailsFromXml } from "./currentBuild.js";
import { calculateStatsPairWithLuaBridge } from "./luaBridge.js";
import { applySkillSelectionToBuildXml } from "./skillSelection.js";
import { applyWeaponSetSelectionToBuildXml, readWeaponSetFromBuildXml } from "./weaponSetSelection.js";

export interface RecalculateTemporaryBuildComparisonOptions {
  sourceBuildPath: string;
  tempBuildPath: string;
  beforeStats: ImportantStat[];
  selectedSkill?: BuildSkillSelection | undefined;
  selectedWeaponSet?: BuildWeaponSet | undefined;
  selectedSkillLabel: string | null;
  luaBridgeStatus: LuaBridgeStatusResponse;
  tempRoot?: string;
}

export class RecalculateTempBuildError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "RecalculateTempBuildError";
  }
}

export async function recalculateTemporaryBuildComparison(
  options: RecalculateTemporaryBuildComparisonOptions
): Promise<RecalculateTempBuildResponse> {
  const sourceBuildPath = path.resolve(options.sourceBuildPath);
  const tempBuildPath = path.resolve(options.tempBuildPath);
  const tempRoot = path.resolve(options.tempRoot ?? path.join(os.tmpdir(), "pob-item-delta"));

  if (samePath(sourceBuildPath, tempBuildPath)) {
    throw new RecalculateTempBuildError("Temporary build path must be different from the original build path.", 400);
  }
  if (!isPathInside(tempBuildPath, tempRoot)) {
    throw new RecalculateTempBuildError("Temporary build path is outside the app temp folder.", 400);
  }

  const [sourceBuildXmlRaw, tempBuildXmlRaw] = await Promise.all([
    readRequiredBuildFile(sourceBuildPath, "Original build file could not be read."),
    readRequiredBuildFile(tempBuildPath, "Temporary build file could not be read.")
  ]);
  const selectedWeaponSet = options.selectedWeaponSet ?? readWeaponSetFromBuildXml(tempBuildXmlRaw) ?? readWeaponSetFromBuildXml(sourceBuildXmlRaw);
  const sourceBuildXml = applyWeaponSetSelectionToBuildXml(applySkillSelectionToBuildXml(sourceBuildXmlRaw, options.selectedSkill), selectedWeaponSet);
  const tempBuildXml = applyWeaponSetSelectionToBuildXml(applySkillSelectionToBuildXml(tempBuildXmlRaw, options.selectedSkill), selectedWeaponSet);
  const sourceDetails = parseBuildDetailsFromXml(sourceBuildXml);
  const tempDetails = parseBuildDetailsFromXml(tempBuildXml);
  const comparison = await buildDeltaComparison({
    sourceBuildXml,
    tempBuildXml,
    beforeStats: sourceDetails.stats.length > 0 ? sourceDetails.stats : options.beforeStats,
    afterStats: tempDetails.stats,
    selectedSkillLabel: tempDetails.selectedSkill?.label ?? sourceDetails.selectedSkill?.label ?? options.selectedSkillLabel,
    luaBridgeStatus: options.luaBridgeStatus
  });

  return {
    sourceBuildPath,
    tempBuildPath,
    comparison,
    warnings: []
  };
}

export async function buildDeltaComparison(options: {
  sourceBuildXml: string;
  tempBuildXml: string;
  beforeStats: ImportantStat[];
  afterStats: ImportantStat[];
  selectedSkillLabel: string | null;
  luaBridgeStatus: LuaBridgeStatusResponse;
}): Promise<DeltaReport> {
  if (!options.luaBridgeStatus.canAttemptStart) {
    return compareStats({
      beforeStats: options.beforeStats,
      afterStats: options.afterStats,
      selectedSkillLabel: options.selectedSkillLabel,
      warnings: bridgeUnavailableWarnings(options.luaBridgeStatus)
    });
  }

  const { before: beforeLua, after: afterLua } = await calculateStatsPairWithLuaBridge({
    beforeBuildXml: options.sourceBuildXml,
    beforeLabel: "original saved build",
    afterBuildXml: options.tempBuildXml,
    afterLabel: "temporary candidate build",
    bridgeStatus: options.luaBridgeStatus
  });

  if (beforeLua.status === "ready" && afterLua.status === "ready" && beforeLua.stats.length > 0 && afterLua.stats.length > 0) {
    return compareStats({
      beforeStats: beforeLua.stats,
      afterStats: afterLua.stats,
      selectedSkillLabel: options.selectedSkillLabel,
      calculationStatus: "pob-lua-recalculated",
      sourceLabel: "PoB Lua bridge",
      valueNote: "PoB-native stat from Lua bridge recalculation.",
      warnings: []
    });
  }

  return compareStats({
    beforeStats: options.beforeStats,
    afterStats: options.afterStats,
    selectedSkillLabel: options.selectedSkillLabel,
    warnings: [
      "PoB-native recalculation was attempted but unavailable, so XML cached stats are shown.",
      ...uniqueWarnings([...beforeLua.warnings, ...afterLua.warnings])
    ]
  });
}

async function readRequiredBuildFile(filePath: string, message: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    throw new RecalculateTempBuildError(message, 404);
  }
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function uniqueWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.filter((warning) => warning.trim()))];
}

function bridgeUnavailableWarnings(bridgeStatus: LuaBridgeStatusResponse): string[] {
  const lead = bridgeStatus.enabled
    ? "PoB-native recalculation cannot start, so XML cached stats are shown."
    : "PoB-native recalculation is off, so XML cached stats are shown.";
  return uniqueWarnings([lead, bridgeStatus.message, ...bridgeStatus.setupHints]);
}
