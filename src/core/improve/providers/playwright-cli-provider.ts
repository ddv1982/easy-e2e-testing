import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProviderContext, ProviderResult } from "./types.js";
import { runCapturedCommand } from "../../../utils/process-runner.js";

const MAX_SNAPSHOT_EXCERPT = 2_000;
interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

export async function probePlaywrightCli(): Promise<boolean> {
  const result = await runCommand("playwright-cli", ["--help"], 5_000);
  return result.ok;
}

export async function collectPlaywrightCliContext(context: ProviderContext): Promise<ProviderResult> {
  const diagnostics: ProviderResult["diagnostics"] = [];

  const available = await probePlaywrightCli();
  if (!available) {
    diagnostics.push({
      code: "provider_playwright_cli_unavailable",
      level: "warn",
      message: "playwright-cli is not available; falling back to direct Playwright context.",
    });
    return {
      providerUsed: "none",
      diagnostics,
    };
  }

  diagnostics.push({
    code: "provider_playwright_cli_selected",
    level: "info",
    message: "Using playwright-cli adapter for optional context collection.",
  });

  if (!context.initialUrl) {
    diagnostics.push({
      code: "provider_playwright_cli_no_url",
      level: "info",
      message: "No initial URL found in test; skipping playwright-cli snapshot collection.",
    });
    return {
      providerUsed: "playwright-cli",
      diagnostics,
    };
  }

  const session = `ui-test-improve-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;
  const snapshotPath = path.join(os.tmpdir(), `${session}-snapshot.md`);

  try {
    const open = await runCommand("playwright-cli", ["-s", session, "open", context.initialUrl], 20_000);
    if (!open.ok) {
      diagnostics.push({
        code: "provider_playwright_cli_open_failed",
        level: "warn",
        message: open.error ?? (open.stderr || "playwright-cli open failed."),
      });
      return { providerUsed: "playwright-cli", diagnostics };
    }

    const snapshot = await runCommand(
      "playwright-cli",
      ["-s", session, "snapshot", "--filename", snapshotPath],
      20_000
    );

    if (!snapshot.ok) {
      diagnostics.push({
        code: "provider_playwright_cli_snapshot_failed",
        level: "warn",
        message: snapshot.error ?? (snapshot.stderr || "playwright-cli snapshot failed."),
      });
      return { providerUsed: "playwright-cli", diagnostics };
    }

    const snapshotContent = await fs.readFile(snapshotPath, "utf-8").catch(() => "");
    if (!snapshotContent.trim()) {
      diagnostics.push({
        code: "provider_playwright_cli_snapshot_empty",
        level: "warn",
        message: "playwright-cli snapshot file was empty.",
      });
      return { providerUsed: "playwright-cli", diagnostics };
    }

    diagnostics.push({
      code: "provider_playwright_cli_snapshot_collected",
      level: "info",
      message: "Collected playwright-cli snapshot context.",
    });

    return {
      providerUsed: "playwright-cli",
      diagnostics,
      snapshotExcerpt: snapshotContent.slice(0, MAX_SNAPSHOT_EXCERPT),
    };
  } finally {
    await runCommand("playwright-cli", ["-s", session, "close"], 5_000).catch(() => {});
    await fs.unlink(snapshotPath).catch(() => {});
  }
}

export function runCommand(
  command: string,
  args: string[],
  timeoutMs: number
): Promise<CommandResult> {
  return runCapturedCommand(command, args, { timeoutMs });
}
