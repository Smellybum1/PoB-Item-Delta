import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  defaultCocFrostModelAssumptions,
  normalizeCocAssumptions,
  type AppSettingsResponse,
  type CocFrostModelAssumptions,
  type CocFrostModelConfidence,
  type CocFrostModelProfile,
  type TargetSizeProfile,
  type UpdateAppSettingsRequest
} from "@pob-item-delta/shared";

import { DEFAULT_SETTINGS_PATH } from "./currentBuild.js";
import { DEFAULT_POB2_INSTALL_PATH } from "./luaBridge.js";

interface AppSettingsOptions {
  env?: NodeJS.ProcessEnv;
  settingsPath?: string;
}

interface StoredAppSettings {
  enableLuaBridge?: unknown;
  pobInstallPath?: unknown;
  pobSettingsPath?: unknown;
  cocFrostModelProfiles?: unknown;
}

interface ProfileNormalizationResult {
  profiles: CocFrostModelProfile[];
  warnings: string[];
}

export async function getAppSettings(options: AppSettingsOptions = {}): Promise<AppSettingsResponse> {
  const env = options.env ?? process.env;
  const settingsPath = resolveAppSettingsPath(options);
  const defaultSettings = buildDefaultSettings(env, settingsPath);

  try {
    const stored = JSON.parse(await readFile(settingsPath, "utf8")) as StoredAppSettings;
    const warnings: string[] = [];
    if (typeof stored.enableLuaBridge !== "boolean") {
      warnings.push("Settings file did not include a valid Lua bridge setting; using the default.");
    }
    if (!isNonEmptyString(stored.pobInstallPath)) {
      warnings.push("Settings file did not include a valid PoB install path; using the default.");
    }
    if (!isNonEmptyString(stored.pobSettingsPath)) {
      warnings.push("Settings file did not include a valid PoB Settings.xml path; using the default.");
    }

    const profileResult = normalizeCocFrostModelProfiles(stored.cocFrostModelProfiles);

    return {
      enableLuaBridge: typeof stored.enableLuaBridge === "boolean" ? stored.enableLuaBridge : defaultSettings.enableLuaBridge,
      pobInstallPath: isNonEmptyString(stored.pobInstallPath) ? path.resolve(stored.pobInstallPath) : defaultSettings.pobInstallPath,
      pobSettingsPath: isNonEmptyString(stored.pobSettingsPath) ? path.resolve(stored.pobSettingsPath) : defaultSettings.pobSettingsPath,
      cocFrostModelProfiles: profileResult.profiles,
      settingsPath,
      source: "file",
      warnings: [...warnings, ...profileResult.warnings]
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return defaultSettings;
    }

    return {
      ...defaultSettings,
      warnings: ["Settings file could not be read; using defaults for this session."]
    };
  }
}

