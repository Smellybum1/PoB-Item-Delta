import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { LuaBridgeCheck, LuaBridgeStatusResponse } from "@pob-item-delta/shared";

import {
  calculateStatsPairWithLuaBridge,
  calculateStatsWithLuaBridge,
  checkPoBLuaRuntimeMirrorReadiness,
  getLuaBridgeStatus,
  preparePoBLuaRuntimeMirror,
  ReusableLuaBridgeRunner,
  type LuaBridgeClientOptions,
  type LuaBridgeTransport
} from "../pob/luaBridge.js";

describe("getLuaBridgeStatus", () => {
  it("reports disabled by default without checking external files", async () => {
    const status = await getLuaBridgeStatus({
      env: {},
      commandExists: async () => {
        throw new Error("should not check command when disabled");
      }
    });

    expect(status.status).toBe("disabled");
    expect(status.canAttemptStart).toBe(false);
    expect(status.message).toContain("disabled");
  });

  it("reports missing wrapper when the configured wrapper path does not exist", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-"));
    const wrapperPath = path.join(root, "MissingWrapper.lua");
    const status = await getLuaBridgeStatus({
      env: {
        POB_LUA_ENABLED: "true",
        POB_CMD: process.execPath,
        POB_FORK_PATH: root,
        POB_WRAPPER_PATH: wrapperPath
      },
      commandExists: async () => true
    });

    expect(status.status).toBe("missing-wrapper");
    expect(status.enabled).toBe(true);
    expect(status.canAttemptStart).toBe(false);
    expect(status.wrapperPath).toBe(wrapperPath);
    expect(status.checks.find((check) => check.key === "wrapper")?.ok).toBe(false);
  });

  it("can be enabled by the app setting without the legacy env flag", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-"));
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "HeadlessWrapper.lua"), "-- bridge fixture", "utf8");

    const status = await getLuaBridgeStatus({
      enabled: true,
      env: {
        POB_CMD: process.execPath,
        POB_FORK_PATH: root
      },
      commandExists: async () => true,
      checkRuntimeMirror: readyRuntimeMirrorCheck
    });

    expect(status.status).toBe("configured");
    expect(status.enabled).toBe(true);
    expect(status.checks.find((check) => check.key === "enabled")?.message).toBe("PoB Native Calculation is enabled.");
  });

  it("can be disabled by the app setting even when the legacy env flag is set", async () => {
    const status = await getLuaBridgeStatus({
      enabled: false,
      env: {
        POB_LUA_ENABLED: "true"
      },
      commandExists: async () => {
        throw new Error("should not check command when disabled");
      }
    });

    expect(status.status).toBe("disabled");
    expect(status.enabled).toBe(false);
    expect(status.canAttemptStart).toBe(false);
  });

  it("reports configured when command, fork path, and wrapper are present", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-"));
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "HeadlessWrapper.lua"), "-- bridge fixture", "utf8");

    const status = await getLuaBridgeStatus({
      env: {
        POB_LUA_ENABLED: "true",
        POB_CMD: process.execPath,
        POB_FORK_PATH: root,
        POB_TIMEOUT_MS: "12345"
      },
      commandExists: async () => true,
      checkRuntimeMirror: readyRuntimeMirrorCheck
    });

    expect(status.status).toBe("configured");
    expect(status.canAttemptStart).toBe(true);
    expect(status.timeoutMs).toBe(12345);
    expect(status.checks.every((check) => check.ok)).toBe(true);
  });

  it("reports a runtime mirror failure when the mirror cannot be prepared", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-"));
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "HeadlessWrapper.lua"), "-- bridge fixture", "utf8");

    const status = await getLuaBridgeStatus({
      env: {
        POB_LUA_ENABLED: "true",
        POB_CMD: process.execPath,
        POB_FORK_PATH: root
      },
      commandExists: async () => true,
      checkRuntimeMirror: async () => ({
        key: "runtimeMirror",
        label: "Runtime mirror",
        ok: false,
        message: "Could not prepare temporary runtime mirror: missing Modules."
      })
    });

    expect(status.status).toBe("runtime-mirror-failed");
    expect(status.canAttemptStart).toBe(false);
    expect(status.checks.find((check) => check.key === "runtimeMirror")?.ok).toBe(false);
    expect(status.setupHints.join(" ")).toContain("full Path of Building Community");
  });

  it("can skip the runtime mirror preflight for hot calculation paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-"));
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "HeadlessWrapper.lua"), "-- bridge fixture", "utf8");

    const status = await getLuaBridgeStatus({
      enabled: true,
      env: {
        POB_CMD: process.execPath,
        POB_FORK_PATH: root
      },
      commandExists: async () => true,
      runtimeMirrorCheck: "skip",
      checkRuntimeMirror: async () => {
        throw new Error("runtime mirror preflight should be skipped");
      }
    });

    expect(status.status).toBe("configured");
    expect(status.canAttemptStart).toBe(true);
    expect(status.checks.find((check) => check.key === "runtimeMirror")?.message).toContain("when the bridge starts");
  });

  it("supports a wrapper script outside the PoB fork path", async () => {
    const forkRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-fork-"));
    const wrapperRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-wrapper-"));
    const wrapperPath = path.join(wrapperRoot, "HeadlessWrapper.lua");
    await writeFile(wrapperPath, "-- bridge fixture", "utf8");

    const status = await getLuaBridgeStatus({
      env: {
        POB_LUA_ENABLED: "true",
        POB_CMD: process.execPath,
        POB_FORK_PATH: forkRoot,
        POB_WRAPPER_PATH: wrapperPath
      },
      commandExists: async () => true,
      checkRuntimeMirror: readyRuntimeMirrorCheck
    });

    expect(status.status).toBe("configured");
    expect(status.canAttemptStart).toBe(true);
    expect(status.wrapperPath).toBe(wrapperPath);
  });

  it("defaults to the PoB launcher command and repo wrapper", async () => {
    const forkRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-fork-"));
    const launcherPath = path.join(forkRoot, "Path of Building-PoE2.exe");
    await writeFile(launcherPath, "launcher fixture", "utf8");

    const status = await getLuaBridgeStatus({
      env: {
        POB_LUA_ENABLED: "true",
        POB_FORK_PATH: forkRoot
      },
      checkRuntimeMirror: readyRuntimeMirrorCheck
    });

    expect(status.status).toBe("configured");
    expect(status.command).toBe(launcherPath);
    expect(status.wrapperPath).toContain(`${path.sep}tools${path.sep}pob-lua${path.sep}HeadlessWrapper.lua`);
  });
});

