import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  ensureLocalCliBuilt,
  resolveLocalCliEntry,
  runCliBootstrap,
} from "./bootstrap.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);

describe("bootstrap maintainer wrapper", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      stdout: "",
      stderr: "",
    });
  });

  it("always runs prepare-build before invoking local CLI", () => {
    mockExistsSync.mockReturnValue(true);

    ensureLocalCliBuilt();

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/scripts[\\/]+prepare-build\.mjs$/)],
      {
        cwd: expect.any(String),
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });

  it("fails when local CLI entry is still missing after prepare-build", () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => ensureLocalCliBuilt()).toThrow(
      /Local ui-test CLI not found/
    );
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
  });

  it("forwards argv to local ui-test bootstrap entry", () => {
    runCliBootstrap(["quickstart", "--run-play", "--", "--yes"]);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      process.execPath,
      [resolveLocalCliEntry(), "bootstrap", "quickstart", "--run-play", "--", "--yes"],
      {
        cwd: expect.any(String),
        stdio: "inherit",
        shell: process.platform === "win32",
        env: process.env,
      }
    );
  });
});
