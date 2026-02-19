import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

vi.mock("./check-pack-silent.mjs", () => ({
  packCurrentWorkspaceSilent: vi.fn(),
  removeTarball: vi.fn(),
}));

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { packCurrentWorkspaceSilent, removeTarball } from "./check-pack-silent.mjs";
import { runGlobalInstallDryRun } from "./check-global-install-dry-run.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockRmSync = vi.mocked(rmSync);
const mockPackCurrentWorkspaceSilent = vi.mocked(packCurrentWorkspaceSilent);
const mockRemoveTarball = vi.mocked(removeTarball);

describe("check-global-install-dry-run", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPackCurrentWorkspaceSilent.mockReturnValue("/tmp/ui-test-0.1.0.tgz");
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "",
      stderr: "",
    });
  });

  it("runs global install dry-run and cleans up", () => {
    runGlobalInstallDryRun();

    expect(mockMkdirSync).toHaveBeenCalledTimes(3);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockRemoveTarball).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });

  it("still cleans up tarball when prefix setup fails", () => {
    mockMkdirSync.mockImplementationOnce(() => {
      throw new Error("mkdir failed");
    });

    expect(() => runGlobalInstallDryRun()).toThrow(/mkdir failed/);
    expect(mockRemoveTarball).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("still cleans up when global install dry-run fails", () => {
    mockSpawnSync.mockReturnValue({
      status: 2,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => runGlobalInstallDryRun()).toThrow(/failed with status 2/);
    expect(mockRemoveTarball).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledTimes(1);
  });
});
