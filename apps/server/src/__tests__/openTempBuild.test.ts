import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cleanupStaleOpenRuntimeMirrors, openTemporaryBuildInPob } from "../pob/openTempBuild.js";

describe("openTemporaryBuildInPob", () => {
  it("launches PoB with the temporary build through the open wrapper mirror", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-open-"));
    const pobInstallPath = path.join(root, "pob");
    const tempRoot = path.join(root, "temp");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(tempRoot, "Build.candidate.xml");
    const command = path.join(pobInstallPath, "Path of Building-PoE2.exe");
    const wrapperPath = path.join(root, "OpenBuildWrapper.lua");
    const mirrorWrapperPath = path.join(root, "mirror", "OpenBuildWrapper.lua");
    await mkdir(pobInstallPath, { recursive: true });
    await mkdir(tempRoot, { recursive: true });
    await mkdir(path.dirname(mirrorWrapperPath), { recursive: true });
    await writeFile(sourceBuildPath, "original", "utf8");
    await writeFile(tempBuildPath, "candidate", "utf8");
    await writeFile(command, "", "utf8");
    await writeFile(wrapperPath, "#@ SimpleGraphic\n", "utf8");
    await writeFile(mirrorWrapperPath, "#@ SimpleGraphic\n", "utf8");

    const spawnCalls: Array<{ command: string; args: string[]; options: { cwd: string; env: NodeJS.ProcessEnv; detached: boolean } }> = [];
    const result = await openTemporaryBuildInPob({
      sourceBuildPath,
      tempBuildPath,
      pobInstallPath,
      command,
      wrapperPath,
      tempRoot,
      now: Date.UTC(2026, 0, 2, 3, 4, 5),
      cleanupStaleMirrors: async () => [],
      prepareRuntimeMirror: async (options) => {
        expect(options.forkPath).toBe(path.resolve(pobInstallPath));
        expect(options.wrapperPath).toBe(path.resolve(wrapperPath));
        expect(options.mirrorPrefix).toBe("pob-item-delta-open-runtime-");
        return mirrorWrapperPath;
      },
      spawnProcess: (spawnCommand, args, options) => {
        spawnCalls.push({ command: spawnCommand, args, options });
        return {
          pid: 1234,
          unref: () => undefined,
          on: () => undefined as never
        };
      }
    });

    expect(result.processId).toBe(1234);
    expect(result.openedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(result.warnings.join(" ")).toContain("Settings.xml");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.command).toBe(path.resolve(command));
    expect(spawnCalls[0]?.args).toEqual([mirrorWrapperPath]);
    expect(spawnCalls[0]?.options.cwd).toBe(path.resolve(pobInstallPath));
    expect(spawnCalls[0]?.options.detached).toBe(true);
    expect(spawnCalls[0]?.options.env.POB_ITEM_DELTA_OPEN_BUILD_PATH).toBe(path.resolve(tempBuildPath));
    expect(spawnCalls[0]?.options.env.POB_ITEM_DELTA_OPEN_BUILD_NAME).toBe("Build.candidate");
    expect(spawnCalls[0]?.options.env.POB_ITEM_DELTA_DISABLE_SETTINGS_SAVE).toBe("1");
  });

  it("refuses temp builds outside the app temp folder", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-open-"));
    const tempRoot = path.join(root, "temp");
    const outsideRoot = path.join(root, "outside");
    const pobInstallPath = path.join(root, "pob");
    const sourceBuildPath = path.join(root, "Build.xml");
    const tempBuildPath = path.join(outsideRoot, "Build.candidate.xml");
    await mkdir(tempRoot, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });
    await mkdir(pobInstallPath, { recursive: true });
    await writeFile(sourceBuildPath, "original", "utf8");
    await writeFile(tempBuildPath, "candidate", "utf8");

    await expect(
      openTemporaryBuildInPob({
        sourceBuildPath,
        tempBuildPath,
        pobInstallPath,
        tempRoot,
        canRead: async () => true,
        cleanupStaleMirrors: async () => {
          throw new Error("cleanup should not run");
        }
      })
    ).rejects.toThrow("outside the app temp folder");
  });
});

describe("cleanupStaleOpenRuntimeMirrors", () => {
  it("removes stale open-runtime mirrors and leaves fresh mirrors alone", async () => {
    const freshMirror = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-open-runtime-"));
    const staleMirror = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-open-runtime-"));
    const now = Date.UTC(2026, 0, 10);
    await writeFile(path.join(freshMirror, "marker"), "", "utf8");
    await writeFile(path.join(staleMirror, "marker"), "", "utf8");
    const staleDate = new Date(now - 8 * 24 * 60 * 60 * 1000);
    await import("node:fs/promises").then(({ utimes }) => utimes(staleMirror, staleDate, staleDate));

    const removed = await cleanupStaleOpenRuntimeMirrors({ now });

    expect(removed).toContain(staleMirror);
    expect(removed).not.toContain(freshMirror);
  });
});
