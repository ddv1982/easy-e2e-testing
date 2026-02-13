import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserError } from "../utils/errors.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { record, runCodegen } from "./recorder.js";

function createMockChildProcess() {
  return new EventEmitter() as ChildProcess;
}

describe("runCodegen", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("resolves when Playwright codegen exits with code 0", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const run = runCodegen("npx", "http://127.0.0.1:5173", "/tmp/out.jsonl");
    child.emit("close", 0, null);

    await expect(run).resolves.toBeUndefined();
  });

  it("rejects when Playwright codegen exits with non-zero code", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const run = runCodegen("npx", "http://127.0.0.1:5173", "/tmp/out.jsonl");
    child.emit("close", 1, null);

    await expect(run).rejects.toThrow("Playwright codegen exited with code 1");
  });

  it("rejects when Playwright codegen exits via signal", async () => {
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const run = runCodegen("npx", "http://127.0.0.1:5173", "/tmp/out.jsonl");
    child.emit("close", null, "SIGTERM");

    await expect(run).rejects.toThrow("Playwright codegen exited via signal SIGTERM");
  });
});

describe("record", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("recovers and saves when codegen exits via signal but JSONL output exists", async () => {
    vi.spyOn(Date, "now").mockReturnValue(424242);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const tmpJsonlPath = path.join(os.tmpdir(), "ui-test-recording-424242.jsonl");
    await fs.writeFile(tmpJsonlPath, '{"type":"click","selector":"button"}\n', "utf-8");

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Recovered Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalled();
    });
    child.emit("close", null, "SIGTERM");
    const outputPath = await run;

    const saved = await fs.readFile(outputPath, "utf-8");
    expect(saved).toContain("name: Recovered Recording");
    expect(saved).toContain("action: click");

    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("throws a clear error when codegen exits via signal and no JSONL output exists", async () => {
    vi.spyOn(Date, "now").mockReturnValue(434343);

    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child);

    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-recorder-test-"));
    const run = record({
      name: "Interrupted Recording",
      url: "http://127.0.0.1:5173",
      outputDir,
    });

    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalled();
    });
    child.emit("close", null, "SIGTERM");

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Recording failed: Playwright codegen exited via signal SIGTERM");

    await fs.rm(outputDir, { recursive: true, force: true });
  });
});
