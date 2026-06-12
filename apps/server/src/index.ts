import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import type {
  AppDiagnosticsResponse,
  AppSettingsResponse,
  BuildCoverageReportResponse,
  BuildSkillSelection,
  BuildWeaponSet,
  ListBuildBackupsResponse,
  OpenTempBuildInPobRequest,
  OpenTempBuildInPobResponse,
  RecalculateTempBuildRequest,
  RecalculateTempBuildResponse,
  RestoreBuildBackupRequest,
  RestoreBuildBackupResponse,
  SaveTempBuildAsNewRequest,
  SaveTempBuildAsNewResponse,
  SaveTempBuildRequest,
  SaveTempBuildResponse,
  TempEquipRequest,
  UpdateAppSettingsRequest,
  TempEquipResponse
} from "@pob-item-delta/shared";

import { getCurrentBuild } from "./pob/currentBuild.js";
import { createBuildCoverageReport } from "./pob/buildCoverage.js";
import { getLuaBridgeStatus } from "./pob/luaBridge.js";
import { getAppSettings, updateAppSettings } from "./pob/appSettings.js";
import { OpenTempBuildError, openTemporaryBuildInPob } from "./pob/openTempBuild.js";
import {
  listBuildBackups,
  restoreBuildBackup,
  SaveBuildError,
  saveTemporaryBuild,
  saveTemporaryBuildAsNew
} from "./pob/saveBuild.js";
import { createTemporaryEquippedBuild, TempEquipError } from "./pob/tempEquip.js";
import {
  RecalculateTempBuildError,
  recalculateTemporaryBuildComparison
} from "./pob/recalculateTempBuild.js";
import { SkillSelectionError } from "./pob/skillSelection.js";
import { WeaponSetSelectionError } from "./pob/weaponSetSelection.js";

const app = express();
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 5174);
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.resolve(process.env.POB_ITEM_DELTA_WEB_DIST ?? path.join(serverDir, "../../web/dist"));
const packageJsonPath = path.resolve(serverDir, "../../../package.json");

app.disable("x-powered-by");
app.use(express.json({ limit: "512kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
});

app.get("/api/current-build", async (_request, response, next) => {
  try {
    const appSettings = await getAppSettings();
    response.json(await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath }));
  } catch (error) {
    next(error);
  }
});

app.get("/api/lua-bridge/status", async (_request, response, next) => {
  try {
    const appSettings = await getAppSettings();
    response.json(
      await getLuaBridgeStatus({
        enabled: appSettings.enableLuaBridge,
        forkPath: appSettings.pobInstallPath
      })
    );
  } catch (error) {
    next(error);
  }
});

app.get("/api/app-settings", async (_request, response, next) => {
  try {
    response.json(await getAppSettings());
  } catch (error) {
    next(error);
  }
});

