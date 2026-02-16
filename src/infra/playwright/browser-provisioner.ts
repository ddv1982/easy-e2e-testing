import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chromium, firefox, webkit } from "playwright";
import { UserError } from "../../utils/errors.js";

const require = createRequire(import.meta.url);

export type PlaywrightBrowser = "chromium" | "firefox" | "webkit";
export const ALL_PLAYWRIGHT_BROWSERS: PlaywrightBrowser[] = ["chromium", "firefox", "webkit"];

export const browserLaunchers = { chromium, firefox, webkit } as const;

export function validateBrowserName(input: string): PlaywrightBrowser {
  const normalized = input.trim().toLowerCase();
  const valid = new Set<string>(ALL_PLAYWRIGHT_BROWSERS);
  if (!valid.has(normalized)) {
    throw new UserError(
      `Unknown browser: ${input}`,
      `Valid browsers: ${ALL_PLAYWRIGHT_BROWSERS.join(", ")}`
    );
  }
  return normalized as PlaywrightBrowser;
}

export function installPlaywrightBrowser(browser: PlaywrightBrowser): void {
  const playwrightPackageRoot = resolvePlaywrightPackageRoot();
  const playwrightCliEntry = resolvePlaywrightCliEntry(playwrightPackageRoot);
  const label = `Install Playwright ${browser}`;

  if (playwrightCliEntry) {
    runInstallStep(
      label,
      process.execPath,
      buildPlaywrightCliRunArgs(playwrightCliEntry, ["install", browser]),
      browser,
      playwrightPackageRoot
    );
    return;
  }

  runInstallStep(label, "npx", ["playwright", "install", browser], browser);
}

export function installPlaywrightBrowsers(browsers: PlaywrightBrowser[]): void {
  for (const browser of browsers) {
    installPlaywrightBrowser(browser);
  }
}

export async function verifyBrowserLaunch(browser: PlaywrightBrowser): Promise<void> {
  try {
    const instance = await browserLaunchers[browser].launch({ headless: true });
    await instance.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new UserError(
      `Playwright ${browser} failed to launch after installation.`,
      buildLaunchFailureHint(browser, message)
    );
  }
}

export function buildInstallFailureHint(
  browser: PlaywrightBrowser,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === "linux") {
    return (
      `Check internet/proxy settings and retry. Manual command: npx playwright install ${browser}. ` +
      `If launch still fails on Linux, run: npx playwright install-deps ${browser}`
    );
  }

  return `Check internet/proxy settings and retry. Manual command: npx playwright install ${browser}`;
}

function runInstallStep(
  name: string,
  command: string,
  args: string[],
  browser: PlaywrightBrowser,
  cwd?: string
): void {
  console.log(`[setup] ${name}...`);
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
      buildInstallFailureHint(browser)
    );
  }
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

function buildLaunchFailureHint(
  browser: PlaywrightBrowser,
  message: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === "linux" && isLikelyMissingLinuxDeps(message)) {
    return `Linux dependencies may be missing. Run: npx playwright install-deps ${browser}`;
  }

  if (isLikelyMissingLinuxDeps(message)) {
    return (
      "Playwright reported missing system dependencies. " +
      `If you are on Linux, run: npx playwright install-deps ${browser}`
    );
  }

  return `Retry provisioning with: npx playwright install ${browser}`;
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
