import { spawn, type ChildProcess } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_POB2_INSTALL_PATH, preparePoBLuaRuntimeMirror } from "./luaBridge.js";

const DEFAULT_POB2_LAUNCHER = "Path of Building-PoE2.exe";
const DEFAULT_OPEN_WRAPPER_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", "tools/pob-lua/OpenBuildWrapper.lua");
const OPEN_RUNTIME_PREFIX = "pob-item-delta-open-runtime-";
const staleOpenRuntimeMs = 7 * 24 * 60 * 60 * 1000;

export interface OpenTemporaryBuildInPobOptions {
  sourceBuildPath: string;
  tempBuildPath: string;
  pobInstallPath?: string | null;
  command?: string | null;
  wrapperPath?: string | null;
  tempRoot?: string;
  env?: NodeJS.ProcessEnv;
  now?: number;
  canRead?: (filePath: string) => Promise<boolean>;
  prepareRuntimeMirror?: (options: { forkPath: string; wrapperPath: string; mirrorPrefix: string }) => Promise<string>;
  spawnProcess?: (command: string, args: string[], options: OpenPobSpawnOptions) => OpenPobChildProcess;
  cleanupStaleMirrors?: (options?: { now?: number }) => Promise<string[]>;
}

export interface OpenTemporaryBuildInPobResult {
  sourceBuildPath: string;
  tempBuildPath: string;
  pobCommand: string;
  processId: number | null;
  openedAt: string;
  warnings: string[];
}

interface OpenPobSpawnOptions {
  cwd: string;
  detached: boolean;
  env: NodeJS.ProcessEnv;
  stdio: "ignore";
  windowsHide: boolean;
}

interface OpenPobChildProcess {
  pid?: number;
  unref(): void;
  on(event: "error", listener: (error: Error) => void): OpenPobChildProcess;
}

export class OpenTempBuildError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "OpenTempBuildError";
  }
}

export async function openTemporaryBuildInPob(options: OpenTemporaryBuildInPobOptions): Promise<OpenTemporaryBuildInPobResult> {
  const sourceBuildPath = path.resolve(options.sourceBuildPath);
  const tempBuildPath = path.resolve(options.tempBuildPath);
  const tempRoot = path.resolve(options.tempRoot ?? path.join(os.tmpdir(), "pob-item-delta"));
  const forkPath = path.resolve(options.pobInstallPath?.trim() || DEFAULT_POB2_INSTALL_PATH);
  const command = path.resolve(options.command?.trim() || path.join(forkPath, DEFAULT_POB2_LAUNCHER));
  const wrapperPath = path.resolve(options.wrapperPath?.trim() || DEFAULT_OPEN_WRAPPER_SCRIPT);
  const canRead = options.canRead ?? canReadPath;

  if (samePath(sourceBuildPath, tempBuildPath)) {
    throw new OpenTempBuildError("Temporary build path must be different from the original build path.", 400);
  }
  if (!isPathInside(tempBuildPath, tempRoot)) {
    throw new OpenTempBuildError("Temporary build path is outside the app temp folder.", 400);
  }
  if (!(await canRead(sourceBuildPath))) {
    throw new OpenTempBuildError("Original build file could not be read.", 404);
  }
  if (!(await canRead(tempBuildPath))) {
    throw new OpenTempBuildError("Temporary build file could not be read.", 404);
  }
  if (!(await canRead(forkPath))) {
    throw new OpenTempBuildError("PoB install folder could not be read.", 400);
  }
  if (!(await canRead(command))) {
    throw new OpenTempBuildError("PoB launcher could not be found.", 400);
  }
  if (!(await canRead(wrapperPath))) {
    throw new OpenTempBuildError("Open-in-PoB wrapper could not be read.", 500);
  }

  await readFile(tempBuildPath);
  const cleanupOptions = options.now === undefined ? {} : { now: options.now };
  await (options.cleanupStaleMirrors ?? cleanupStaleOpenRuntimeMirrors)(cleanupOptions);

  const mirrorWrapperPath = await (options.prepareRuntimeMirror ?? preparePoBLuaRuntimeMirror)({
    forkPath,
    wrapperPath,
    mirrorPrefix: OPEN_RUNTIME_PREFIX
  });
  const buildName = path.basename(tempBuildPath, path.extname(tempBuildPath));
  const child = (options.spawnProcess ?? defaultSpawnProcess)(command, [mirrorWrapperPath], {
    cwd: forkPath,
    detached: true,
    env: {
      ...process.env,
      ...options.env,
      POB_ITEM_DELTA_OPEN_BUILD_PATH: tempBuildPath,
      POB_ITEM_DELTA_OPEN_BUILD_NAME: buildName,
      POB_ITEM_DELTA_DISABLE_SETTINGS_SAVE: "1"
    },
    stdio: "ignore",
    windowsHide: false
  });
  child.on("error", () => undefined);
  child.unref();

  return {
    sourceBuildPath,
    tempBuildPath,
    pobCommand: command,
    processId: typeof child.pid === "number" ? child.pid : null,
    openedAt: new Date(options.now ?? Date.now()).toISOString(),
    warnings: [
      "PoB was opened with a temporary preview build and should not write that preview path to Settings.xml.",
      "If you save inside this PoB preview window, it writes to the temporary build copy."
    ]
  };
}

export async function cleanupStaleOpenRuntimeMirrors(options: { now?: number } = {}): Promise<string[]> {
  const now = options.now ?? Date.now();
  const tempRoot = os.tmpdir();
  const removed: string[] = [];

  let entries;
  try {
    entries = await readdir(tempRoot, { withFileTypes: true });
  } catch {
    return removed;
  }

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(OPEN_RUNTIME_PREFIX))
      .map(async (entry) => {
        const mirrorPath = path.join(tempRoot, entry.name);
        try {
          const details = await stat(mirrorPath);
          if (now - details.mtimeMs < staleOpenRuntimeMs) {
            return;
          }
          await rm(mirrorPath, { recursive: true, force: true });
          removed.push(mirrorPath);
        } catch {
          // Best-effort cleanup only; opening PoB should not fail because cleanup did.
        }
      })
  );

  return removed;
}

function defaultSpawnProcess(command: string, args: string[], options: OpenPobSpawnOptions): OpenPobChildProcess {
  return spawn(command, args, options) as ChildProcess & OpenPobChildProcess;
}

async function canReadPath(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}
