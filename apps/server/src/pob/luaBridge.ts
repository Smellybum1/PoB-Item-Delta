import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { access, copyFile, lstat, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { ImportantStat, LuaBridgeCheck, LuaBridgeStatus, LuaBridgeStatusResponse } from "@pob-item-delta/shared";

const execFileAsync = promisify(execFile);

export const DEFAULT_POB2_INSTALL_PATH = "D:\\Games\\Path of Building Community (PoE2)";
const DEFAULT_POB2_LAUNCHER = "Path of Building-PoE2.exe";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_WRAPPER_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", "tools/pob-lua/HeadlessWrapper.lua");
const MIRROR_DIRECTORIES = ["Classes", "Modules", "Data", "TreeData", "lua", "Assets", "SimpleGraphic"];
const REQUIRED_RUNTIME_DIRECTORIES = ["Classes", "Modules", "Data", "TreeData", "lua"];
const importantLuaStats = new Map<string, string>([
  ["CombinedDPS", "Combined DPS"],
  ["TotalDPS", "Total DPS"],
  ["AverageHit", "Average hit"],
  ["CritChance", "Crit chance"],
  ["Speed", "Cast/attack rate"],
  ["ManaCost", "Mana cost"],
  ["ManaPerSecondCost", "Mana cost/sec"],
  ["ManaRegenRecovery", "Mana regen"],
  ["EnergyShield", "Energy shield"],
  ["Life", "Life"],
  ["FireResist", "Fire resist"],
  ["ColdResist", "Cold resist"],
  ["LightningResist", "Lightning resist"],
  ["ChaosResist", "Chaos resist"],
  ["Str", "Strength"],
  ["Dex", "Dexterity"],
  ["Int", "Intelligence"],
  ["Spirit", "Spirit"],
  ["SpiritUnreserved", "Unreserved spirit"]
]);

interface LuaBridgeStatusOptions {
  env?: NodeJS.ProcessEnv;
  enabled?: boolean;
  forkPath?: string | null;
  command?: string | null;
  wrapperPath?: string | null;
  commandExists?: (command: string) => Promise<boolean>;
  canRead?: (filePath: string) => Promise<boolean>;
  checkRuntimeMirror?: (options: { forkPath: string; wrapperPath: string }) => Promise<LuaBridgeCheck>;
}

interface LuaBridgeClientOptions {
  command: string;
  cwd: string;
  wrapperPath: string;
  timeoutMs: number;
}

export interface LuaBridgeTransport {
  start(): Promise<void>;
  request(action: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
  stop(): Promise<void>;
}

interface CalculateStatsWithLuaBridgeOptions {
  buildXml: string;
  label: string;
  env?: NodeJS.ProcessEnv;
  bridgeStatus?: LuaBridgeStatusResponse;
  transport?: LuaBridgeTransport;
}

interface CalculateStatsPairWithLuaBridgeOptions {
  beforeBuildXml: string;
  beforeLabel: string;
  afterBuildXml: string;
  afterLabel: string;
  env?: NodeJS.ProcessEnv;
  bridgeStatus?: LuaBridgeStatusResponse;
  transport?: LuaBridgeTransport;
}

export interface LuaBridgeStatsResult {
  status: "ready" | "unavailable";
  stats: ImportantStat[];
  bridgeStatus: LuaBridgeStatusResponse;
  message: string;
  warnings: string[];
}

export interface LuaBridgeStatsPairResult {
  before: LuaBridgeStatsResult;
  after: LuaBridgeStatsResult;
}

export async function preparePoBLuaRuntimeMirror(options: { forkPath: string; wrapperPath: string; mirrorPrefix?: string }): Promise<string> {
  const mirrorRoot = await mkdtemp(path.join(os.tmpdir(), options.mirrorPrefix ?? "pob-item-delta-lua-runtime-"));

  try {
    const mirrorWrapperPath = path.join(mirrorRoot, path.basename(options.wrapperPath));
    await copyFile(options.wrapperPath, mirrorWrapperPath);

    const entries = await readdir(options.forkPath, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".lua"))
        .map((entry) => copyFile(path.join(options.forkPath, entry.name), path.join(mirrorRoot, entry.name)))
    );

    await Promise.all(
      MIRROR_DIRECTORIES.map(async (directoryName) => {
        const sourcePath = path.join(options.forkPath, directoryName);
        if (!(await canReadPath(sourcePath))) {
          return;
        }
        await ensureDirectoryJunction(sourcePath, path.join(mirrorRoot, directoryName));
      })
    );

    return mirrorWrapperPath;
  } catch (error) {
    await rm(mirrorRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function checkPoBLuaRuntimeMirrorReadiness(options: { forkPath: string; wrapperPath: string }): Promise<LuaBridgeCheck> {
  let mirrorRoot: string | null = null;

  try {
    const mirrorWrapperPath = await preparePoBLuaRuntimeMirror(options);
    const preparedMirrorRoot = path.dirname(mirrorWrapperPath);
    mirrorRoot = preparedMirrorRoot;
    await access(mirrorWrapperPath, constants.R_OK);

    const missingDirectories = (
      await Promise.all(
        REQUIRED_RUNTIME_DIRECTORIES.map(async (directoryName) => ({
          directoryName,
          readable: await canReadPath(path.join(preparedMirrorRoot, directoryName))
        }))
      )
    )
      .filter((entry) => !entry.readable)
      .map((entry) => entry.directoryName);

    if (missingDirectories.length > 0) {
      return {
        key: "runtimeMirror",
        label: "Runtime mirror",
        ok: false,
        message: `Could not prepare temporary runtime mirror: missing ${missingDirectories.join(", ")}.`
      };
    }

    return {
      key: "runtimeMirror",
      label: "Runtime mirror",
      ok: true,
      message: "Temporary runtime mirror can be prepared with required PoB modules."
    };
  } catch (error) {
    return {
      key: "runtimeMirror",
      label: "Runtime mirror",
      ok: false,
      message: `Could not prepare temporary runtime mirror: ${errorMessage(error)}.`
    };
  } finally {
    if (mirrorRoot) {
      await rm(mirrorRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function getLuaBridgeStatus(options: LuaBridgeStatusOptions = {}): Promise<LuaBridgeStatusResponse> {
  const env = options.env ?? process.env;
  const enabled = options.enabled ?? env.POB_LUA_ENABLED === "true";
  const forkPath = normalizeOptionalPath(options.forkPath) ?? normalizeOptionalPath(env.POB_FORK_PATH) ?? DEFAULT_POB2_INSTALL_PATH;
  const commandOverride = options.command?.trim() || env.POB_CMD?.trim() || null;
  const command = commandOverride ?? path.resolve(forkPath, DEFAULT_POB2_LAUNCHER);
  const wrapperScript = options.wrapperPath?.trim() || env.POB_WRAPPER_PATH?.trim() || env.POB_ARGS?.trim() || DEFAULT_WRAPPER_SCRIPT;
  const wrapperPath = resolveWrapperPath(forkPath, wrapperScript);
  const timeoutMs = readTimeout(env.POB_TIMEOUT_MS);

  if (!enabled) {
    return buildStatus({
      status: "disabled",
      enabled,
      canAttemptStart: false,
      command,
      forkPath,
      wrapperPath,
      timeoutMs,
      checks: [
        {
          key: "enabled",
          label: "Lua bridge setting",
          ok: false,
          message: "Turn on PoB Native Calculation in the app to enable recalculation."
        }
      ]
    });
  }

  const canRead = options.canRead ?? canReadPath;
  const commandExists = options.commandExists ?? defaultCommandExists;
  const checkRuntimeMirror = options.checkRuntimeMirror ?? checkPoBLuaRuntimeMirrorReadiness;
  const [commandOk, forkOk, wrapperOk] = await Promise.all([commandExists(command), canRead(forkPath), canRead(wrapperPath)]);
  const checks: LuaBridgeCheck[] = [
    {
      key: "enabled",
      label: "Lua bridge setting",
      ok: true,
      message: "PoB Native Calculation is enabled."
    },
    {
      key: "command",
      label: "PoB bridge command",
      ok: commandOk,
      message: commandOk ? `Found ${command}.` : `Could not find ${command}. Set POB_CMD to a PoB launcher or compatible Lua executable.`
    },
    {
      key: "forkPath",
      label: "PoB bridge folder",
      ok: forkOk,
      message: forkOk ? `Found ${forkPath}.` : `Could not read ${forkPath}. Set POB_FORK_PATH to a PoB source folder.`
    },
    {
      key: "wrapper",
      label: "Headless wrapper",
      ok: wrapperOk,
      message: wrapperOk ? `Found ${wrapperPath}.` : `Could not find ${wrapperPath}.`
    }
  ];
  const runtimeMirrorCheck =
    forkOk && wrapperOk
      ? await checkRuntimeMirror({ forkPath, wrapperPath })
      : {
          key: "runtimeMirror",
          label: "Runtime mirror",
          ok: false,
          message: "Runtime mirror check skipped until the PoB bridge folder and HeadlessWrapper.lua are readable."
        };
  checks.push(runtimeMirrorCheck);

  let status: LuaBridgeStatus = "configured";
  if (!commandOk) {
    status = "missing-command";
  } else if (!forkOk) {
    status = "missing-fork-path";
  } else if (!wrapperOk) {
    status = "missing-wrapper";
  } else if (!runtimeMirrorCheck.ok) {
    status = "runtime-mirror-failed";
  }

  return buildStatus({
    status,
    enabled,
    canAttemptStart: status === "configured",
    command,
    forkPath,
    wrapperPath,
    timeoutMs,
    checks
  });
}

export async function calculateStatsWithLuaBridge(options: CalculateStatsWithLuaBridgeOptions): Promise<LuaBridgeStatsResult> {
  const bridgeStatus = options.bridgeStatus ?? (await getLuaBridgeStatus(options.env ? { env: options.env } : {}));
  if (!bridgeStatus.canAttemptStart || !bridgeStatus.forkPath || !bridgeStatus.wrapperPath) {
    return unavailableLuaStatsResult(bridgeStatus, bridgeStatus.message, bridgeStatus.setupHints);
  }

  const transport =
    options.transport ??
    new JsonLineLuaBridgeTransport({
      command: bridgeStatus.command,
      cwd: bridgeStatus.forkPath,
      wrapperPath: bridgeStatus.wrapperPath,
      timeoutMs: bridgeStatus.timeoutMs
    });

  try {
    await transport.start();
    return readyLuaStatsResult(bridgeStatus, await readStatsFromStartedTransport(transport, options.buildXml, options.label));
  } catch (error) {
    const message = error instanceof Error ? error.message : "PoB Lua bridge request failed.";
    return unavailableLuaStatsResult(bridgeStatus, message, [`PoB-native recalculation failed: ${message}`]);
  } finally {
    await transport.stop().catch(() => undefined);
  }
}

export async function calculateStatsPairWithLuaBridge(options: CalculateStatsPairWithLuaBridgeOptions): Promise<LuaBridgeStatsPairResult> {
  const bridgeStatus = options.bridgeStatus ?? (await getLuaBridgeStatus(options.env ? { env: options.env } : {}));
  if (!bridgeStatus.canAttemptStart || !bridgeStatus.forkPath || !bridgeStatus.wrapperPath) {
    const unavailable = unavailableLuaStatsResult(bridgeStatus, bridgeStatus.message, bridgeStatus.setupHints);
    return { before: unavailable, after: unavailable };
  }

  const transport =
    options.transport ??
    new JsonLineLuaBridgeTransport({
      command: bridgeStatus.command,
      cwd: bridgeStatus.forkPath,
      wrapperPath: bridgeStatus.wrapperPath,
      timeoutMs: bridgeStatus.timeoutMs
    });

  let before: LuaBridgeStatsResult | null = null;
  try {
    await transport.start();
    before = readyLuaStatsResult(bridgeStatus, await readStatsFromStartedTransport(transport, options.beforeBuildXml, options.beforeLabel));
    const after = readyLuaStatsResult(bridgeStatus, await readStatsFromStartedTransport(transport, options.afterBuildXml, options.afterLabel));
    return { before, after };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PoB Lua bridge request failed.";
    const unavailable = unavailableLuaStatsResult(bridgeStatus, message, [`PoB-native recalculation failed: ${message}`]);
    return { before: before ?? unavailable, after: unavailable };
  } finally {
    await transport.stop().catch(() => undefined);
  }
}

class JsonLineLuaBridgeTransport implements LuaBridgeTransport {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private ready = false;
  private runtimeMirrorRoot: string | null = null;
  private readonly emitter = new EventEmitter();

  constructor(private readonly options: LuaBridgeClientOptions) {
    this.emitter.on("error", () => undefined);
  }

  async start(): Promise<void> {
    if (this.ready) {
      return;
    }

    const wrapperPath = await preparePoBLuaRuntimeMirror({
      forkPath: this.options.cwd,
      wrapperPath: this.options.wrapperPath
    });
    this.runtimeMirrorRoot = path.dirname(wrapperPath);

    this.process = spawn(this.options.command, [wrapperPath], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        POB_API_STDIO: "1",
        POB_FORK_PATH: this.options.cwd,
        POB_WRAPPER_PATH: this.options.wrapperPath
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.emitter.emit("data");
    });
    this.process.stderr.on("data", () => undefined);
    this.process.on("error", (error) => this.emitter.emit("error", error));
    this.process.on("exit", (code, signal) => this.emitter.emit("error", new Error(`PoB Lua bridge exited: code=${code} signal=${signal}`)));

    const banner = await this.readJsonLine();
    if (banner.ready !== true) {
      throw new Error("PoB Lua bridge did not return a ready banner.");
    }
    this.ready = true;
  }

  async request(action: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.process?.stdin || !this.ready) {
      throw new Error("PoB Lua bridge is not ready.");
    }

    this.process.stdin.write(`${JSON.stringify({ action, params })}\n`);
    return this.readJsonLine();
  }

  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      if (this.ready) {
        this.process.stdin.write(`${JSON.stringify({ action: "quit" })}\n`);
      }
      this.process.stdin.end();
    } finally {
      this.process.kill();
      this.process = null;
      this.ready = false;
      this.buffer = "";
      if (this.runtimeMirrorRoot) {
        await rm(this.runtimeMirrorRoot, { recursive: true, force: true }).catch(() => undefined);
        this.runtimeMirrorRoot = null;
      }
    }
  }

  private readJsonLine(): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for PoB Lua bridge response."));
      }, this.options.timeoutMs);

      const tryRead = (): boolean => {
        let newlineIndex = this.buffer.indexOf("\n");
        while (newlineIndex >= 0) {
          const line = this.buffer.slice(0, newlineIndex).trim();
          this.buffer = this.buffer.slice(newlineIndex + 1);
          if (line.startsWith("{")) {
            try {
              const parsed = JSON.parse(line) as Record<string, unknown>;
              cleanup();
              resolve(parsed);
              return true;
            } catch {
              // Keep scanning; PoB can print non-protocol lines while loading.
            }
          }
          newlineIndex = this.buffer.indexOf("\n");
        }
        return false;
      };

      const onData = () => {
        tryRead();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.emitter.off("data", onData);
        this.emitter.off("error", onError);
      };

      if (!tryRead()) {
        this.emitter.on("data", onData);
        this.emitter.on("error", onError);
      }
    });
  }
}