app.get("/api/diagnostics", async (_request, response, next) => {
  try {
    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    const luaBridge = await getLuaBridgeStatus({
      enabled: appSettings.enableLuaBridge,
      forkPath: appSettings.pobInstallPath
    });

    const payload: AppDiagnosticsResponse = {
      appName: "PoB Item Delta",
      appVersion: await readAppVersion(),
      generatedAt: new Date().toISOString(),
      localOnly: true,
      server: {
        host,
        port,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        webDistReady: existsSync(path.join(webDistPath, "index.html"))
      },
      build: {
        status: currentBuild.status,
        message: currentBuild.message,
        mode: currentBuild.mode,
        buildDetected: Boolean(currentBuild.buildPath),
        buildFileName: currentBuild.fileName,
        buildName: currentBuild.buildName,
        characterSummary: summarizeCharacter(currentBuild.character),
        selectedSkillLabel: currentBuild.selectedSkill?.label ?? null,
        activeWeaponSet: currentBuild.activeWeaponSet,
        statCount: currentBuild.stats.length,
        slotCount: currentBuild.slots.length,
        warnings: currentBuild.warnings
      },
      settings: {
        source: appSettings.source,
        luaBridgeEnabled: appSettings.enableLuaBridge,
        pobInstallPathConfigured: appSettings.pobInstallPath.trim().length > 0,
        pobSettingsPathConfigured: appSettings.pobSettingsPath.trim().length > 0,
        settingsFileConfigured: appSettings.settingsPath.trim().length > 0,
        cocFrostModelProfileCount: appSettings.cocFrostModelProfiles.length,
        warnings: appSettings.warnings
      },
      luaBridge: {
        status: luaBridge.status,
        canAttemptStart: luaBridge.canAttemptStart,
        checks: luaBridge.checks.map((check) => ({
          key: check.key,
          label: check.label,
          ok: check.ok
        }))
      }
    };

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/build-coverage-report", async (_request, response, next) => {
  try {
    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }

    const payload: BuildCoverageReportResponse = await createBuildCoverageReport({
      buildsPath: path.dirname(currentBuild.buildPath)
    });
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.get("/api/build-backups", async (request, response, next) => {
  try {
    const requestedBuildPath = typeof request.query.sourceBuildPath === "string" ? request.query.sourceBuildPath : null;
    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }

    const sourceBuildPath = requestedBuildPath?.trim() || currentBuild.buildPath;
    if (!samePath(sourceBuildPath, currentBuild.buildPath)) {
      response.status(409).json({ message: "The current PoB build changed. Refresh before managing backups." });
      return;
    }

    const payload: ListBuildBackupsResponse = await listBuildBackups({ sourceBuildPath });
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.put("/api/app-settings", async (request, response, next) => {
  try {
    const body = request.body as Partial<UpdateAppSettingsRequest>;
    if (body.enableLuaBridge !== undefined && typeof body.enableLuaBridge !== "boolean") {
      response.status(400).json({ message: "enableLuaBridge must be true or false." });
      return;
    }
    if (body.pobInstallPath !== undefined && typeof body.pobInstallPath !== "string") {
      response.status(400).json({ message: "pobInstallPath must be a string." });
      return;
    }
    if (body.pobSettingsPath !== undefined && typeof body.pobSettingsPath !== "string") {
      response.status(400).json({ message: "pobSettingsPath must be a string." });
      return;
    }
    if (body.cocFrostModelProfiles !== undefined && !Array.isArray(body.cocFrostModelProfiles)) {
      response.status(400).json({ message: "cocFrostModelProfiles must be an array." });
      return;
    }

    const settingsUpdate: UpdateAppSettingsRequest = {};
    if (typeof body.enableLuaBridge === "boolean") {
      settingsUpdate.enableLuaBridge = body.enableLuaBridge;
    }
    if (typeof body.pobInstallPath === "string") {
      settingsUpdate.pobInstallPath = body.pobInstallPath;
    }
    if (typeof body.pobSettingsPath === "string") {
      settingsUpdate.pobSettingsPath = body.pobSettingsPath;
    }
    if (Array.isArray(body.cocFrostModelProfiles)) {
      settingsUpdate.cocFrostModelProfiles = body.cocFrostModelProfiles;
    }
    const payload: AppSettingsResponse = await updateAppSettings(settingsUpdate);
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/restore-build-backup", async (request, response, next) => {
  try {
    const body = request.body as Partial<RestoreBuildBackupRequest>;
    if (!body.sourceBuildPath?.trim() || !body.backupBuildPath?.trim()) {
      response.status(400).json({ message: "Original build path and backup build path are required." });
      return;
    }
    if (!body.confirmRestore) {
      response.status(400).json({ message: "Restore confirmation is required before replacing the current build." });
      return;
    }

    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }
    if (!samePath(body.sourceBuildPath, currentBuild.buildPath)) {
      response.status(409).json({ message: "The current PoB build changed. Refresh before restoring a backup." });
      return;
    }

    const result = await restoreBuildBackup({
      sourceBuildPath: body.sourceBuildPath,
      backupBuildPath: body.backupBuildPath,
      confirmRestore: body.confirmRestore
    });

    const payload: RestoreBuildBackupResponse = {
      ...result,
      message: "Backup restored. A fresh backup of the pre-restore build was created first."
    };
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/temp-equip", async (request, response, next) => {
  try {
    const body = request.body as Partial<TempEquipRequest>;
    if (!body.itemText?.trim() || !body.slotName?.trim()) {
      response.status(400).json({ message: "Item text and slot are required." });
      return;
    }
    const selectedSkill = readSkillSelection(body.selectedSkill);
    const selectedWeaponSet = readWeaponSetSelection(body.selectedWeaponSet);

    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }

    const result = await createTemporaryEquippedBuild({
      sourceBuildPath: currentBuild.buildPath,
      itemText: body.itemText,
      selectedSkill,
      selectedWeaponSet,
      slotName: body.slotName
    });
    const luaBridgeStatus = await getLuaBridgeStatus({
      enabled: appSettings.enableLuaBridge,
      forkPath: appSettings.pobInstallPath,
      runtimeMirrorCheck: "skip"
    });
    const comparisonResult = await recalculateTemporaryBuildComparison({
      sourceBuildPath: result.sourceBuildPath,
      tempBuildPath: result.tempBuildPath,
      beforeStats: currentBuild.stats,
      selectedSkill,
      selectedWeaponSet: result.selectedWeaponSet ?? selectedWeaponSet,
      selectedSkillLabel: currentBuild.selectedSkill?.label ?? null,
      luaBridgeStatus
    });

    const payload: TempEquipResponse = {
      sourceBuildPath: result.sourceBuildPath,
      tempBuildPath: result.tempBuildPath,
      selectedWeaponSet: result.selectedWeaponSet,
      candidateItemId: result.candidateItemId,
      equippedSlot: result.equippedSlot,
      clearedSlots: result.clearedSlots,
      candidate: {
        itemClass: result.candidate.itemClass,
        rarity: result.candidate.rarity,
        name: result.candidate.name,
        baseType: result.candidate.baseType,
        compatibleSlots: result.candidate.compatibleSlots,
        clearsSlots: result.candidate.clearsSlots
      },
      itemComparison: result.itemComparison,
      comparison: comparisonResult.comparison,
      warnings: result.warnings
    };

    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/recalculate-temp-build", async (request, response, next) => {
  try {
    const body = request.body as Partial<RecalculateTempBuildRequest>;
    if (!body.sourceBuildPath?.trim() || !body.tempBuildPath?.trim()) {
      response.status(400).json({ message: "Original build path and temporary build path are required." });
      return;
    }
    const selectedSkill = readSkillSelection(body.selectedSkill);
    const selectedWeaponSet = readWeaponSetSelection(body.selectedWeaponSet);

    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }
    if (!samePath(body.sourceBuildPath, currentBuild.buildPath)) {
      response.status(409).json({ message: "The current PoB build changed. Refresh and create a new temp copy before recalculating." });
      return;
    }

    const luaBridgeStatus = await getLuaBridgeStatus({
      enabled: appSettings.enableLuaBridge,
      forkPath: appSettings.pobInstallPath,
      runtimeMirrorCheck: "skip"
    });
    const payload: RecalculateTempBuildResponse = await recalculateTemporaryBuildComparison({
      sourceBuildPath: body.sourceBuildPath,
      tempBuildPath: body.tempBuildPath,
      beforeStats: currentBuild.stats,
      selectedSkill,
      selectedWeaponSet,
      selectedSkillLabel: currentBuild.selectedSkill?.label ?? null,
      luaBridgeStatus
    });
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/open-temp-build-in-pob", async (request, response, next) => {
  try {
    const body = request.body as Partial<OpenTempBuildInPobRequest>;
    if (!body.sourceBuildPath?.trim() || !body.tempBuildPath?.trim()) {
      response.status(400).json({ message: "Original build path and temporary build path are required." });
      return;
    }

    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }
    if (!samePath(body.sourceBuildPath, currentBuild.buildPath)) {
      response.status(409).json({ message: "The current PoB build changed. Refresh and create a new temp copy before opening it in PoB." });
      return;
    }

    const result = await openTemporaryBuildInPob({
      sourceBuildPath: body.sourceBuildPath,
      tempBuildPath: body.tempBuildPath,
      pobInstallPath: appSettings.pobInstallPath
    });

    const payload: OpenTempBuildInPobResponse = {
      ...result,
      message: "Temporary build opened in PoB preview mode."
    };
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/save-temp-build", async (request, response, next) => {
  try {
    const body = request.body as Partial<SaveTempBuildRequest>;
    if (!body.sourceBuildPath?.trim() || !body.tempBuildPath?.trim()) {
      response.status(400).json({ message: "Original build path and temporary build path are required." });
      return;
    }
    if (!body.confirmOverwrite) {
      response.status(400).json({ message: "Overwrite confirmation is required before saving over the original build." });
      return;
    }

    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }
    if (!samePath(body.sourceBuildPath, currentBuild.buildPath)) {
      response.status(409).json({ message: "The current PoB build changed. Refresh and create a new temp copy before saving." });
      return;
    }

    const result = await saveTemporaryBuild({
      sourceBuildPath: body.sourceBuildPath,
      tempBuildPath: body.tempBuildPath,
      confirmOverwrite: body.confirmOverwrite
    });

    const payload: SaveTempBuildResponse = {
      ...result,
      message: "Original build saved. A backup was created before overwrite."
    };
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post("/api/save-temp-build-as-new", async (request, response, next) => {
  try {
    const body = request.body as Partial<SaveTempBuildAsNewRequest>;
    if (!body.sourceBuildPath?.trim() || !body.tempBuildPath?.trim()) {
      response.status(400).json({ message: "Original build path and temporary build path are required." });
      return;
    }

    const appSettings = await getAppSettings();
    const currentBuild = await getCurrentBuild({ settingsPath: appSettings.pobSettingsPath });
    if (currentBuild.status !== "ready" || !currentBuild.buildPath) {
      response.status(409).json({ message: currentBuild.message || "Current saved build is not ready." });
      return;
    }
    if (!samePath(body.sourceBuildPath, currentBuild.buildPath)) {
      response.status(409).json({ message: "The current PoB build changed. Refresh and create a new temp copy before saving as a new build." });
      return;
    }

    const result = await saveTemporaryBuildAsNew({
      sourceBuildPath: body.sourceBuildPath,
      tempBuildPath: body.tempBuildPath
    });

    const payload: SaveTempBuildAsNewResponse = {
      ...result,
      message: "Candidate build saved as a new build. The original build was not changed."
    };
    response.json(payload);
  } catch (error) {
    next(error);
  }
});

if (existsSync(path.join(webDistPath, "index.html"))) {
  app.use(express.static(webDistPath));
  app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
    response.sendFile(path.join(webDistPath, "index.html"));
  });
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (
    error instanceof TempEquipError ||
    error instanceof SaveBuildError ||
    error instanceof RecalculateTempBuildError ||
    error instanceof OpenTempBuildError ||
    error instanceof SkillSelectionError ||
    error instanceof WeaponSetSelectionError
  ) {
    response.status(error.statusCode).json({ message });
    return;
  }

  const parserStatus = readParserStatus(error);
  response.status(parserStatus ?? 500).json({ message });
});

function readParserStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const status = "status" in error ? error.status : undefined;
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  const candidate = typeof status === "number" ? status : typeof statusCode === "number" ? statusCode : null;
  return candidate && candidate >= 400 && candidate < 500 ? candidate : null;
}

async function readAppVersion(): Promise<string> {
  try {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version.trim() ? packageJson.version : "0.0.0-dev";
  } catch {
    return "0.0.0-dev";
  }
}

function summarizeCharacter(
  character: {
    className: string | null;
    ascendClassName: string | null;
    level: number | null;
  } | null
): string | null {
  if (!character) {
    return null;
  }

  const classParts = [character.ascendClassName, character.className].filter(Boolean);
  const levelPart = character.level ? `level ${character.level}` : null;
  return [...classParts, levelPart].filter(Boolean).join(" ") || null;
}

function readSkillSelection(value: unknown): BuildSkillSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Partial<BuildSkillSelection>;
  const activeSkillSet = Number(record.activeSkillSet);
  const mainSocketGroup = Number(record.mainSocketGroup);
  if (!Number.isInteger(activeSkillSet) || activeSkillSet <= 0 || !Number.isInteger(mainSocketGroup) || mainSocketGroup <= 0) {
    throw new SkillSelectionError("Selected skill must include positive activeSkillSet and mainSocketGroup values.", 400);
  }
  return { activeSkillSet, mainSocketGroup };
}

function readWeaponSetSelection(value: unknown): BuildWeaponSet | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value !== "primary" && value !== "swap") {
    throw new WeaponSetSelectionError("Selected weapon set must be primary or swap.", 400);
  }
  return value;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left).localeCompare(path.resolve(right), undefined, { sensitivity: "accent" }) === 0;
}

app.listen(port, host, () => {
  console.log(`PoB Item Delta server listening on http://${host}:${port}`);
});
