import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../utils/errors.js";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock("./init.js", () => ({
  runInit: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { runInit } from "./init.js";
import { buildInstallFailureHint, buildLaunchFailureHint, runSetup } from "./setup.js";

const mockSpawnSync = vi.mocked(spawnSync);
const mockLaunch = vi.mocked(chromium.launch);
const mockRunInit = vi.mocked(runInit);

function mockSpawnSuccess(): void {
  mockSpawnSync.mockReturnValue({
    status: 0,
    error: undefined,
    stdout: "",
    stderr: "",
  } as never);
}

describe("runSetup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRunInit.mockResolvedValue(undefined);
    mockSpawnSuccess();
    mockLaunch.mockResolvedValue({
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls init --yes when config is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await runSetup();
      expect(mockRunInit).toHaveBeenCalledWith({ yes: true });
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps existing config by default", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      process.chdir(dir);
      await fs.writeFile(
        "ui-test.config.yaml",
        'testDir: "e2e"\nbaseUrl: "http://127.0.0.1:5173"\n',
        "utf-8"
      );

      await runSetup();
      expect(mockRunInit).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ui-test setup --force-init"));
    } finally {
      logSpy.mockRestore();
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reinitializes config when --force-init is used", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await fs.writeFile("ui-test.config.yaml", 'testDir: "e2e"\n', "utf-8");
      await runSetup({ forceInit: true });
      expect(mockRunInit).toHaveBeenCalledWith({ yes: true, overwriteSample: true });
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reinitializes defaults when --force-init is used without existing config", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await runSetup({ forceInit: true });
      expect(mockRunInit).toHaveBeenCalledWith({ yes: true, overwriteSample: true });
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("fails fast when only legacy easy-e2e config exists", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await fs.writeFile("easy-e2e.config.yaml", 'testDir: "e2e"\n', "utf-8");

      const run = runSetup();
      await expect(run).rejects.toBeInstanceOf(UserError);
      await expect(run).rejects.toThrow(/Legacy config file detected/);
      expect(mockRunInit).not.toHaveBeenCalled();
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("runs playwright install command", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await runSetup();

      const installCall = mockSpawnSync.mock.calls.find(([, args]) => {
        if (!Array.isArray(args)) return false;
        return args.includes("install") && args.includes("chromium");
      });

      expect(installCall).toBeDefined();
      if (!installCall) throw new Error("Expected Playwright install command to be invoked.");

      const [command, args, options] = installCall;
      expect(options).toMatchObject({
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      });

      if (command === process.execPath) {
        expect(Array.isArray(args)).toBe(true);
        const argList = args as string[];
        expect(argList[0]).toBe("-e");
        expect(typeof argList[1]).toBe("string");
        expect(argList[2].replace(/\\/g, "/")).toContain("playwright/cli.js");
        expect(argList.slice(3)).toEqual(["install", "chromium"]);
      } else {
        expect(command).toBe("npx");
        expect(args).toEqual(["playwright", "install", "chromium"]);
      }
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("throws UserError when playwright install fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      mockSpawnSync.mockReturnValueOnce({
        status: 1,
        error: undefined,
        stdout: "",
        stderr: "",
      } as never);

      const run = runSetup();
      await expect(run).rejects.toBeInstanceOf(UserError);
      await expect(run).rejects.toThrow("Install Playwright Chromium failed.");
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("reports install-deps hint for missing Linux dependencies", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      mockLaunch.mockRejectedValueOnce(
        new Error("Host system is missing dependencies to run browsers.")
      );

      const run = runSetup();
      await expect(run).rejects.toBeInstanceOf(UserError);
      await expect(run).rejects.toThrow(
        "Playwright Chromium failed to launch after installation."
      );
      await run.catch((err) => {
        expect(err).toBeInstanceOf(UserError);
        const userErr = err as UserError;
        expect(userErr.hint).toContain("npx playwright install-deps chromium");
      });
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("skips browser install when --skip-browser-install is used", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-setup-test-"));
    const prevCwd = process.cwd();

    try {
      process.chdir(dir);
      await runSetup({ skipBrowserInstall: true });
      expect(mockSpawnSync).not.toHaveBeenCalled();
      expect(mockLaunch).not.toHaveBeenCalled();
    } finally {
      process.chdir(prevCwd);
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("setup hints", () => {
  it("returns Linux-specific install hint for Linux platform", () => {
    const hint = buildInstallFailureHint("linux");
    expect(hint).toContain("npx playwright install chromium");
    expect(hint).toContain("npx playwright install-deps chromium");
  });

  it("returns generic install hint for non-Linux platforms", () => {
    const hint = buildInstallFailureHint("win32");
    expect(hint).toContain("npx playwright install chromium");
    expect(hint).not.toContain("install-deps");
  });

  it("returns Linux dependency hint when launch error occurs on Linux", () => {
    const hint = buildLaunchFailureHint(
      "Host system is missing dependencies to run browsers.",
      "linux"
    );
    expect(hint).toContain("Linux dependencies may be missing");
  });

  it("returns conditional Linux guidance for dependency-like error on non-Linux", () => {
    const hint = buildLaunchFailureHint(
      "Host system is missing dependencies to run browsers.",
      "darwin"
    );
    expect(hint).toContain("If you are on Linux");
  });
});
