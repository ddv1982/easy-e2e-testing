import fs from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  collectPlaywrightCliStepSnapshots,
  createPlaywrightCliSessionId,
} from "./playwright-cli-replay.js";
import type { Step } from "../../yaml-schema.js";

describe("collectPlaywrightCliStepSnapshots", () => {
  it("creates short session ids for CLI socket safety", () => {
    const session = createPlaywrightCliSessionId();
    expect(session).toMatch(/^u[a-z0-9]{12}$/);
    expect(session.length).toBeLessThanOrEqual(13);
  });

  it("probes playwright-cli first, then falls back to npx", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push({ command, args });

      if (command === "playwright-cli" && args[0] === "--help") {
        return { ok: false, stdout: "", stderr: "not found", error: "not found" };
      }
      if (command === "npx" && args[2] === "--help") {
        return { ok: true, stdout: "ok", stderr: "" };
      }
      const filenameIndex = args.indexOf("--filename");
      if (filenameIndex >= 0) {
        const filename = args[filenameIndex + 1];
        await fs.writeFile(
          filename,
          `- generic [ref=e1]:\n  - heading "Done" [level=1] [ref=e2]\n`,
          "utf-8"
        );
      }
      return { ok: true, stdout: "ok", stderr: "" };
    });

    const result = await collectPlaywrightCliStepSnapshots({ steps: [] }, runCommand);

    expect(result.available).toBe(true);
    expect(calls[0]).toMatchObject({ command: "playwright-cli", args: ["--help"] });
    expect(calls[1]).toMatchObject({
      command: "npx",
      args: ["-y", "@playwright/cli@latest", "--help"],
    });
  });

  it("runs open/snapshot/replay/snapshot/close sequence", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      calls.push({ command: _command, args });
      if (args.includes("run-code")) {
        const payload = args[args.length - 1] ?? "";
        if (!payload.includes("(page) =>")) {
          return {
            ok: false,
            stdout: "",
            stderr: "run-code payload must be a function",
            error: "Command exited with code 1",
          };
        }
      }
      const filenameIndex = args.indexOf("--filename");
      if (filenameIndex >= 0) {
        const filename = args[filenameIndex + 1];
        await fs.writeFile(
          filename,
          `- generic [ref=e1]:\n  - heading "Saved" [level=1] [ref=e2]\n`,
          "utf-8"
        );
      }
      return { ok: true, stdout: "ok", stderr: "" };
    });

    const steps: Step[] = [
      {
        action: "click",
        target: { value: "#save", kind: "css", source: "manual" },
      },
    ];

    const result = await collectPlaywrightCliStepSnapshots({ steps }, runCommand);

    expect(result.available).toBe(true);
    expect(result.stepSnapshots).toHaveLength(1);
    expect(calls.some((call) => call.args.includes("open"))).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.args.includes("run-code") &&
          (call.args[call.args.length - 1] ?? "").includes("(page) =>")
      )
    ).toBe(true);
    expect(calls.filter((call) => call.args.includes("snapshot"))).toHaveLength(2);
    expect(calls.some((call) => call.args.includes("close"))).toBe(true);
  });

  it("records replay failure and still closes session", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runCommand = vi.fn(async (_command: string, args: string[]) => {
      calls.push({ command: _command, args });
      const filenameIndex = args.indexOf("--filename");
      if (filenameIndex >= 0) {
        const filename = args[filenameIndex + 1];
        await fs.writeFile(
          filename,
          `- generic [ref=e1]:\n  - heading "Initial" [level=1] [ref=e2]\n`,
          "utf-8"
        );
      }
      if (args.includes("run-code") && args.some((arg) => arg.includes(".click("))) {
        return {
          ok: false,
          stdout: "",
          stderr: "click failed",
          error: "Command exited with code 1",
        };
      }
      return { ok: true, stdout: "ok", stderr: "" };
    });

    const steps: Step[] = [
      {
        action: "click",
        target: { value: "#save", kind: "css", source: "manual" },
      },
    ];
    const result = await collectPlaywrightCliStepSnapshots({ steps }, runCommand);

    expect(result.stepSnapshots).toHaveLength(0);
    expect(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "assertion_source_snapshot_cli_step_replay_failed"
      )
    ).toBe(true);
    expect(calls.some((call) => call.args.includes("close"))).toBe(true);
  });
});
