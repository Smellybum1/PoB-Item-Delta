import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { BuildBackupSummary } from "@pob-item-delta/shared";

export interface SaveTemporaryBuildOptions {
  sourceBuildPath: string;
  tempBuildPath: string;
  confirmOverwrite: boolean;
  tempRoot?: string;
}

export interface SaveTemporaryBuildResult {
  sourceBuildPath: string;
  tempBuildPath: string;
  backupBuildPath: string;
  savedAt: string;
  bytesWritten: number;
  tempDeleted: boolean;
  warnings: string[];
}

export interface SaveTemporaryBuildAsNewOptions {
  sourceBuildPath: string;
  tempBuildPath: string;
  tempRoot?: string;
}

export interface SaveTemporaryBuildAsNewResult {
  sourceBuildPath: string;
  tempBuildPath: string;
  newBuildPath: string;
  savedAt: string;
  bytesWritten: number;
  warnings: string[];
}

export interface ListBuildBackupsOptions {
  sourceBuildPath: string;
}

export interface ListBuildBackupsResult {
  sourceBuildPath: string;
  backups: BuildBackupSummary[];
  warnings: string[];
}

export interface RestoreBuildBackupOptions {
  sourceBuildPath: string;
  backupBuildPath: string;
  confirmRestore: boolean;
}

export interface RestoreBuildBackupResult {
  sourceBuildPath: string;
  backupBuildPath: string;
  preRestoreBackupBuildPath: string;
  restoredAt: string;
  bytesWritten: number;
  warnings: string[];
}

export class SaveBuildError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "SaveBuildError";
  }
}

export async function saveTemporaryBuild(options: SaveTemporaryBuildOptions): Promise<SaveTemporaryBuildResult> {
  if (!options.confirmOverwrite) {
    throw new SaveBuildError("Overwrite confirmation is required before saving over the original build.", 400);
  }

  const sourceBuildPath = path.resolve(options.sourceBuildPath);
  const tempBuildPath = path.resolve(options.tempBuildPath);
  const tempRoot = path.resolve(options.tempRoot ?? path.join(os.tmpdir(), "pob-item-delta"));

  if (samePath(sourceBuildPath, tempBuildPath)) {
    throw new SaveBuildError("Temporary build path must be different from the original build path.", 400);
  }
  if (!isPathInside(tempBuildPath, tempRoot)) {
    throw new SaveBuildError("Temporary build path is outside the app temp folder.", 400);
  }

  const [sourceBytes, tempBytes] = await Promise.all([
    readRequiredFile(sourceBuildPath, "Original build file could not be read."),
    readRequiredFile(tempBuildPath, "Temporary build file could not be read.")
  ]);

  const backupBuildPath = await writeBackup(sourceBuildPath, sourceBytes);
  await writeFile(sourceBuildPath, tempBytes);

  const warnings: string[] = [];
  let tempDeleted = false;
  try {
    await unlink(tempBuildPath);
    tempDeleted = true;
  } catch {
    warnings.push("Saved the build, but the temporary build copy could not be deleted.");
  }

  return {
    sourceBuildPath,
    tempBuildPath,
    backupBuildPath,
    savedAt: new Date().toISOString(),
    bytesWritten: tempBytes.byteLength,
    tempDeleted,
    warnings
  };
}

export async function saveTemporaryBuildAsNew(options: SaveTemporaryBuildAsNewOptions): Promise<SaveTemporaryBuildAsNewResult> {
  const sourceBuildPath = path.resolve(options.sourceBuildPath);
  const tempBuildPath = path.resolve(options.tempBuildPath);
  const tempRoot = path.resolve(options.tempRoot ?? path.join(os.tmpdir(), "pob-item-delta"));

  if (samePath(sourceBuildPath, tempBuildPath)) {
    throw new SaveBuildError("Temporary build path must be different from the original build path.", 400);
  }
  if (!isPathInside(tempBuildPath, tempRoot)) {
    throw new SaveBuildError("Temporary build path is outside the app temp folder.", 400);
  }

  await readRequiredFile(sourceBuildPath, "Original build file could not be read.");
  const tempBytes = await readRequiredFile(tempBuildPath, "Temporary build file could not be read.");
  const newBuildPath = await writeNewBuild(sourceBuildPath, tempBytes);

  return {
    sourceBuildPath,
    tempBuildPath,
    newBuildPath,
    savedAt: new Date().toISOString(),
    bytesWritten: tempBytes.byteLength,
    warnings: []
  };
}