async function defaultCommandExists(command: string): Promise<boolean> {
  if (command.includes("/") || command.includes("\\") || path.isAbsolute(command)) {
    return canReadPath(command);
  }

  try {
    const locator = process.platform === "win32" ? "where.exe" : "which";
    await execFileAsync(locator, [command], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

async function canReadPath(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeOptionalPath(value: string | null | undefined): string | null {
  return value?.trim() ? path.resolve(value) : null;
}

function resolveWrapperPath(forkPath: string, wrapperScript: string): string {
  return path.isAbsolute(wrapperScript) ? path.resolve(wrapperScript) : path.resolve(forkPath, wrapperScript);
}

function readTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function buildStatus(input: Omit<LuaBridgeStatusResponse, "message" | "setupHints">): LuaBridgeStatusResponse {
  return {
    ...input,
    message: statusMessage(input.status),
    setupHints: setupHints(input.status)
  };
}

function statusMessage(status: LuaBridgeStatus): string {
  switch (status) {
    case "configured":
      return "PoB-native calculation bridge prerequisites are configured. The next step is starting the bridge process and requesting live stats.";
    case "missing-command":
      return "PoB-native calculation is enabled, but the configured PoB bridge command cannot be found.";
    case "missing-fork-path":
      return "PoB-native calculation is enabled, but the configured PoB bridge folder cannot be read.";
    case "missing-wrapper":
      return "PoB-native calculation is enabled, but the configured HeadlessWrapper.lua path cannot be read.";
    case "runtime-mirror-failed":
      return "PoB-native calculation is enabled, but the app could not prepare the temporary PoB runtime mirror.";
    case "disabled":
      return "PoB-native calculation bridge is disabled; the app is using XML cached stats.";
  }
  const _exhaustive: never = status;
  return _exhaustive;
}

function setupHints(status: LuaBridgeStatus): string[] {
  if (status === "configured") {
    return ["PoB-native recalculation can be attempted. The app will launch the bridge in a temporary runtime mirror."];
  }

  if (status === "runtime-mirror-failed") {
    return [
      "Keep using XML cached stats until the bridge is configured.",
      "Check that the PoB install folder points to the full Path of Building Community (PoE2) install folder, not the Builds folder.",
      "The PoB install folder should contain Classes, Modules, Data, TreeData, lua, and Path of Building-PoE2.exe."
    ];
  }

  return [
    "Keep using XML cached stats until the bridge is configured.",
    "Turn on PoB Native Calculation in the app when you want live PoB recalculation.",
    "Use the setup fields to choose the PoB2 install folder and PoB Settings.xml path.",
    "Advanced users can still use POB_FORK_PATH, POB_CMD, and POB_WRAPPER_PATH as startup defaults."
  ];
}

function readImportantStats(value: unknown): ImportantStat[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;
  return [...importantLuaStats.entries()].flatMap(([key, label]) => {
    const statValue = normalizeStatValue(record[key]);
    return statValue === null ? [] : [{ key, label, value: statValue }];
  });
}

function normalizeStatValue(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function assertOk(response: Record<string, unknown>, action: string): void {
  if (response.ok === false) {
    throw new Error(typeof response.error === "string" ? response.error : `${action} failed.`);
  }
}

async function readStatsFromStartedTransport(transport: LuaBridgeTransport, buildXml: string, label: string): Promise<ImportantStat[]> {
  await assertOk(await transport.request("load_build_xml", { xml: buildXml, name: label }), "load_build_xml");
  const statsResponse = await transport.request("get_stats", { fields: [...importantLuaStats.keys()] });
  await assertOk(statsResponse, "get_stats");
  return readImportantStats(statsResponse.stats);
}

function readyLuaStatsResult(bridgeStatus: LuaBridgeStatusResponse, stats: ImportantStat[]): LuaBridgeStatsResult {
  return {
    status: "ready",
    stats,
    bridgeStatus,
    message: "PoB-native stats were recalculated through the Lua bridge.",
    warnings: []
  };
}

function unavailableLuaStatsResult(bridgeStatus: LuaBridgeStatusResponse, message: string, warnings: string[]): LuaBridgeStatsResult {
  return {
    status: "unavailable",
    stats: [],
    bridgeStatus,
    message,
    warnings
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

async function ensureDirectoryJunction(sourcePath: string, linkPath: string): Promise<void> {
  try {
    await lstat(linkPath);
    return;
  } catch {
    // Create the link below.
  }

  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(sourcePath, linkPath, process.platform === "win32" ? "junction" : "dir");
}