describe("checkPoBLuaRuntimeMirrorReadiness", () => {
  it("passes when the mirror includes required PoB runtime folders", async () => {
    const forkRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-fork-"));
    const wrapperRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-wrapper-"));
    const wrapperPath = path.join(wrapperRoot, "HeadlessWrapper.lua");
    await writeFile(wrapperPath, "#@ SimpleGraphic\n", "utf8");
    await writeFile(path.join(forkRoot, "GameVersions.lua"), "-- game versions", "utf8");
    await Promise.all(["Classes", "Modules", "Data", "TreeData", "lua"].map((directoryName) => mkdir(path.join(forkRoot, directoryName))));

    const check = await checkPoBLuaRuntimeMirrorReadiness({ forkPath: forkRoot, wrapperPath });

    expect(check.ok).toBe(true);
    expect(check.message).toContain("Temporary runtime mirror");
  });

  it("fails when required PoB runtime folders are missing", async () => {
    const forkRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-fork-"));
    const wrapperRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-wrapper-"));
    const wrapperPath = path.join(wrapperRoot, "HeadlessWrapper.lua");
    await writeFile(wrapperPath, "#@ SimpleGraphic\n", "utf8");

    const check = await checkPoBLuaRuntimeMirrorReadiness({ forkPath: forkRoot, wrapperPath });

    expect(check.ok).toBe(false);
    expect(check.message).toContain("missing Classes");
  });
});

