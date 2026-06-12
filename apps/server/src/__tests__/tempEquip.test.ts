import { access, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";

import { compareStats } from "../pob/compareStats.js";
import { getCurrentBuild, parseBuildDetailsFromXml } from "../pob/currentBuild.js";
import { importItemText } from "../pob/itemText.js";
import { cleanupTemporaryBuilds, createTemporaryEquippedBuild, equipCandidateInBuildXml } from "../pob/tempEquip.js";
import { itemTextSamples } from "../__fixtures__/itemTextSamples.js";

const representativeBuildPath = fileURLToPath(new URL("../__fixtures__/representative-build.xml", import.meta.url));
const staffItemText = itemTextSamples.twoHandedStaff;

const testXmlParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  preserveOrder: false,
  textNodeName: "#text",
  trimValues: false
});

describe("item text import", () => {
  it("parses trade-style equipment text and infers two-handed weapon behavior", () => {
    const item = importItemText(staffItemText);

    expect(item.itemClass).toBe("Staves");
    expect(item.rarity).toBe("RARE");
    expect(item.name).toBe("Rune Needle");
    expect(item.baseType).toBe("Gelid Staff");
    expect(item.compatibleSlots).toEqual(["Weapon 1", "Weapon 1 Swap"]);
    expect(item.clearsSlots).toEqual(["Weapon 2", "Weapon 2 Swap"]);
    expect(item.normalizedText).not.toContain("Item Class:");
    expect(item.normalizedText).toContain("Rarity: RARE");
  });

  it("accepts trade-site item text without an explicit rarity line", () => {
    const item = importItemText(itemTextSamples.tradeSiteStaffWithoutRarity);

    expect(item.itemClass).toBe("Staff");
    expect(item.rarity).toBe("RARE");
    expect(item.name).toBe("Corruption Pillar");
    expect(item.baseType).toBe("Pyrophyte Staff");
    expect(item.compatibleSlots).toEqual(["Weapon 1", "Weapon 1 Swap"]);
    expect(item.clearsSlots).toEqual(["Weapon 2", "Weapon 2 Swap"]);
    expect(item.warnings).toContain("Trade text did not include rarity; assuming Rare for the temporary PoB item.");
    expect(item.normalizedText.split("\n").slice(0, 3)).toEqual(["Rarity: RARE", "Corruption Pillar", "Pyrophyte Staff"]);
    expect(item.normalizedText).not.toMatch(/^Staff$/m);
  });

  it("infers compatible slots for representative non-staff item text samples", () => {
    const cases = [
      { label: "wand", text: itemTextSamples.wand, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Spark Needle" },
      { label: "sceptre", text: itemTextSamples.sceptre, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Omen Branch" },
      { label: "dagger", text: itemTextSamples.dagger, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Night Needle" },
      { label: "claw", text: itemTextSamples.claw, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Razor Grasp" },
      { label: "one-handed axe", text: itemTextSamples.oneHandAxe, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Rage Cleaver" },
      { label: "one-handed mace", text: itemTextSamples.oneHandMace, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Rune Star" },
      { label: "one-handed sword", text: itemTextSamples.oneHandSword, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Dawn Edge" },
      { label: "spear", text: itemTextSamples.spear, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Hunt Needle" },
      { label: "flail", text: itemTextSamples.flail, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Faith Chain" },
      {
        label: "bow",
        text: itemTextSamples.bow,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Storm String"
      },
      {
        label: "crossbow",
        text: itemTextSamples.crossbow,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Bolt Siege"
      },
      {
        label: "two-handed axe",
        text: itemTextSamples.twoHandAxe,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Gore Spire"
      },
      {
        label: "two-handed sword",
        text: itemTextSamples.twoHandSword,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Titan Edge"
      },
      {
        label: "two-handed mace",
        text: itemTextSamples.twoHandMace,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Stone Roar"
      },
      {
        label: "quarterstaff",
        text: itemTextSamples.quarterstaff,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Moon Bough"
      },
      {
        label: "talisman",
        text: itemTextSamples.talisman,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Ash Charm"
      },
      {
        label: "fishing rod",
        text: itemTextSamples.fishingRod,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Reef Needle"
      },
      {
        label: "trap tool",
        text: itemTextSamples.trapTool,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Snare Bloom"
      },
      { label: "shield", text: itemTextSamples.shield, slots: ["Weapon 2", "Weapon 2 Swap"], clears: [], name: "Stone Shelter" },
      { label: "quiver", text: itemTextSamples.quiver, slots: ["Weapon 2", "Weapon 2 Swap"], clears: [], name: "Hawk Fletching" },
      { label: "ring", text: itemTextSamples.ring, slots: ["Ring 1", "Ring 2"], clears: [], name: "Carrion Loop" },
      { label: "amulet", text: itemTextSamples.amulet, slots: ["Amulet"], clears: [], name: "Doom Pendant" },
      { label: "helmet", text: itemTextSamples.helmet, slots: ["Helmet"], clears: [], name: "Mind Brow" },
      { label: "body armour", text: itemTextSamples.bodyArmour, slots: ["Body Armour"], clears: [], name: "Viper Coat" },
      { label: "gloves", text: itemTextSamples.gloves, slots: ["Gloves"], clears: [], name: "Rune Clutches" },
      { label: "boots", text: itemTextSamples.boots, slots: ["Boots"], clears: [], name: "Storm Pace" },
      { label: "belt", text: itemTextSamples.belt, slots: ["Belt"], clears: [], name: "Ghoul Strap" }
    ] as const;

    for (const sample of cases) {
      const item = importItemText(sample.text);

      expect(item.name, sample.label).toBe(sample.name);
      expect(item.compatibleSlots, sample.label).toEqual(sample.slots);
      expect(item.clearsSlots, sample.label).toEqual(sample.clears);
      expect(item.normalizedText, sample.label).not.toContain("Item Class:");
    }
  });

  it("accepts representative copied trade-site samples for each supported slot family", () => {
    const cases = [
      { label: "weapon", text: itemTextSamples.tradeSiteSamplesBySlot.weapon, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Entropy Weaver" },
      { label: "sceptre", text: itemTextSamples.tradeSiteSamplesBySlot.sceptre, slots: ["Weapon 1", "Weapon 1 Swap"], clears: [], name: "Omen Branch" },
      {
        label: "two-handed weapon",
        text: itemTextSamples.tradeSiteSamplesBySlot.twoHandedWeapon,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Corruption Pillar"
      },
      {
        label: "talisman",
        text: itemTextSamples.tradeSiteSamplesBySlot.talisman,
        slots: ["Weapon 1", "Weapon 1 Swap"],
        clears: ["Weapon 2", "Weapon 2 Swap"],
        name: "Ash Charm"
      },
      { label: "shield", text: itemTextSamples.tradeSiteSamplesBySlot.shield, slots: ["Weapon 2", "Weapon 2 Swap"], clears: [], name: "Stone Shelter" },
      { label: "focus", text: itemTextSamples.tradeSiteSamplesBySlot.focus, slots: ["Weapon 2", "Weapon 2 Swap"], clears: [], name: "Glyph Lantern" },
      { label: "quiver", text: itemTextSamples.tradeSiteSamplesBySlot.quiver, slots: ["Weapon 2", "Weapon 2 Swap"], clears: [], name: "Hawk Fletching" },
      { label: "ring", text: itemTextSamples.tradeSiteSamplesBySlot.ring, slots: ["Ring 1", "Ring 2"], clears: [], name: "Carrion Loop" },
      { label: "amulet", text: itemTextSamples.tradeSiteSamplesBySlot.amulet, slots: ["Amulet"], clears: [], name: "Doom Pendant" },
      { label: "belt", text: itemTextSamples.tradeSiteSamplesBySlot.belt, slots: ["Belt"], clears: [], name: "Ghoul Strap" },
      { label: "helmet", text: itemTextSamples.tradeSiteSamplesBySlot.helmet, slots: ["Helmet"], clears: [], name: "Mind Brow" },
      { label: "body armour", text: itemTextSamples.tradeSiteSamplesBySlot.bodyArmour, slots: ["Body Armour"], clears: [], name: "Viper Coat" },
      { label: "gloves", text: itemTextSamples.tradeSiteSamplesBySlot.gloves, slots: ["Gloves"], clears: [], name: "Rune Clutches" },
      { label: "boots", text: itemTextSamples.tradeSiteSamplesBySlot.boots, slots: ["Boots"], clears: [], name: "Storm Pace" }
    ] as const;

    for (const sample of cases) {
      const item = importItemText(sample.text);

      expect(item.name, sample.label).toBe(sample.name);
      expect(item.rarity, sample.label).toBe("RARE");
      expect(item.compatibleSlots, sample.label).toEqual(sample.slots);
      expect(item.clearsSlots, sample.label).toEqual(sample.clears);
      expect(item.normalizedText, sample.label).toContain("Rarity: RARE");
      expect(item.normalizedText, sample.label).not.toMatch(/^(Wand|Sceptre|Staff|Talisman|Shield|Focus|Quiver|Ring|Amulet|Belt|Helmet|Body Armour|Gloves|Boots)$/m);
    }
  });

  it("does not treat metadata as an item base type when copied text is incomplete", () => {
    const item = importItemText(`Corruption Pillar
Quality: +20%
Item Level: 82`);

    expect(item.name).toBe("Corruption Pillar");
    expect(item.baseType).toBeNull();
    expect(item.rarity).toBeNull();
    expect(item.compatibleSlots).toEqual([]);
  });
});

describe("createTemporaryEquippedBuild", () => {
  it("matches the known XML before/after import contract for a staff replacement", async () => {
    const beforeXml = await readFile(representativeBuildPath, "utf8");
    const beforeItems = getBuildItems(beforeXml);
    const beforeSlots = getActiveSlotMap(beforeXml);

    expect(beforeItems.map((item) => item.id).sort()).toEqual(["10", "11", "12", "15"]);
    expect(beforeSlots.get("Weapon 1")).toBe("10");
    expect(beforeSlots.get("Weapon 2")).toBe("0");

    const result = equipCandidateInBuildXml(beforeXml, staffItemText, "Weapon 1");
    const afterItems = getBuildItems(result.tempXml);
    const afterSlots = getActiveSlotMap(result.tempXml);
    const candidateItem = afterItems.find((item) => item.id === result.candidateItemId);

    expect(result.candidateItemId).toBe("16");
    expect(result.equippedSlot).toBe("Weapon 1");
    expect(result.itemComparison.current).toEqual({
      itemName: "Dire Beam",
      baseType: "Gelid Staff",
      rarity: "RARE",
      text: expect.stringContaining("Dire Beam")
    });
    expect(result.itemComparison.candidate).toEqual({
      itemName: "Rune Needle",
      baseType: "Gelid Staff",
      rarity: "RARE",
      text: expect.stringContaining("Rune Needle")
    });
    expect(afterItems).toHaveLength(beforeItems.length + 1);
    expect(afterItems.some((item) => item.text.includes("Dire Beam"))).toBe(true);
    expect(candidateItem?.text).toContain("\nRarity: RARE\nRune Needle\nGelid Staff\n");
    expect(candidateItem?.text).not.toContain("Item Class:");
    expect(afterSlots.get("Weapon 1")).toBe("16");
    expect(afterSlots.get("Weapon 2")).toBe("0");
    expect(afterSlots.get("Ring 1")).toBe("12");
    expect(afterSlots.get("Amulet")).toBe("11");

    const beforeDetails = parseBuildDetailsFromXml(beforeXml);
    const afterDetails = parseBuildDetailsFromXml(result.tempXml);
    expect(afterDetails.slots.find((slot) => slot.slot === "Weapon 1")).toEqual({
      slot: "Weapon 1",
      itemId: "16",
      itemName: "Rune Needle",
      baseType: "Gelid Staff",
      rarity: "RARE"
    });
    expect(afterDetails.stats).toEqual(beforeDetails.stats);

    const comparison = compareStats({
      beforeStats: beforeDetails.stats,
      afterStats: afterDetails.stats,
      selectedSkillLabel: beforeDetails.selectedSkill?.label ?? null
    });
    expect(comparison.calculationStatus).toBe("cached-xml-not-recalculated");
    expect(comparison.rows.every((row) => row.delta === 0 || row.status === "missing")).toBe(true);
  });

  it("writes a temp build with the candidate equipped and leaves the original unchanged", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Original Build.xml");
    const settingsPath = path.join(root, "Settings.xml");
    const beforeXml = await readFile(representativeBuildPath, "utf8");
    await writeFile(sourceBuildPath, beforeXml, "utf8");
    await writeFile(
      settingsPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding2>
  <Mode mode="BUILD">
    <Arg string="${escapeXml(sourceBuildPath)}"/>
    <Arg string="Original Build"/>
  </Mode>
</PathOfBuilding2>`
    );

    const tempRoot = path.join(root, "temp-builds");
    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: staffItemText,
      slotName: "Weapon1",
      tempRoot
    });

    expect(await readFile(sourceBuildPath, "utf8")).toBe(beforeXml);
    expect(result.sourceBuildPath).toBe(sourceBuildPath);
    expect(result.tempBuildPath).not.toBe(sourceBuildPath);
    expect(result.candidateItemId).toBe("16");
    expect(result.equippedSlot).toBe("Weapon 1");
    expect(result.clearedSlots).toEqual([]);
    expect(result.itemComparison).toEqual({
      slot: "Weapon 1",
      current: {
        itemName: "Dire Beam",
        baseType: "Gelid Staff",
        rarity: "RARE",
        text: expect.stringContaining("Dire Beam")
      },
      candidate: {
        itemName: "Rune Needle",
        baseType: "Gelid Staff",
        rarity: "RARE",
        text: expect.stringContaining("Rune Needle")
      }
    });

    const tempSettingsPath = path.join(root, "TempSettings.xml");
    await writeFile(
      tempSettingsPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<PathOfBuilding2>
  <Mode mode="BUILD">
    <Arg string="${escapeXml(result.tempBuildPath)}"/>
    <Arg string="Temp Candidate Build"/>
  </Mode>
</PathOfBuilding2>`
    );

    const tempBuild = await getCurrentBuild({ settingsPath: tempSettingsPath });
    expect(tempBuild.status).toBe("ready");
    expect(tempBuild.slots).toContainEqual({
      slot: "Weapon 1",
      itemId: "16",
      itemName: "Rune Needle",
      baseType: "Gelid Staff",
      rarity: "RARE"
    });
    expect(await readFile(result.tempBuildPath, "utf8")).toContain("Rune Needle");

    const originalBuild = await getCurrentBuild({ settingsPath });
    const comparison = compareStats({
      beforeStats: originalBuild.stats,
      afterStats: tempBuild.stats,
      selectedSkillLabel: originalBuild.selectedSkill?.label ?? null
    });
    expect(comparison.calculationStatus).toBe("cached-xml-not-recalculated");
    expect(comparison.selectedSkillLabel).toBe("Frostbolt");
    expect(comparison.warnings[0]).toContain("PoB-native recalculation is not available");
    expect(comparison.rows).toContainEqual(
      expect.objectContaining({
        key: "CombinedDPS",
        before: 79840.5440976,
        after: 79840.5440976,
        delta: 0,
        status: "available"
      })
    );
  });

  it("clears occupied offhand when equipping a two-handed weapon into Weapon 1", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Offhand Build.xml");
    const fixture = await readFile(representativeBuildPath, "utf8");
    await writeFile(sourceBuildPath, fixture.replace('<Slot name="Weapon 2" itemId="0"/>', '<Slot name="Weapon 2" itemId="11"/>'), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: staffItemText,
      slotName: "Weapon 1",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.clearedSlots).toEqual(["Weapon 2"]);
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Slot name="Weapon 1" itemId="16"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2" itemId="0"/>');
  });

  it("clears only the swap offhand when equipping a two-handed weapon into Weapon 1 Swap", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Swap Offhand Build.xml");
    const fixture = await readFile(representativeBuildPath, "utf8");
    await writeFile(
      sourceBuildPath,
      fixture
        .replace('<Slot name="Weapon 2" itemId="0"/>', '<Slot name="Weapon 2" itemId="11"/>')
        .replace('<Slot name="Weapon 2 Swap" itemId="0"/>', '<Slot name="Weapon 2 Swap" itemId="11"/>'),
      "utf8"
    );

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: staffItemText,
      slotName: "Weapon 1 Swap",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.equippedSlot).toBe("Weapon 1 Swap");
    expect(result.selectedWeaponSet).toBe("swap");
    expect(result.clearedSlots).toEqual(["Weapon 2 Swap"]);
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Items activeItemSet="2" useSecondWeaponSet="true">');
    expect(tempXml).toContain('<ItemSet title="Default" id="2" useSecondWeaponSet="true">');
    expect(tempXml).toContain('<Slot name="Weapon 1 Swap" itemId="16"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2" itemId="11"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2 Swap" itemId="0"/>');
  });

  it("keeps occupied offhand when equipping a one-handed weapon into Weapon 1", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "One Hand Build.xml");
    const fixture = await readFile(representativeBuildPath, "utf8");
    await writeFile(sourceBuildPath, fixture.replace('<Slot name="Weapon 2" itemId="0"/>', '<Slot name="Weapon 2" itemId="11"/>'), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.wand,
      slotName: "Weapon 1",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.clearedSlots).toEqual([]);
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Slot name="Weapon 1" itemId="16"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2" itemId="11"/>');
  });

  it("replaces an occupied offhand without changing the primary weapon", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Occupied Offhand Build.xml");
    const fixture = await readFile(representativeBuildPath, "utf8");
    await writeFile(sourceBuildPath, fixture.replace('<Slot name="Weapon 2" itemId="0"/>', '<Slot name="Weapon 2" itemId="11"/>'), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.tradeSiteSamplesBySlot.shield,
      slotName: "Weapon 2",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.equippedSlot).toBe("Weapon 2");
    expect(result.clearedSlots).toEqual([]);
    expect(result.itemComparison.current).toEqual({
      itemName: "Ghoul Choker",
      baseType: "Gold Amulet",
      rarity: "RARE",
      text: expect.stringContaining("Ghoul Choker")
    });
    expect(result.itemComparison.candidate).toEqual({
      itemName: "Stone Shelter",
      baseType: "Elite Tower Shield",
      rarity: "RARE",
      text: expect.stringContaining("Stone Shelter")
    });
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Slot name="Weapon 1" itemId="10"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2" itemId="16"/>');
  });

  it("equips an offhand into the empty swap offhand slot and calculates with weapon set II", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Empty Swap Offhand Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.tradeSiteSamplesBySlot.focus,
      slotName: "Weapon 2 Swap",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.equippedSlot).toBe("Weapon 2 Swap");
    expect(result.selectedWeaponSet).toBe("swap");
    expect(result.clearedSlots).toEqual([]);
    expect(result.itemComparison.current).toEqual({
      itemName: null,
      baseType: null,
      rarity: null,
      text: null
    });
    expect(result.itemComparison.candidate).toEqual({
      itemName: "Glyph Lantern",
      baseType: "Volatile Focus",
      rarity: "RARE",
      text: expect.stringContaining("Glyph Lantern")
    });
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Items activeItemSet="2" useSecondWeaponSet="true">');
    expect(tempXml).toContain('<Slot name="Weapon 1 Swap" itemId="0"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2 Swap" itemId="16"/>');
  });

  it("replaces an empty primary weapon slot without touching the offhand", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Empty Primary Weapon Build.xml");
    const fixture = await readFile(representativeBuildPath, "utf8");
    await writeFile(
      sourceBuildPath,
      fixture
        .replace('<Slot name="Weapon 1" itemId="10"/>', '<Slot name="Weapon 1" itemId="0"/>')
        .replace('<Slot name="Weapon 2" itemId="0"/>', '<Slot name="Weapon 2" itemId="11"/>'),
      "utf8"
    );

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.wand,
      slotName: "Weapon 1",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.equippedSlot).toBe("Weapon 1");
    expect(result.selectedWeaponSet).toBe("primary");
    expect(result.clearedSlots).toEqual([]);
    expect(result.itemComparison.current).toEqual({
      itemName: null,
      baseType: null,
      rarity: null,
      text: null
    });
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Slot name="Weapon 1" itemId="16"/>');
    expect(tempXml).toContain('<Slot name="Weapon 2" itemId="11"/>');
  });

  it("creates a temp build from trade-site staff text without rarity", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Trade Site Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.tradeSiteStaffWithoutRarity,
      slotName: "Weapon 1",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.candidate.name).toBe("Corruption Pillar");
    expect(result.candidate.baseType).toBe("Pyrophyte Staff");
    expect(result.candidate.rarity).toBe("RARE");
    expect(result.warnings).toContain("Trade text did not include rarity; assuming Rare for the temporary PoB item.");
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain("Corruption Pillar");
    expect(tempXml).toContain("Pyrophyte Staff");
    expect(tempXml).toContain("Rarity: RARE");
  });

  it("writes a temp build with a manual target skill selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Skill Selection Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.wand,
      selectedSkill: {
        activeSkillSet: 2,
        mainSocketGroup: 1
      },
      slotName: "Weapon 1",
      tempRoot: path.join(root, "temp-builds")
    });

    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain('<Build className="Sorceress" ascendClassName="Stormweaver" level="94" mainSocketGroup="1">');
    expect(tempXml).toContain('<Skills activeSkillSet="2">');
  });

  it("equips jewelry samples into the selected compatible slot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Jewelry Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.ring,
      slotName: "Ring2",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.equippedSlot).toBe("Ring 2");
    expect(result.clearedSlots).toEqual([]);
    const tempXml = await readFile(result.tempBuildPath, "utf8");
    expect(tempXml).toContain("Carrion Loop");
    expect(tempXml).toContain('<Slot name="Ring 2" itemId="16"/>');
  });

  it("reports empty current item text when the selected slot is empty", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Empty Offhand Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath,
      itemText: itemTextSamples.tradeSiteSamplesBySlot.focus,
      slotName: "Weapon 2",
      tempRoot: path.join(root, "temp-builds")
    });

    expect(result.equippedSlot).toBe("Weapon 2");
    expect(result.itemComparison.current).toEqual({
      itemName: null,
      baseType: null,
      rarity: null,
      text: null
    });
    expect(result.itemComparison.candidate).toEqual({
      itemName: "Glyph Lantern",
      baseType: "Volatile Focus",
      rarity: "RARE",
      text: expect.stringContaining("Glyph Lantern")
    });
  });

  it("rejects incompatible slot choices before writing a temp build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Original Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    await expect(
      createTemporaryEquippedBuild({
        sourceBuildPath,
        itemText: staffItemText,
        slotName: "Ring 1",
        tempRoot: path.join(root, "temp-builds")
      })
    ).rejects.toThrow("cannot be equipped in Ring 1");
  });

  it("rejects unknown equipment types before writing a temp build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Original Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    await expect(
      createTemporaryEquippedBuild({
        sourceBuildPath,
        itemText: `Mystery Charm
Unmapped Relic
Relic
Item Level: 82
+20 to Spirit`,
        slotName: "Amulet",
        tempRoot: path.join(root, "temp-builds")
      })
    ).rejects.toThrow("Could not work out which equipment slot");
  });

  it("rejects incomplete item text before writing a temp build", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-"));
    const sourceBuildPath = path.join(root, "Original Build.xml");
    await writeFile(sourceBuildPath, await readFile(representativeBuildPath, "utf8"), "utf8");

    await expect(
      createTemporaryEquippedBuild({
        sourceBuildPath,
        itemText: "Item Class: Staves",
        slotName: "Weapon 1",
        tempRoot: path.join(root, "temp-builds")
      })
    ).rejects.toThrow("item name and base type");
  });
});