export async function updateAppSettings(request: UpdateAppSettingsRequest, options: AppSettingsOptions = {}): Promise<AppSettingsResponse> {
  const current = await getAppSettings(options);
  const next: AppSettingsResponse = {
    ...current,
    enableLuaBridge: typeof request.enableLuaBridge === "boolean" ? request.enableLuaBridge : current.enableLuaBridge,
    pobInstallPath: normalizeSettingPath(request.pobInstallPath) ?? current.pobInstallPath,
    pobSettingsPath: normalizeSettingPath(request.pobSettingsPath) ?? current.pobSettingsPath,
    cocFrostModelProfiles:
      request.cocFrostModelProfiles === undefined
        ? current.cocFrostModelProfiles
        : normalizeCocFrostModelProfiles(request.cocFrostModelProfiles).profiles,
    source: "file",
    warnings: []
  };

  await mkdir(path.dirname(current.settingsPath), { recursive: true });
  await writeFile(
    current.settingsPath,
    `${JSON.stringify(
      {
        enableLuaBridge: next.enableLuaBridge,
        pobInstallPath: next.pobInstallPath,
        pobSettingsPath: next.pobSettingsPath,
        cocFrostModelProfiles: next.cocFrostModelProfiles
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return next;
}

function buildDefaultSettings(env: NodeJS.ProcessEnv, settingsPath: string): AppSettingsResponse {
  return {
    enableLuaBridge: env.POB_LUA_ENABLED === "true",
    pobInstallPath: normalizeSettingPath(env.POB_FORK_PATH) ?? DEFAULT_POB2_INSTALL_PATH,
    pobSettingsPath: normalizeSettingPath(env.POB2_SETTINGS_PATH) ?? DEFAULT_SETTINGS_PATH,
    cocFrostModelProfiles: [],
    settingsPath,
    source: "default",
    warnings: []
  };
}

function resolveAppSettingsPath(options: AppSettingsOptions): string {
  const env = options.env ?? process.env;
  if (options.settingsPath?.trim()) {
    return path.resolve(options.settingsPath);
  }
  if (env.POB_ITEM_DELTA_SETTINGS_PATH?.trim()) {
    return path.resolve(env.POB_ITEM_DELTA_SETTINGS_PATH);
  }

  const root = env.LOCALAPPDATA?.trim()
    ? path.join(env.LOCALAPPDATA, "PoB Item Delta")
    : path.join(os.homedir(), ".pob-item-delta");
  return path.join(root, "settings.json");
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeSettingPath(value: unknown): string | null {
  return isNonEmptyString(value) ? path.resolve(value) : null;
}

function normalizeCocFrostModelProfiles(value: unknown): ProfileNormalizationResult {
  if (value === undefined) {
    return { profiles: [], warnings: [] };
  }
  if (!Array.isArray(value)) {
    return {
      profiles: [],
      warnings: ["Settings file included invalid CoC Frost model profiles; using none."]
    };
  }

  const warnings: string[] = [];
  const profiles: CocFrostModelProfile[] = [];
  const profileIndexes = new Map<string, number>();

  for (const entry of value) {
    const profile = normalizeCocFrostModelProfile(entry);
    if (!profile) {
      warnings.push("Settings file included a CoC Frost model profile without a valid build path; it was skipped.");
      continue;
    }

    const profileKey = profilePathKey(profile.buildPath);
    const existingIndex = profileIndexes.get(profileKey);
    if (existingIndex === undefined) {
      profileIndexes.set(profileKey, profiles.length);
      profiles.push(profile);
    } else {
      profiles[existingIndex] = profile;
    }
  }

  return { profiles, warnings };
}

function normalizeCocFrostModelProfile(value: unknown): CocFrostModelProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const buildPath = normalizeSettingPath(value.buildPath);
  if (!buildPath) {
    return null;
  }

  return {
    buildPath,
    buildName: isNonEmptyString(value.buildName) ? value.buildName.trim() : null,
    updatedAt: normalizeTimestamp(value.updatedAt),
    confidence: normalizeConfidence(value.confidence),
    assumptions: readCocAssumptions(value.assumptions)
  };
}

function readCocAssumptions(value: unknown): CocFrostModelAssumptions {
  const record = isRecord(value) ? value : {};
  return normalizeCocAssumptions({
    frostboltCastsPerSecond: readStoredNumber(record.frostboltCastsPerSecond, defaultCocFrostModelAssumptions.frostboltCastsPerSecond),
    frostboltCritChancePercent: readStoredNumber(record.frostboltCritChancePercent, defaultCocFrostModelAssumptions.frostboltCritChancePercent),
    averageFrostboltCollisionsPerCast: readStoredNumber(
      record.averageFrostboltCollisionsPerCast,
      defaultCocFrostModelAssumptions.averageFrostboltCollisionsPerCast
    ),
    averageFrostboltExplosionsHittingBoss: readStoredNumber(
      record.averageFrostboltExplosionsHittingBoss,
      defaultCocFrostModelAssumptions.averageFrostboltExplosionsHittingBoss
    ),
    triggeredSpellTriggersPerSecond: readStoredNumber(
      record.triggeredSpellTriggersPerSecond,
      defaultCocFrostModelAssumptions.triggeredSpellTriggersPerSecond
    ),
    targetSizeProfile: readTargetSizeProfile(record.targetSizeProfile)
  });
}

function readStoredNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readTargetSizeProfile(value: unknown): TargetSizeProfile {
  return value === "small" || value === "medium" || value === "large" ? value : defaultCocFrostModelAssumptions.targetSizeProfile;
}

function normalizeConfidence(value: unknown): CocFrostModelConfidence {
  return value === "validated" || value === "experimental" ? value : "rough";
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  return new Date(0).toISOString();
}

function profilePathKey(buildPath: string): string {
  const normalized = path.resolve(buildPath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