describe("preparePoBLuaRuntimeMirror", () => {
  it("creates a temporary PoB-shaped script root for the wrapper", async () => {
    const forkRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-fork-"));
    const wrapperRoot = await mkdtemp(path.join(os.tmpdir(), "pob-item-delta-lua-wrapper-"));
    const wrapperPath = path.join(wrapperRoot, "HeadlessWrapper.lua");
    await writeFile(wrapperPath, "#@ SimpleGraphic\n", "utf8");
    await writeFile(path.join(forkRoot, "GameVersions.lua"), "-- game versions", "utf8");
    await mkdir(path.join(forkRoot, "Modules"), { recursive: true });
    await writeFile(path.join(forkRoot, "Modules", "Main.lua"), "-- main", "utf8");

    const mirrorWrapper = await preparePoBLuaRuntimeMirror({ forkPath: forkRoot, wrapperPath });

    expect(path.basename(mirrorWrapper)).toBe("HeadlessWrapper.lua");
    expect(await readFile(mirrorWrapper, "utf8")).toBe("#@ SimpleGraphic\n");
    expect(await readFile(path.join(path.dirname(mirrorWrapper), "GameVersions.lua"), "utf8")).toBe("-- game versions");
    await expect(access(path.join(path.dirname(mirrorWrapper), "Modules", "Main.lua"))).resolves.toBeUndefined();
  });
});

describe("calculateStatsWithLuaBridge", () => {
  it("does not start a transport when bridge prerequisites are unavailable", async () => {
    const transport = new FakeLuaTransport([]);
    const result = await calculateStatsWithLuaBridge({
      buildXml: "<PathOfBuilding />",
      label: "fixture",
      bridgeStatus: {
        status: "disabled",
        enabled: false,
        canAttemptStart: false,
        message: "PoB-native calculation bridge is disabled; the app is using XML cached stats.",
        command: "luajit",
        forkPath: "D:\\Games\\Path of Building Community (PoE2)",
        wrapperPath: null,
        timeoutMs: 30000,
        checks: [],
        setupHints: ["Keep using XML cached stats until the bridge is configured."]
      },
      transport
    });

    expect(result.status).toBe("unavailable");
    expect(result.stats).toEqual([]);
    expect(result.warnings).toContain("Keep using XML cached stats until the bridge is configured.");
    expect(transport.started).toBe(false);
    expect(transport.stopped).toBe(false);
  });

  it("loads build XML and reads important stats through a transport", async () => {
    const transport = new FakeLuaTransport([
      { ok: true },
      {
        ok: true,
        stats: {
          CombinedDPS: 123,
          AverageHit: "45.5",
          EnergyShield: 999
        }
      }
    ]);

    const result = await calculateStatsWithLuaBridge({
      buildXml: "<PathOfBuilding />",
      label: "candidate",
      bridgeStatus: configuredBridgeStatus(),
      transport
    });

    expect(result.status).toBe("ready");
    expect(result.stats).toContainEqual({ key: "CombinedDPS", label: "Combined DPS", value: 123 });
    expect(result.stats).toContainEqual({ key: "AverageHit", label: "Average hit", value: 45.5 });
    expect(result.stats).toContainEqual({ key: "EnergyShield", label: "Energy shield", value: 999 });
    expect(transport.requests[0]).toEqual({
      action: "load_build_xml",
      params: { xml: "<PathOfBuilding />", name: "candidate" }
    });
    expect(transport.requests[1]?.action).toBe("get_stats");
    expect(transport.started).toBe(true);
    expect(transport.stopped).toBe(true);
  });

  it("returns unavailable and stops the transport when bridge requests fail", async () => {
    const transport = new FakeLuaTransport([{ ok: true }, { ok: false, error: "calculation failed" }]);

    const result = await calculateStatsWithLuaBridge({
      buildXml: "<PathOfBuilding />",
      label: "candidate",
      bridgeStatus: configuredBridgeStatus(),
      transport
    });

    expect(result.status).toBe("unavailable");
    expect(result.stats).toEqual([]);
    expect(result.warnings[0]).toContain("calculation failed");
    expect(transport.stopped).toBe(true);
  });
});

