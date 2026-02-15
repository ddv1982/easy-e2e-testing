import type { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { findLegacyConfigPath, loadConfig } from "../utils/config.js";
import { handleError, UserError } from "../utils/errors.js";
import { resolveCommandPrefix } from "../utils/runtime-info.js";
import { ui } from "../utils/ui.js";
import { runInit } from "./init.js";

const CONFIG_FILENAMES = ["ui-test.config.yaml"];
const require = createRequire(import.meta.url);

interface SetupOptions {
  forceInit?: boolean;
  skipBrowserInstall?: boolean;
}

export function registerSetup(program: Command) {
  program
    .command("setup")
    .description("Prepare project for first run (config + browsers)")
    .option("--skip-browser-install", "Skip Playwright browser installation")
    .option("--force-init", "Reinitialize config and sample test with defaults")
    .action(async (opts: unknown) => {
      try {
        await runSetup(parseSetupOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runSetup(opts: SetupOptions = {}): Promise<void> {
  ui.heading("ui-test setup");
  console.log();
  const commandPrefix = resolveCommandPrefix();

  const existingConfigPath = await findExistingConfigPath();
  if (!existingConfigPath && !opts.forceInit) {
    const legacyConfigPath = await findLegacyConfigPath();
    if (legacyConfigPath) {
      throw new UserError(
        `Legacy config file detected at ${legacyConfigPath}`,
        `Rename it to ui-test.config.yaml, then rerun setup. If you want a fresh config instead, use: ${commandPrefix} setup --force-init`
      );
    }
  }

  if (opts.forceInit || !existingConfigPath) {
    if (opts.forceInit) {
      if (existingConfigPath) {
        ui.info(`Config found at ${existingConfigPath}; reinitializing due to --force-init.`);
      } else {
        ui.info("No config found; initializing with defaults due to --force-init.");
      }
      await runInit({ yes: true, overwriteSample: true });
    } else {
      ui.info("No config found; initializing with defaults.");
      await runInit({ yes: true });
    }
  } else {
    ui.info(`Existing config detected at ${existingConfigPath}; keeping as-is.`);
    ui.step(`To reset config/sample to defaults: ${commandPrefix} setup --force-init`);
    await loadConfig();
  }

  if (opts.skipBrowserInstall) {
    ui.warn("Skipping Playwright browser installation (--skip-browser-install).");
  } else {
    runInstallPlaywrightChromium();
    await verifyChromiumLaunch();
  }

  console.log();
  ui.success("Setup complete.");
  ui.step(`Run tests: ${commandPrefix} play`);
}

async function findExistingConfigPath(): Promise<string | undefined> {
  for (const file of CONFIG_FILENAMES) {
    const configPath = path.resolve(file);
    try {
      await fs.access(configPath);
      return configPath;
    } catch {
      // Keep checking.
    }
  }
  return undefined;
}

function runInstallPlaywrightChromium(): void {
  const playwrightPackageRoot = resolvePlaywrightPackageRoot();
  const playwrightCliEntry = resolvePlaywrightCliEntry(playwrightPackageRoot);
  if (playwrightCliEntry) {
    runInstallStep(
      "Install Playwright Chromium",
      process.execPath,
      buildPlaywrightCliRunArgs(playwrightCliEntry, ["install", "chromium"]),
      playwrightPackageRoot
    );
    return;
  }

  runInstallStep("Install Playwright Chromium", "npx", ["playwright", "install", "chromium"]);
}

function resolvePlaywrightCliEntry(playwrightPackageRoot?: string): string | undefined {
  if (!playwrightPackageRoot) return undefined;
  const cliPath = path.join(playwrightPackageRoot, "cli.js");
  return existsSync(cliPath) ? cliPath : undefined;
}

function buildPlaywrightCliRunArgs(playwrightCliEntry: string, args: string[]): string[] {
  const shim = [
    "const cliPath = process.argv[1];",
    "const cliArgs = process.argv.slice(2);",
    "process.argv = [process.execPath, 'playwright', ...cliArgs];",
    "require(cliPath);",
  ].join(" ");
  return ["-e", shim, playwrightCliEntry, ...args];
}

function resolvePlaywrightPackageRoot(): string | undefined {
  try {
    const packageJsonPath = require.resolve("playwright/package.json");
    return path.dirname(packageJsonPath);
  } catch {
    return undefined;
  }
}

function runInstallStep(
  name: string,
  command: string,
  args: string[],
  cwd?: string
): void {
  ui.info(`${name}...`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new UserError(
      `${name} failed: ${result.error.message}`,
      "Ensure Node.js/npm are installed and available in your PATH."
    );
  }

  if (result.status !== 0) {
    throw new UserError(
      `${name} failed.`,
      buildInstallFailureHint()
    );
  }
}

async function verifyChromiumLaunch(): Promise<void> {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    ui.success("Chromium launch check passed.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(
      "Playwright Chromium failed to launch after installation.",
      buildLaunchFailureHint(message)
    );
  }
}

function buildInstallFailureHint(platform: NodeJS.Platform = process.platform): string {
  if (platform === "linux") {
    return (
      "Check internet/proxy settings and retry. Manual command: npx playwright install chromium. " +
      "If launch still fails on Linux, run: npx playwright install-deps chromium"
    );
  }

  return "Check internet/proxy settings and retry. Manual command: npx playwright install chromium";
}

function buildLaunchFailureHint(
  message: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === "linux" && isLikelyMissingLinuxDeps(message)) {
    return "Linux dependencies may be missing. Run: npx playwright install-deps chromium";
  }

  if (isLikelyMissingLinuxDeps(message)) {
    return (
      "Playwright reported missing system dependencies. " +
      "If you are on Linux, run: npx playwright install-deps chromium"
    );
  }

  return "Re-run setup, then try: npx playwright install chromium";
}

function isLikelyMissingLinuxDeps(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("host system is missing dependencies") ||
    normalized.includes("install-deps") ||
    normalized.includes("error while loading shared libraries") ||
    normalized.includes("libgtk") ||
    normalized.includes("libx11") ||
    normalized.includes("libnss3")
  );
}

export {
  runSetup,
  buildInstallFailureHint,
  buildLaunchFailureHint,
  isLikelyMissingLinuxDeps,
  findExistingConfigPath,
};

function parseSetupOptions(value: unknown): SetupOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    forceInit: asOptionalBoolean(record.forceInit),
    skipBrowserInstall: asOptionalBoolean(record.skipBrowserInstall),
  };
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
