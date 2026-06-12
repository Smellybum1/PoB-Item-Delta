import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { defaultCocFrostModelAssumptions } from "@pob-item-delta/shared";

import { getAppSettings, updateAppSettings } from "../pob/appSettings.js";

describe("app settings", () => {
  it("defaults setup fields from legacy env vars before a file is saved", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-settings-"));
    const settingsPath = path.join(root, "settings.json");
    const installPath = path.join(root, "PoB Install");
    const pobSettingsPath = path.join(root, "Settings.xml");

    const settings = await getAppSettings({
      settingsPath,
      env: {
        POB_LUA_ENABLED: "true",
        POB_FORK_PATH: installPath,
        POB2_SETTINGS_PATH: pobSettingsPath
      }
    });

    expect(settings.enableLuaBridge).toBe(true);
    expect(settings.pobInstallPath).toBe(installPath);
    expect(settings.pobSettingsPath).toBe(pobSettingsPath);
    expect(settings.cocFrostModelProfiles).toEqual([]);
    expect(settings.source).toBe("default");
    expect(settings.settingsPath).toBe(settingsPath);
  });

  it("persists in-app setup fields", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-settings-"));
    const settingsPath = path.join(root, "settings.json");
    const installPath = path.join(root, "Path of Building Community (PoE2)");
    const pobSettingsPath = path.join(root, "Path of Building (PoE2)", "Settings.xml");

    const updated = await updateAppSettings(
      {
        enableLuaBridge: true,
        pobInstallPath: installPath,
        pobSettingsPath
      },
      {
        settingsPath,
        env: {}
      }
    );
    const reloaded = await getAppSettings({
      settingsPath,
      env: {}
    });

    expect(updated.enableLuaBridge).toBe(true);
    expect(updated.pobInstallPath).toBe(installPath);
    expect(updated.pobSettingsPath).toBe(pobSettingsPath);
    expect(updated.source).toBe("file");
    expect(reloaded.enableLuaBridge).toBe(true);
    expect(reloaded.pobInstallPath).toBe(installPath);
    expect(reloaded.pobSettingsPath).toBe(pobSettingsPath);
    expect(JSON.parse(await readFile(settingsPath, "utf8"))).toEqual({
      enableLuaBridge: true,
      pobInstallPath: installPath,
      pobSettingsPath,
      cocFrostModelProfiles: []
    });
  });

  it("saved settings override the legacy env flag", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-settings-"));
    const settingsPath = path.join(root, "settings.json");

    await updateAppSettings(
      {
        enableLuaBridge: false
      },
      {
        settingsPath,
        env: {
          POB_LUA_ENABLED: "true"
        }
      }
    );
    const settings = await getAppSettings({
      settingsPath,
      env: {
        POB_LUA_ENABLED: "true"
      }
    });

    expect(settings.enableLuaBridge).toBe(false);
    expect(settings.source).toBe("file");
  });

  it("persists and normalizes per-build CoC Frost model profiles", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-settings-"));
    const settingsPath = path.join(root, "settings.json");
    const buildPath = path.join(root, "builds", "frost.xml");

    const updated = await updateAppSettings(
      {
        cocFrostModelProfiles: [
          {
            buildPath,
            buildName: "Frostbolt Test",
            updatedAt: "2026-06-11T03:20:00.000Z",
            confidence: "validated",
            assumptions: {
              frostboltCastsPerSecond: 3.5,
              frostboltCritChancePercent: 120,
              averageFrostboltCollisionsPerCast: -2,
              averageFrostboltExplosionsHittingBoss: 1.75,
              triggeredSpellTriggersPerSecond: 2,
              targetSizeProfile: "large"
            }
          }
        ]
      },
      {
        settingsPath,
        env: {}
      }
    );

    expect(updated.cocFrostModelProfiles).toEqual([
      {
        buildPath,
        buildName: "Frostbolt Test",
        updatedAt: "2026-06-11T03:20:00.000Z",
        confidence: "validated",
        assumptions: {
          frostboltCastsPerSecond: 3.5,
          frostboltCritChancePercent: 100,
          averageFrostboltCollisionsPerCast: 0,
          averageFrostboltExplosionsHittingBoss: 1.75,
          triggeredSpellTriggersPerSecond: 2,
          targetSizeProfile: "large"
        }
      }
    ]);

    const reloaded = await getAppSettings({
      settingsPath,
      env: {}
    });
    expect(reloaded.cocFrostModelProfiles).toEqual(updated.cocFrostModelProfiles);
  });

  it("keeps older settings files compatible and warns on malformed profiles", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-settings-"));
    const settingsPath = path.join(root, "settings.json");

    await writeFile(
      settingsPath,
      JSON.stringify(
        {
          enableLuaBridge: true,
          pobInstallPath: path.join(root, "PoB"),
          pobSettingsPath: path.join(root, "Settings.xml"),
          cocFrostModelProfiles: [
            {
              buildPath: path.join(root, "builds", "valid.xml"),
              buildName: "",
              updatedAt: "not-a-date",
              confidence: "unknown",
              assumptions: {
                frostboltCastsPerSecond: "fast",
                targetSizeProfile: "giant"
              }
            },
            {
              buildName: "Missing build path"
            }
          ]
        },
        null,
        2
      ),
      "utf8"
    );

    const settings = await getAppSettings({ settingsPath, env: {} });

    expect(settings.cocFrostModelProfiles).toEqual([
      {
        buildPath: path.join(root, "builds", "valid.xml"),
        buildName: null,
        updatedAt: "1970-01-01T00:00:00.000Z",
        confidence: "rough",
        assumptions: defaultCocFrostModelAssumptions
      }
    ]);
    expect(settings.warnings).toContain("Settings file included a CoC Frost model profile without a valid build path; it was skipped.");
  });
});
