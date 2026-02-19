import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    accessSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

import { spawnSync } from "node:child_process";
import { accessSync, rmSync } from "node:fs";
import {
  extractTarballName,
  packCurrentWorkspaceSilent,
  removeTarball,
} from "./check-pack-silent.mjs";

const mockSpawnSync = vi.mocked(spawnSync);
const mockAccessSync = vi.mocked(accessSync);
const mockRmSync = vi.mocked(rmSync);

describe("check-pack-silent", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "ui-test-0.1.0.tgz\n",
      stderr: "",
    });
  });

  it("extracts tarball from plain output", () => {
    const out = extractTarballName("ui-test-0.1.0.tgz\n");
    expect(out).toBe("ui-test-0.1.0.tgz");
  });

  it("extracts tarball from noisy output lines", () => {
    const out = extractTarballName([
      "npm notice some message",
      "npm notice filename: ui-test-0.1.0.tgz",
      "",
    ].join("\n"));
    expect(out).toBe("ui-test-0.1.0.tgz");
  });

  it("returns undefined when output does not contain a tarball", () => {
    const out = extractTarballName("npm notice nothing useful here");
    expect(out).toBeUndefined();
  });

  it("falls back to stderr when stdout is empty", () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "",
      stderr: "ui-test-0.1.0.tgz\n",
    });

    const tarballPath = packCurrentWorkspaceSilent();
    expect(tarballPath).toMatch(/ui-test-0\.1\.0\.tgz$/);
    expect(mockAccessSync).toHaveBeenCalledTimes(1);
  });

  it("throws when npm pack output does not include tarball name", () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      stdout: "npm notice done",
      stderr: "",
    });

    expect(() => packCurrentWorkspaceSilent()).toThrow(
      /did not return a tarball filename/
    );
  });

  it("throws when npm pack exits non-zero", () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "npm ERR!",
    });

    expect(() => packCurrentWorkspaceSilent()).toThrow(
      /failed with status 1/
    );
  });

  it("removes tarball path", () => {
    removeTarball("/tmp/ui-test-0.1.0.tgz");
    expect(mockRmSync).toHaveBeenCalledWith("/tmp/ui-test-0.1.0.tgz", {
      force: true,
    });
  });
});
