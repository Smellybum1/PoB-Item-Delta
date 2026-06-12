import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listBuildBackups, restoreBuildBackup, saveTemporaryBuild, saveTemporaryBuildAsNew } from "../pob/saveBuild.js";

describe("saveTemporaryBuild", () => {
  it("refuses to overwrite without explicit confirmation", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const tempRoot = path.join(root, "temp");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(tempRoot, "Build.candidate.xml");
    await mkdir(tempRoot, { recursive: true });
    await writeFile(sourceBuildPath, "original");
    await writeFile(tempBuildPath, "candidate", "utf8");

    await expect(
      saveTemporaryBuild({
        sourceBuildPath,
        tempBuildPath,
        confirmOverwrite: false,
        tempRoot
      })
    ).rejects.toThrow("confirmation is required");
    expect(await readFile(sourceBuildPath, "utf8")).toBe("original");
  });

  it("backs up the original, overwrites it with the temp build, and deletes the temp copy", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const tempRoot = path.join(root, "temp");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(tempRoot, "Build.candidate.xml");
    await mkdir(tempRoot, { recursive: true });
    await writeFile(sourceBuildPath, "original");
    await writeFile(tempBuildPath, "candidate", "utf8");

    const result = await saveTemporaryBuild({
      sourceBuildPath,
      tempBuildPath,
      confirmOverwrite: true,
      tempRoot
    });

    expect(result.sourceBuildPath).toBe(path.resolve(sourceBuildPath));
    expect(result.tempBuildPath).toBe(path.resolve(tempBuildPath));
    expect(result.backupBuildPath).toContain(".backup-");
    expect(result.bytesWritten).toBe(Buffer.byteLength("candidate"));
    expect(result.tempDeleted).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(await readFile(sourceBuildPath, "utf8")).toBe("candidate");
    expect(await readFile(result.backupBuildPath, "utf8")).toBe("original");
    await expect(access(tempBuildPath)).rejects.toThrow();
  });

  it("refuses temp files outside the app temp folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const tempRoot = path.join(root, "temp");
    const outsideRoot = path.join(root, "outside");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(outsideRoot, "Build.candidate.xml");
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(sourceBuildPath, "original");
    await writeFile(tempBuildPath, "candidate", "utf8");

    await expect(
      saveTemporaryBuild({
        sourceBuildPath,
        tempBuildPath,
        confirmOverwrite: true,
        tempRoot
      })
    ).rejects.toThrow("outside the app temp folder");
    expect(await readFile(sourceBuildPath, "utf8")).toBe("original");
  });

  it("saves the temp build as a new sibling build without changing source or temp files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const tempRoot = path.join(root, "temp");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(tempRoot, "Build.candidate.xml");
    await mkdir(tempRoot, { recursive: true });
    await writeFile(sourceBuildPath, "original");
    await writeFile(tempBuildPath, "candidate", "utf8");

    const result = await saveTemporaryBuildAsNew({
      sourceBuildPath,
      tempBuildPath,
      tempRoot
    });

    expect(result.sourceBuildPath).toBe(path.resolve(sourceBuildPath));
    expect(result.tempBuildPath).toBe(path.resolve(tempBuildPath));
    expect(result.newBuildPath).toMatch(/Build - Candidate \d{14}\.xml$/);
    expect(result.bytesWritten).toBe(Buffer.byteLength("candidate"));
    expect(result.warnings).toEqual([]);
    expect(await readFile(sourceBuildPath, "utf8")).toBe("original");
    expect(await readFile(tempBuildPath, "utf8")).toBe("candidate");
    expect(await readFile(result.newBuildPath, "utf8")).toBe("candidate");
  });

  it("refuses to save a new build from temp files outside the app temp folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const tempRoot = path.join(root, "temp");
    const outsideRoot = path.join(root, "outside");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(outsideRoot, "Build.candidate.xml");
    await mkdir(outsideRoot, { recursive: true });
    await writeFile(sourceBuildPath, "original");
    await writeFile(tempBuildPath, "candidate", "utf8");

    await expect(
      saveTemporaryBuildAsNew({
        sourceBuildPath,
        tempBuildPath,
        tempRoot
      })
    ).rejects.toThrow("outside the app temp folder");
    expect(await readFile(sourceBuildPath, "utf8")).toBe("original");
  });

  it("lists matching backups for the source build newest first", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const sourceBuildPath = path.join(root, "Build.xml");
    await writeFile(sourceBuildPath, "current", "utf8");
    await writeFile(path.join(root, "Build.backup-20250102030405.xml"), "older", "utf8");
    await writeFile(path.join(root, "Build.backup-20260102030405.xml"), "newer", "utf8");
    await writeFile(path.join(root, "Build.backup-nope.xml"), "invalid", "utf8");
    await writeFile(path.join(root, "Other.backup-20270102030405.xml"), "wrong source", "utf8");

    const result = await listBuildBackups({ sourceBuildPath });

    expect(result.sourceBuildPath).toBe(path.resolve(sourceBuildPath));
    expect(result.backups.map((backup) => backup.fileName)).toEqual([
      "Build.backup-20260102030405.xml",
      "Build.backup-20250102030405.xml"
    ]);
    const [newestBackup] = result.backups;
    expect(newestBackup?.createdAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("restores a matching backup after creating a pre-restore backup", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const sourceBuildPath = path.join(root, "Build.xml");
    const backupBuildPath = path.join(root, "Build.backup-20260102030405.xml");
    await writeFile(sourceBuildPath, "current", "utf8");
    await writeFile(backupBuildPath, "previous", "utf8");

    const result = await restoreBuildBackup({
      sourceBuildPath,
      backupBuildPath,
      confirmRestore: true
    });

    expect(result.sourceBuildPath).toBe(path.resolve(sourceBuildPath));
    expect(result.backupBuildPath).toBe(path.resolve(backupBuildPath));
    expect(result.preRestoreBackupBuildPath).toContain(".backup-");
    expect(result.bytesWritten).toBe(Buffer.byteLength("previous"));
    expect(result.warnings).toEqual([]);
    expect(await readFile(sourceBuildPath, "utf8")).toBe("previous");
    expect(await readFile(result.preRestoreBackupBuildPath, "utf8")).toBe("current");
    expect(await readFile(backupBuildPath, "utf8")).toBe("previous");
  });

  it("refuses to restore without confirmation or from an unrelated backup path", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-save-"));
    const sourceBuildPath = path.join(root, "Build.xml");
    const unrelatedBackupPath = path.join(root, "Other.backup-20260102030405.xml");
    await writeFile(sourceBuildPath, "current", "utf8");
    await writeFile(unrelatedBackupPath, "unrelated", "utf8");

    await expect(
      restoreBuildBackup({
        sourceBuildPath,
        backupBuildPath: unrelatedBackupPath,
        confirmRestore: false
      })
    ).rejects.toThrow("confirmation is required");
    await expect(
      restoreBuildBackup({
        sourceBuildPath,
        backupBuildPath: unrelatedBackupPath,
        confirmRestore: true
      })
    ).rejects.toThrow("does not match");
    expect(await readFile(sourceBuildPath, "utf8")).toBe("current");
  });
});