export async function listBuildBackups(options: ListBuildBackupsOptions): Promise<ListBuildBackupsResult> {
  const sourceBuildPath = path.resolve(options.sourceBuildPath);
  const parsed = path.parse(sourceBuildPath);

  await readRequiredFile(sourceBuildPath, "Original build file could not be read.");

  const entries = await readdir(parsed.dir, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && isBackupFileNameForSource(entry.name, sourceBuildPath))
      .map(async (entry): Promise<BuildBackupSummary> => {
        const backupBuildPath = path.join(parsed.dir, entry.name);
        const details = await stat(backupBuildPath);
        return {
          backupBuildPath,
          fileName: entry.name,
          createdAt: readBackupCreatedAt(entry.name, sourceBuildPath),
          lastModified: details.mtime.toISOString(),
          sizeBytes: details.size
        };
      })
  );

  backups.sort((left, right) => {
    const leftDate = left.createdAt ?? left.lastModified;
    const rightDate = right.createdAt ?? right.lastModified;
    return rightDate.localeCompare(leftDate);
  });

  return {
    sourceBuildPath,
    backups,
    warnings: []
  };
}

export async function restoreBuildBackup(options: RestoreBuildBackupOptions): Promise<RestoreBuildBackupResult> {
  if (!options.confirmRestore) {
    throw new SaveBuildError("Restore confirmation is required before replacing the current build.", 400);
  }

  const sourceBuildPath = path.resolve(options.sourceBuildPath);
  const backupBuildPath = path.resolve(options.backupBuildPath);

  if (!isBackupPathForSource(backupBuildPath, sourceBuildPath)) {
    throw new SaveBuildError("Backup path does not match the current build backup pattern.", 400);
  }

  const [sourceBytes, backupBytes] = await Promise.all([
    readRequiredFile(sourceBuildPath, "Original build file could not be read."),
    readRequiredFile(backupBuildPath, "Backup build file could not be read.")
  ]);

  const preRestoreBackupBuildPath = await writeBackup(sourceBuildPath, sourceBytes);
  await writeFile(sourceBuildPath, backupBytes);

  return {
    sourceBuildPath,
    backupBuildPath,
    preRestoreBackupBuildPath,
    restoredAt: new Date().toISOString(),
    bytesWritten: backupBytes.byteLength,
    warnings: []
  };
}

async function readRequiredFile(filePath: string, message: string): Promise<Buffer> {
  try {
    return await readFile(filePath);
  } catch {
    throw new SaveBuildError(message, 404);
  }
}

async function writeNewBuild(sourceBuildPath: string, tempBytes: Buffer): Promise<string> {
  const parsed = path.parse(sourceBuildPath);
  await mkdir(parsed.dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ext = parsed.ext || ".xml";
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const newBuildPath = path.join(parsed.dir, `${parsed.name} - Candidate ${stamp}${suffix}${ext}`);
    try {
      await writeFile(newBuildPath, tempBytes, { flag: "wx" });
      return newBuildPath;
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
    }
  }

  throw new SaveBuildError("Could not create a unique new build file.", 500);
}

async function writeBackup(sourceBuildPath: string, sourceBytes: Buffer): Promise<string> {
  const parsed = path.parse(sourceBuildPath);
  await mkdir(parsed.dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ext = parsed.ext || ".xml";
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? "" : `-${index}`;
    const backupBuildPath = path.join(parsed.dir, `${parsed.name}.backup-${stamp}${suffix}${ext}`);
    try {
      await writeFile(backupBuildPath, sourceBytes, { flag: "wx" });
      return backupBuildPath;
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
    }
  }

  throw new SaveBuildError("Could not create a unique backup file.", 500);
}

function isBackupPathForSource(backupBuildPath: string, sourceBuildPath: string): boolean {
  const parsed = path.parse(sourceBuildPath);
  return samePath(path.dirname(backupBuildPath), parsed.dir) && isBackupFileNameForSource(path.basename(backupBuildPath), sourceBuildPath);
}

function isBackupFileNameForSource(fileName: string, sourceBuildPath: string): boolean {
  const parsed = path.parse(sourceBuildPath);
  const ext = parsed.ext || ".xml";
  const prefix = `${parsed.name}.backup-`;
  if (!fileName.startsWith(prefix) || !fileName.endsWith(ext)) {
    return false;
  }

  const stamp = fileName.slice(prefix.length, fileName.length - ext.length);
  return /^\d{14}(?:-\d+)?$/.test(stamp);
}

function readBackupCreatedAt(fileName: string, sourceBuildPath: string): string | null {
  const parsed = path.parse(sourceBuildPath);
  const ext = parsed.ext || ".xml";
  const prefix = `${parsed.name}.backup-`;
  const [stampCandidate] = fileName.slice(prefix.length, fileName.length - ext.length).split("-");
  if (!stampCandidate || !/^\d{14}$/.test(stampCandidate)) {
    return null;
  }

  const stamp = stampCandidate;
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6)) - 1;
  const day = Number(stamp.slice(6, 8));
  const hour = Number(stamp.slice(8, 10));
  const minute = Number(stamp.slice(10, 12));
  const second = Number(stamp.slice(12, 14));
  return new Date(Date.UTC(year, month, day, hour, minute, second)).toISOString();
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function samePath(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
