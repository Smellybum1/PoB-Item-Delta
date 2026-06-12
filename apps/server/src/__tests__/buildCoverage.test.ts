import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createBuildCoverageReport } from "../pob/buildCoverage.js";

const representativeBuildPath = fileURLToPath(new URL("../__fixtures__/representative-build.xml", import.meta.url));

describe("build coverage report", () => {
  it("summarizes saved builds with relative paths and path-sanitized Markdown", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-build-coverage-"));
    const nested = path.join(root, "Nested");
    await mkdir(nested, { recursive: true });
    await copyFile(representativeBuildPath, path.join(nested, "representative-build.xml"));
    await writeFile(path.join(root, "bad.xml"), "not xml", "utf8");

    const report = await createBuildCoverageReport({ buildsPath: root });

    expect(report.summary.xmlFileCount).toBe(2);
    expect(report.summary.buildCount).toBe(1);
    expect(report.summary.parseFailureCount).toBe(1);
    expect(report.summary.builds[0]).toMatchObject({
      file: "Nested/representative-build.xml",
      selectedSkill: "Frostbolt",
      activeSkillSet: 2,
      mainSocketGroup: 3,
      skillSetCount: 2,
      activeWeaponSet: "primary",
      hasPrimaryGear: true,
      hasSwapGear: false
    });
    expect(report.summary.failedBuilds[0]?.file).toBe("bad.xml");
    expect(report.markdown).toContain("# PoB Item Delta Build Coverage Report");
    expect(report.markdown).toContain("Nested/representative-build.xml");
    expect(report.markdown).toContain("bad.xml");
    expect(report.markdown).not.toContain(root);
  });

  it("surfaces weapon-swap validation candidates with multiple skill sets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-build-coverage-candidate-"));
    const representativeXml = await readFile(representativeBuildPath, "utf8");
    const candidateXml = representativeXml
      .replace('useSecondWeaponSet="false"', 'useSecondWeaponSet="true"')
      .replace('<Slot name="Weapon 1 Swap" itemId="0"/>', '<Slot name="Weapon 1 Swap" itemId="10"/>');
    await writeFile(path.join(root, "swap-candidate.xml"), candidateXml, "utf8");

    const report = await createBuildCoverageReport({ buildsPath: root });

    expect(report.summary.xmlFileCount).toBe(1);
    expect(report.summary.buildCount).toBe(1);
    expect(report.summary.buildsWithSwapGear).toBe(1);
    expect(report.summary.buildsWithMultipleSkillSets).toBe(1);
    expect(report.summary.buildsWithSwapGearAndMultipleSkillSets).toBe(1);
    expect(report.summary.buildsUsingSecondWeaponSet).toBe(1);
    expect(report.summary.buildsWithSwapGearAndSecondWeaponSetActive).toBe(1);
    expect(report.summary.weaponSwapValidationCandidates).toEqual([
      expect.objectContaining({
        file: "swap-candidate.xml",
        selectedSkill: "Frostbolt",
        activeSkillSet: 2,
        mainSocketGroup: 3,
        skillSetCount: 2,
        activeWeaponSet: "swap",
        hasSwapGear: true
      })
    ]);
    expect(report.markdown).toContain("## Roadmap Validation Candidates");
    expect(report.markdown).toContain("swap-candidate.xml");
    expect(report.markdown).toContain("weapon set II active");
    expect(report.markdown).not.toContain("None found with both swap gear and multiple skill sets.");
  });
});
