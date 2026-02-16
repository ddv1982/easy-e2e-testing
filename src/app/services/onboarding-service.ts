import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { UserError } from "../../utils/errors.js";
import { PLAY_DEFAULT_EXAMPLE_TEST_FILE } from "../../core/play/play-defaults.js";
import {
  installPlaywrightBrowsers,
  verifyBrowserLaunch,
  type PlaywrightBrowser,
} from "../../infra/playwright/browser-provisioner.js";

export interface OnboardingPlan {
  browsers: PlaywrightBrowser[];
  runPlay: boolean;
}

export interface OnboardingContext {
  uiTestCliEntry: string;
}

export async function runOnboardingPlan(
  plan: OnboardingPlan,
  context: OnboardingContext
): Promise<void> {
  runInstallDependencies();
  runInstallPlaywrightCli();
  installPlaywrightBrowsers(plan.browsers);
  await verifyBrowserLaunch(plan.browsers[0]);

  if (plan.runPlay) {
    const exampleTestPath = path.resolve(PLAY_DEFAULT_EXAMPLE_TEST_FILE);
    if (existsSync(exampleTestPath)) {
      runUiTestCommand(context.uiTestCliEntry, "play", [PLAY_DEFAULT_EXAMPLE_TEST_FILE]);
    } else {
      console.warn(
        `[setup] WARN: Skipping run-play because ${PLAY_DEFAULT_EXAMPLE_TEST_FILE} was not found in ${process.cwd()}. ` +
        "Record a test first with: ui-test record"
      );
    }
  }
}

function runUiTestCommand(uiTestCliEntry: string, command: string, args: string[]) {
  const fullArgs = [uiTestCliEntry, command, ...args];
  runCommand(
    `Run ui-test ${command}${args.length > 0 ? ` ${args.join(" ")}` : ""}`,
    process.execPath,
    fullArgs
  );
}

function runInstallDependencies() {
  ensureCommandAvailable("npm");
  const installArgs = resolveInstallArgs();
  runCommand(
    `Install dependencies (npm ${installArgs.join(" ")})`,
    "npm",
    installArgs
  );
}

export function resolveInstallArgs() {
  const lockFilePath = path.resolve("package-lock.json");
  return existsSync(lockFilePath) ? ["ci"] : ["install"];
}

export function runInstallPlaywrightCli() {
  const failures: string[] = [];
  try {
    runCommand("Verify Playwright-CLI (playwright-cli)", "playwright-cli", ["--version"], { quiet: true });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`playwright-cli --version failed: ${message}`);
  }

  try {
    ensureCommandAvailable("npx");
    runCommand("Install/verify Playwright-CLI (@latest)", "npx", [
      "-y",
      "--package",
      "@playwright/cli@latest",
      "playwright",
      "--version",
    ], { quiet: true });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`npx -y --package @playwright/cli@latest playwright --version failed: ${message}`);
  }

  console.warn(
    `[setup] WARN: ${failures.join(" ")} ` +
    "Retry manually: playwright-cli --help or npx -y --package @playwright/cli@latest playwright --help. " +
    "Continuing because Playwright-CLI is only required for improve --assertion-source snapshot-cli."
  );
  return false;
}

function ensureCommandAvailable(command: string) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error || result.status !== 0) {
    throw new UserError(
      `Required command "${command}" is unavailable in PATH.`
    );
  }
}

function runCommand(label: string, command: string, args: string[], options?: { quiet?: boolean }) {
  console.log(`[setup] ${label}`);
  const result = spawnSync(command, args, {
    stdio: options?.quiet ? "ignore" : "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });

  if (result.error) {
    throw new UserError(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new UserError(`${label} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

// Re-export browser types for commands layer (commands cannot import from infra directly)
export { ALL_PLAYWRIGHT_BROWSERS, validateBrowserName, type PlaywrightBrowser } from "../../infra/playwright/browser-provisioner.js";
