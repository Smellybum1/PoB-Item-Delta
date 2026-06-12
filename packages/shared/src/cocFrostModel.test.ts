import { describe, expect, it } from "vitest";

import { calculateCocFrostModel } from "./index.js";

describe("calculateCocFrostModel", () => {
  it("matches a hand-calculated medium target example", () => {
    const result = calculateCocFrostModel({
      pobNativeDps: 5000,
      selectedSkillAverageHit: 1000,
      assumptions: {
        frostboltCastsPerSecond: 2,
        frostboltCritChancePercent: 50,
        averageFrostboltCollisionsPerCast: 1.5,
        averageFrostboltExplosionsHittingBoss: 2,
        triggeredSpellTriggersPerSecond: 4,
        targetSizeProfile: "medium"
      }
    });

    expect(result.frostboltHitEventsPerSecond).toBe(7);
    expect(result.critGatedTriggerEventsPerSecond).toBe(2);
    expect(result.modeledDps).toBe(9000);
    expect(result.pobNativeDps).toBe(5000);
    expect(result.status).toBe("ready");
  });

  it("applies target size to explosion hits only", () => {
    const result = calculateCocFrostModel({
      pobNativeDps: null,
      selectedSkillAverageHit: 100,
      assumptions: {
        frostboltCastsPerSecond: 4,
        frostboltCritChancePercent: 100,
        averageFrostboltCollisionsPerCast: 1,
        averageFrostboltExplosionsHittingBoss: 2,
        triggeredSpellTriggersPerSecond: 1,
        targetSizeProfile: "large"
      }
    });

    expect(result.targetSizeMultiplier).toBe(1.25);
    expect(result.frostboltHitEventsPerSecond).toBe(14);
    expect(result.critGatedTriggerEventsPerSecond).toBe(1);
    expect(result.modeledDps).toBe(1500);
  });

  it("clamps unsafe assumptions and reports missing average hit", () => {
    const result = calculateCocFrostModel({
      pobNativeDps: Number.NaN,
      selectedSkillAverageHit: null,
      assumptions: {
        frostboltCastsPerSecond: -1,
        frostboltCritChancePercent: 150,
        averageFrostboltCollisionsPerCast: Number.NaN,
        averageFrostboltExplosionsHittingBoss: 1,
        triggeredSpellTriggersPerSecond: 2,
        targetSizeProfile: "small"
      }
    });

    expect(result.status).toBe("missing-average-hit");
    expect(result.modeledDps).toBeNull();
    expect(result.pobNativeDps).toBeNull();
    expect(result.assumptions.frostboltCastsPerSecond).toBe(0);
    expect(result.assumptions.frostboltCritChancePercent).toBe(100);
    expect(result.assumptions.averageFrostboltCollisionsPerCast).toBe(0);
  });
});
