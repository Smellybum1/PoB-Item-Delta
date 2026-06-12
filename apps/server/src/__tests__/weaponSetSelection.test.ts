import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { applyWeaponSetSelectionToBuildXml, readWeaponSetFromBuildXml } from "../pob/weaponSetSelection.js";

const representativeBuildPath = fileURLToPath(new URL("../__fixtures__/representative-build.xml", import.meta.url));

describe("weapon set selection", () => {
  it("applies the selected weapon set to PoB item XML without needing a file write", async () => {
    const sourceXml = await readFile(representativeBuildPath, "utf8");

    const swapXml = applyWeaponSetSelectionToBuildXml(sourceXml, "swap");

    expect(readWeaponSetFromBuildXml(swapXml)).toBe("swap");
    expect(swapXml).toContain('<Items activeItemSet="2" useSecondWeaponSet="true">');
    expect(swapXml).toContain('<ItemSet title="Default" id="2" useSecondWeaponSet="true">');
    expect(sourceXml).toContain('<Items activeItemSet="2" useSecondWeaponSet="false">');
  });

  it("can force primary weapon set for a build currently set to swap", async () => {
    const sourceXml = applyWeaponSetSelectionToBuildXml(await readFile(representativeBuildPath, "utf8"), "swap");

    const primaryXml = applyWeaponSetSelectionToBuildXml(sourceXml, "primary");

    expect(readWeaponSetFromBuildXml(primaryXml)).toBe("primary");
    expect(primaryXml).toContain('<Items activeItemSet="2" useSecondWeaponSet="false">');
    expect(primaryXml).toContain('<ItemSet title="Default" id="2" useSecondWeaponSet="false">');
  });
});