describe("calculateStatsPairWithLuaBridge", () => {
  it("reads before and after stats through one started transport", async () => {
    const transport = new FakeLuaTransport([
      { ok: true },
      {
        ok: true,
        stats: {
          CombinedDPS: 100,
          AverageHit: 25
        }
      },
      { ok: true },
      {
        ok: true,
        stats: {
          CombinedDPS: 140,
          AverageHit: 35
        }
      }
    ]);

    const result = await calculateStatsPairWithLuaBridge({
      beforeBuildXml: "<PathOfBuilding before=\"true\" />",
      beforeLabel: "before",
      afterBuildXml: "<PathOfBuilding after=\"true\" />",
      afterLabel: "after",
      bridgeStatus: configuredBridgeStatus(),
      transport
    });

    expect(result.before.status).toBe("ready");
    expect(result.after.status).toBe("ready");
    expect(result.before.stats).toContainEqual({ key: "CombinedDPS", label: "Combined DPS", value: 100 });
    expect(result.after.stats).toContainEqual({ key: "CombinedDPS", label: "Combined DPS", value: 140 });
    expect(transport.startCount).toBe(1);
    expect(transport.stopCount).toBe(1);
    expect(transport.requests.map((request) => request.action)).toEqual(["load_build_xml", "get_stats", "load_build_xml", "get_stats"]);
    expect(transport.requests[0]?.params).toEqual({ xml: "<PathOfBuilding before=\"true\" />", name: "before" });
    expect(transport.requests[2]?.params).toEqual({ xml: "<PathOfBuilding after=\"true\" />", name: "after" });
  });
});

describe("ReusableLuaBridgeRunner", () => {
  it("keeps one started bridge available for repeated matching requests", async () => {
    const transports: FakeLuaTransport[] = [];
    const runner = new ReusableLuaBridgeRunner({
      idleShutdownMs: 60000,
      createTransport: () => {
        const transport = new FakeLuaTransport([{ ok: true }, { ok: true }]);
        transports.push(transport);
        return transport;
      }
    });

    try {
      await runner.run(clientOptions(), (transport) => transport.request("ping"));
      await runner.run(clientOptions(), (transport) => transport.request("ping"));

      expect(transports).toHaveLength(1);
      expect(transports[0]?.startCount).toBe(1);
      expect(transports[0]?.stopCount).toBe(0);
    } finally {
      await runner.stop();
    }

    expect(transports[0]?.stopCount).toBe(1);
  });

  it("stops the warm bridge when the configured command changes", async () => {
    const transports: FakeLuaTransport[] = [];
    const runner = new ReusableLuaBridgeRunner({
      idleShutdownMs: 60000,
      createTransport: () => {
        const transport = new FakeLuaTransport([{ ok: true }]);
        transports.push(transport);
        return transport;
      }
    });

    try {
      await runner.run(clientOptions({ command: "first.exe" }), (transport) => transport.request("ping"));
      await runner.run(clientOptions({ command: "second.exe" }), (transport) => transport.request("ping"));

      expect(transports).toHaveLength(2);
      expect(transports[0]?.stopCount).toBe(1);
      expect(transports[1]?.startCount).toBe(1);
    } finally {
      await runner.stop();
    }
  });
});

class FakeLuaTransport implements LuaBridgeTransport {
  started = false;
  stopped = false;
  startCount = 0;
  stopCount = 0;
  readonly requests: { action: string; params?: Record<string, unknown> }[] = [];

  constructor(private readonly responses: Record<string, unknown>[]) {}

  async start(): Promise<void> {
    this.started = true;
    this.startCount += 1;
  }

  async request(action: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.requests.push(params ? { action, params } : { action });
    const response = this.responses.shift();
    if (!response) {
      throw new Error(`No fake response for ${action}.`);
    }
    return response;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopCount += 1;
  }
}

async function readyRuntimeMirrorCheck(): Promise<LuaBridgeCheck> {
  return {
    key: "runtimeMirror",
    label: "Runtime mirror",
    ok: true,
    message: "Temporary runtime mirror can be prepared with required PoB modules."
  };
}

function configuredBridgeStatus(): LuaBridgeStatusResponse {
  return {
    status: "configured",
    enabled: true,
    canAttemptStart: true,
    message: "PoB-native calculation bridge prerequisites are configured.",
    command: process.execPath,
    forkPath: os.tmpdir(),
    wrapperPath: path.join(os.tmpdir(), "HeadlessWrapper.lua"),
    timeoutMs: 1000,
    checks: [],
    setupHints: []
  };
}

function clientOptions(overrides: Partial<LuaBridgeClientOptions> = {}): LuaBridgeClientOptions {
  return {
    command: process.execPath,
    cwd: os.tmpdir(),
    wrapperPath: path.join(os.tmpdir(), "HeadlessWrapper.lua"),
    timeoutMs: 1000,
    ...overrides
  };
}
