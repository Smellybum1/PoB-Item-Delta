import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getCurrentBuild } from "../pob/currentBuild.js";

const representativeBuildPath = fileURLToPath(new URL("../__fixtures__/representative-build.xml", import.meta.url));

describe("getCurrentBuild", () => {
  it("reports missing settings without throwing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const result = await getCurrentBuild({ settingsPath: path.join(root, "MissingSettings.xml") });

    expect(result.status).toBe("missing-settings");
    expect(result.buildPath).toBeNull();
  });

  it("reads a representative saved build path from PoB settings and summarizes safe build fields", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const settingsPath = path.join(root, "Settings.xml");

    await writeFile(
      settingsPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding2>
  <Mode mode="BUILD">
    <Arg string="${escapeXml(representativeBuildPath)}"/>
    <Arg string="Representative Build"/>
  </Mode>
  <Accounts tokenExpiry="1" lastToken="secret" lastRefreshToken="secret"/>
</PathOfBuilding2>`
    );

    const result = await getCurrentBuild({ settingsPath });

    expect(result.status).toBe("ready");
    expect(result.buildPath).toBe(path.normalize(representativeBuildPath));
    expect(result.buildName).toBe("Representative Build");
    expect(result.character).toEqual({
      className: "Sorceress",
      ascendClassName: "Stormweaver",
      level: 94
    });
    expect(result.selectedSkill?.label).toBe("Frostbolt");
    expect(result.selectedSkill?.activeSkillSet).toBe(2);
    expect(result.selectedSkill?.mainSocketGroup).toBe(3);
    expect(result.skillOptions).toEqual([
      { activeSkillSet: 1, mainSocketGroup: 1, label: "Unused Default Skill", enabled: true },
      { activeSkillSet: 2, mainSocketGroup: 1, label: "Spark", enabled: true },
      { activeSkillSet: 2, mainSocketGroup: 2, label: "Frost Wall", enabled: true },
      { activeSkillSet: 2, mainSocketGroup: 3, label: "Frostbolt", enabled: true },
      { activeSkillSet: 2, mainSocketGroup: 4, label: "Comet", enabled: true }
    ]);
    expect(result.activeWeaponSet).toBe("primary");
    expect(result.stats).toHaveLength(19);
    expect(result.stats).toContainEqual({ key: "CombinedDPS", label: "Combined DPS", value: 79840.5440976 });
    expect(result.stats).toContainEqual({ key: "EnergyShield", label: "Energy shield", value: 5051 });
    expect(result.slots).toHaveLength(12);
    expect(result.slots).toContainEqual({
      slot: "Weapon 1",
      itemId: "10",
      itemName: "Dire Beam",
      baseType: "Gelid Staff",
      rarity: "RARE"
    });
    expect(result.slots).toContainEqual({
      slot: "Weapon 2",
      itemId: "0",
      itemName: null,
      baseType: null,
      rarity: null
    });
    expect(result.slots).toContainEqual({
      slot: "Weapon 1 Swap",
      itemId: "0",
      itemName: null,
      baseType: null,
      rarity: null
    });
    expect(result.slots.map((slot) => slot.slot)).toEqual([
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
    ]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("lastToken");
  });

  it("reports non-build mode without exposing settings contents", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const settingsPath = path.join(root, "Settings.xml");

    await writeFile(
      settingsPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding2>
  <Mode mode="LIST"/>
  <Accounts lastToken="secret"/>
</PathOfBuilding2>`
    );

    const result = await getCurrentBuild({ settingsPath });

    expect(result.status).toBe("not-build-mode");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
