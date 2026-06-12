import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { LuaBridgeStatusResponse } from "@pob-item-delta/shared";

import { parseBuildDetailsFromXml } from "../pob/currentBuild.js";
import { RecalculateTempBuildError, recalculateTemporaryBuildComparison } from "../pob/recalculateTempBuild.js";

const representativeBuildPath = fileURLToPath(new URL("../__fixtures__/representative-build.xml", import.meta.url));

describe("recalculateTemporaryBuildComparison", () => {
  it("rebuilds the delta report for an existing temp build without mutating files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-recalc-"));
    const tempRoot = path.join(root, "temp");
    const sourceBuildPath = path.join(root, "Original Build.xml");
    const tempBuildPath = path.join(tempRoot, "Original Build.candidate.xml");
    const sourceXml = await readFile(representativeBuildPath, "utf8");
    const tempXml = sourceXml.replace("Frostbolt", "Frostbolt");
    await mkdir(tempRoot, { recursive: true });
    await writeFile(sourceBuildPath, sourceXml, "utf8");
    await writeFile(tempBuildPath, tempXml, "utf8");

    const sourceDetails = parseBuildDetailsFromXml(sourceXml);
    const result = await recalculateTemporaryBuildComparison({
      sourceBuildPath,
      tempBuildPath,
      beforeStats: sourceDetails.stats,
      selectedSkillLabel: sourceDetails.selectedSkill?.label ?? null,
      luaBridgeStatus: disabledBridgeStatus(),
      tempRoot
    });

    expect(result.sourceBuildPath).toBe(path.resolve(sourceBuildPath));
    expect(result.tempBuildPath).toBe(path.resolve(tempBuildPath));
    expect(result.comparison.calculationStatus).toBe("cached-xml-not-recalculated");
    expect(result.comparison.selectedSkillLabel).toBe("Frostbolt");
    expect(result.comparison.warnings).toContain("PoB-native recalculation is off, so XML cached stats are shown.");
    expect(result.comparison.warnings).toContain("PoB-native calculation bridge is disabled; the app is using XML cached stats.");
    expect(result.comparison.rows).toContainEqual(
      expect.objectContaining({
        key: "CombinedDPS",
        before: 79840.5440976,
        after: 79840.5440976,
        delta: 0,
        status: "available"
      })
    );
    expect(await readFile(sourceBuildPath, "utf8")).toBe(sourceXml);
    expect(await readFile(tempBuildPath, "utf8")).toBe(tempXml);
  });

  it("refuses to read temp builds outside the app temp folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-recalc-"));
    const tempRoot = path.join(root, "temp");
    const outsideRoot = path.join(root, "outside");
    const sourceBuildPath = path.join(root, "Original Build.xml");
    const tempBuildPath = path.join(outsideRoot, "Original Build.candidate.xml");
    const sourceXml = await readFile(representativeBuildPath, "utf8");
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(sourceBuildPath, sourceXml, "utf8");
    await writeFile(tempBuildPath, sourceXml, "utf8");

    const sourceDetails = parseBuildDetailsFromXml(sourceXml);
    await expect(
      recalculateTemporaryBuildComparison({
        sourceBuildPath,
        tempBuildPath,
        beforeStats: sourceDetails.stats,
        selectedSkillLabel: sourceDetails.selectedSkill?.label ?? null,
        luaBridgeStatus: disabledBridgeStatus(),
        tempRoot
      })
    ).rejects.toThrow("outside the app temp folder");
  });

  it("uses a manual target skill selection for the comparison label without mutating files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-recalc-"));
    const tempRoot = path.join(root, "temp");
    const sourceBuildPath = path.join(root, "Original Build.xml");
    const tempBuildPath = path.join(tempRoot, "Original Build.candidate.xml");
    const sourceXml = await readFile(representativeBuildPath, "utf8");
    await mkdir(tempRoot, { recursive: true });
    await writeFile(sourceBuildPath, sourceXml, "utf8");
    await writeFile(tempBuildPath, sourceXml, "utf8");

    const sourceDetails = parseBuildDetailsFromXml(sourceXml);
    const result = await recalculateTemporaryBuildComparison({
      sourceBuildPath,
      tempBuildPath,
      beforeStats: sourceDetails.stats,
      selectedSkill: {
        activeSkillSet: 2,
        mainSocketGroup: 1
      },
      selectedSkillLabel: sourceDetails.selectedSkill?.label ?? null,
      luaBridgeStatus: disabledBridgeStatus(),
      tempRoot
    });

    expect(result.comparison.selectedSkillLabel).toBe("Spark");
    expect(await readFile(sourceBuildPath, "utf8")).toBe(sourceXml);
    expect(await readFile(tempBuildPath, "utf8")).toBe(sourceXml);
  });

  it("refuses when the temp path is the original build path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-recalc-"));
    const sourceBuildPath = path.join(root, "Original Build.xml");
    const sourceXml = await readFile(representativeBuildPath, "utf8");
    await writeFile(sourceBuildPath, sourceXml, "utf8");

    const sourceDetails = parseBuildDetailsFromXml(sourceXml);
    await expect(
      recalculateTemporaryBuildComparison({
        sourceBuildPath,
        tempBuildPath: sourceBuildPath,
        beforeStats: sourceDetails.stats,
        selectedSkillLabel: sourceDetails.selectedSkill?.label ?? null,
        luaBridgeStatus: disabledBridgeStatus(),
        tempRoot: root
      })
    ).rejects.toBeInstanceOf(RecalculateTempBuildError);
  });
});

function disabledBridgeStatus(): LuaBridgeStatusResponse {
  return {
    status: "disabled",
    enabled: false,
    canAttemptStart: false,
    message: "PoB-native calculation bridge is disabled; the app is using XML cached stats.",
    command: "Path of Building-PoE2.exe",
    forkPath: null,
    wrapperPath: null,
    timeoutMs: 30000,
    checks: [],
    setupHints: []
  };
}
