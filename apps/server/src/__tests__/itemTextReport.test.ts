import { describe, expect, it } from "vitest";

import { itemTextSamples } from "../__fixtures__/itemTextSamples.js";
import { formatItemTextInspection, inspectItemTextReport } from "../pob/itemTextReport.js";

describe("item text report inspection", () => {
  it("extracts a copied parser report and checks selected slot compatibility", () => {
    const report = [
      "# PoB Item Delta parser report",
      "",
      "## Context",
      "",
      "Selected slot: Weapon 1",
      "",
      "## Parser error",
      "",
      "Candidate item text must include rarity, item name, and base type.",
      "",
      "## Pasted item text",
      "",
      "```text",
      itemTextSamples.tradeSiteStaffWithoutRarity,
      "```"
    ].join("\n");

    const inspection = inspectItemTextReport(report);

    expect(inspection.source).toBe("parser-report");
    expect(inspection.status).toBe("ready");
    expect(inspection.selectedSlot).toBe("Weapon 1");
    expect(inspection.item.name).toBe("Corruption Pillar");
    expect(inspection.item.compatibleSlots).toEqual(["Weapon 1", "Weapon 1 Swap"]);
    expect(inspection.item.clearsSlots).toEqual(["Weapon 2", "Weapon 2 Swap"]);
    expect(inspection.suggestedFixtureKey).toBe("corruptionPillar");
    expect(inspection.suggestedFixtureEntry).toContain("corruptionPillar");
    expect(inspection.suggestedFixtureEntry).toContain("\\nPyrophyte Staff\\nStaff");
    expect(inspection.suggestedTestCase).toContain("itemTextSamples.corruptionPillar");
    expect(inspection.suggestedTestCase).toContain('"Weapon 1"');
    expect(inspection.suggestedIssueSnippet).toContain("Inspector status: ready");
    expect(inspection.suggestedIssueSnippet).toContain("Compatible slots: Weapon 1, Weapon 1 Swap");
    expect(inspection.suggestedIssueSnippet).toContain("Corruption Pillar");
    expect(inspection.suggestedIssueSnippet).toContain("Weapon 1");
  });

  it("can inspect raw copied item text without a parser report wrapper", () => {
    const inspection = inspectItemTextReport(itemTextSamples.tradeSiteSamplesBySlot.ring);

    expect(inspection.source).toBe("raw-item-text");
    expect(inspection.status).toBe("ready");
    expect(inspection.selectedSlot).toBeNull();
    expect(inspection.item.name).toBe("Carrion Loop");
    expect(inspection.item.compatibleSlots).toEqual(["Ring 1", "Ring 2"]);
    expect(formatItemTextInspection(inspection)).toContain("Copyable fixture entry:");
    expect(formatItemTextInspection(inspection)).toContain("Copyable test case hint:");
    expect(formatItemTextInspection(inspection)).toContain("Copyable GitHub issue snippet:");
  });

  it("accepts a copied successful item report as fixture evidence", () => {
    const report = [
      "# PoB Item Delta parser report",
      "",
      "## Context",
      "",
      "Build status: ready",
      "Selected slot: Ring 2",
      "",
      "## Parser note",
      "",
      "No parser error was shown when this report was copied. Inspect this exact text before turning it into a fixture.",
      "",
      "## Pasted item text",
      "",
      "```text",
      itemTextSamples.tradeSiteSamplesBySlot.ring,
      "```"
    ].join("\n");

    const inspection = inspectItemTextReport(report);

    expect(inspection.source).toBe("parser-report");
    expect(inspection.status).toBe("ready");
    expect(inspection.selectedSlot).toBe("Ring 2");
    expect(inspection.item.name).toBe("Carrion Loop");
    expect(inspection.suggestedFixtureEntry).toContain("carrionLoop");
    expect(inspection.suggestedIssueSnippet).toContain("Inspector status: ready");
    expect(inspection.suggestedIssueSnippet).toContain("Ring 2");
  });

  it("explains incomplete pasted item text before fixture work", () => {
    const inspection = inspectItemTextReport(`Selected slot: Weapon 1

## Pasted item text

\`\`\`text
Corruption Pillar
Quality: +20%
Item Level: 82
\`\`\``);

    expect(inspection.status).toBe("incomplete-item-text");
    expect(inspection.item.name).toBe("Corruption Pillar");
    expect(inspection.item.baseType).toBeNull();
    expect(formatItemTextInspection(inspection)).toContain("The parser could not find both an item name and base type.");
  });

  it("flags a selected slot that does not match the parsed item family", () => {
    const inspection = inspectItemTextReport(`Selected slot: Amulet

## Pasted item text

\`\`\`text
${itemTextSamples.tradeSiteSamplesBySlot.shield}
\`\`\``);

    expect(inspection.status).toBe("selected-slot-incompatible");
    expect(inspection.selectedSlot).toBe("Amulet");
    expect(inspection.messages[0]).toContain("Weapon 2, Weapon 2 Swap");
  });
});