describe("cleanupTemporaryBuilds", () => {
  it("removes stale app candidate files and leaves unrelated files alone", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-cleanup-"));
    const oldCandidate = path.join(root, "Old Build.candidate-100000-abcdef.xml");
    const freshCandidate = path.join(root, "Fresh Build.candidate-200000-bcdef0.xml");
    const unrelated = path.join(root, "notes.xml");
    await writeFile(oldCandidate, "old", "utf8");
    await writeFile(freshCandidate, "fresh", "utf8");
    await writeFile(unrelated, "notes", "utf8");

    const now = Date.now();
    await utimes(oldCandidate, new Date(now - 10_000), new Date(now - 10_000));
    await utimes(freshCandidate, new Date(now), new Date(now));
    await utimes(unrelated, new Date(now - 10_000), new Date(now - 10_000));

    const deleted = await cleanupTemporaryBuilds({
      tempRoot: root,
      olderThanMs: 1_000,
      now
    });

    expect(deleted).toBe(1);
    await expect(access(oldCandidate)).rejects.toThrow();
    await expect(access(freshCandidate)).resolves.toBeUndefined();
    await expect(access(unrelated)).resolves.toBeUndefined();
  });

  it("keeps only the newest app candidate files when the temp folder is crowded", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-cleanup-"));
    const oldest = path.join(root, "Oldest.candidate-100000-aaaaaa.xml");
    const middle = path.join(root, "Middle.candidate-200000-bbbbbb.xml");
    const newest = path.join(root, "Newest.candidate-300000-cccccc.xml");
    await writeFile(oldest, "oldest", "utf8");
    await writeFile(middle, "middle", "utf8");
    await writeFile(newest, "newest", "utf8");

    const now = Date.now();
    await utimes(oldest, new Date(now - 3_000), new Date(now - 3_000));
    await utimes(middle, new Date(now - 2_000), new Date(now - 2_000));
    await utimes(newest, new Date(now - 1_000), new Date(now - 1_000));

    const deleted = await cleanupTemporaryBuilds({
      tempRoot: root,
      olderThanMs: 60_000,
      maxFiles: 2,
      now
    });

    expect(deleted).toBe(1);
    await expect(access(oldest)).rejects.toThrow();
    await expect(access(middle)).resolves.toBeUndefined();
    await expect(access(newest)).resolves.toBeUndefined();
  });
});

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function getBuildItems(xml: string): Array<{ id: string; text: string }> {
  const root = testXmlParser.parse(xml) as XmlRecord;
  return toArray(getRecord(root.PathOfBuilding2)?.Items)
    .flatMap((items) => toArray(items.Item))
    .map((item) => ({
      id: String(item.id),
      text: String(item["#text"] ?? "")
    }));
}

function getActiveSlotMap(xml: string): Map<string, string> {
  const root = testXmlParser.parse(xml) as XmlRecord;
  const items = getRecord(getRecord(root.PathOfBuilding2)?.Items);
  const activeItemSetId = String(items?.activeItemSet ?? "1");
  const activeItemSet = toArray(items?.ItemSet).find((itemSet) => String(itemSet.id) === activeItemSetId);
  return new Map(toArray(activeItemSet?.Slot).map((slot) => [String(slot.name), String(slot.itemId)]));
}

interface XmlRecord {
  [key: string]: unknown;
}

function getRecord(value: unknown): XmlRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as XmlRecord) : undefined;
}

function toArray(value: unknown): XmlRecord[] {
  if (value === undefined || value === null) {
    return [];
  }
  return (Array.isArray(value) ? value : [value]).flatMap((item) => {
    const record = getRecord(item);
    return record ? [record] : [];
  });
}
