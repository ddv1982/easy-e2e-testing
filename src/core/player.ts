import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import {
  chromium,
  errors as playwrightErrors,
  type Browser,
  type Page,
} from "playwright";
import { testSchema, type Step } from "./yaml-schema.js";
import { yamlToTest } from "./transformer.js";
import { ValidationError, UserError } from "../utils/errors.js";
import { ui } from "../utils/ui.js";
import { executeRuntimeStep } from "./runtime/step-executor.js";
import {
  isPlaywrightLocator,
  resolveLocator,
  resolveLocatorContext,
  resolveNavigateUrl,
} from "./runtime/locator-runtime.js";

const NETWORK_IDLE_WARNING_LIMIT = 3;

export interface PlayOptions {
  headed?: boolean;
  timeout?: number;
  baseUrl?: string;
  delayMs?: number;
  waitForNetworkIdle?: boolean;
  networkIdleTimeout?: number;
}

export interface StepResult {
  step: Step;
  index: number;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface TestResult {
  name: string;
  file: string;
  steps: StepResult[];
  passed: boolean;
  durationMs: number;
}

export async function play(
  filePath: string,
  options: PlayOptions = {}
): Promise<TestResult> {
  const timeout = options.timeout ?? 10_000;
  const delayMs = options.delayMs ?? 0;
  const waitForNetworkIdle = options.waitForNetworkIdle ?? true;
  const networkIdleTimeout = options.networkIdleTimeout ?? 2_000;

  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new UserError(
      `Invalid delay value: ${delayMs}`,
      "Delay must be a non-negative integer in milliseconds."
    );
  }

  if (
    !Number.isFinite(networkIdleTimeout) ||
    networkIdleTimeout <= 0 ||
    !Number.isInteger(networkIdleTimeout)
  ) {
    throw new UserError(
      `Invalid network idle timeout value: ${networkIdleTimeout}`,
      "Network idle timeout must be a positive integer in milliseconds."
    );
  }

  const content = await fs.readFile(filePath, "utf-8");
  const raw = yamlToTest(content);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    throw new ValidationError(
      `Invalid test file: ${filePath}`,
      issues
    );
  }

  const test = parsed.data;
  const effectiveBaseUrl = test.baseUrl ?? options.baseUrl;
  const stepResults: StepResult[] = [];
  const testStart = Date.now();
  let networkIdleTimeoutWarnings = 0;

  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    browser = await launchBrowser(options.headed);
    page = await browser.newPage();

    for (let i = 0; i < test.steps.length; i++) {
      const step = test.steps[i];
      const stepStart = Date.now();
      const desc = stepDescription(step, i);

      try {
        await executeRuntimeStep(page, step, {
          timeout,
          baseUrl: effectiveBaseUrl,
          mode: "playback",
        });
        const networkIdleTimedOut = await waitForPostStepNetworkIdle(
          page,
          waitForNetworkIdle,
          networkIdleTimeout
        );
        if (networkIdleTimedOut) {
          networkIdleTimeoutWarnings += 1;
          if (networkIdleTimeoutWarnings <= NETWORK_IDLE_WARNING_LIMIT) {
            ui.warn(
              `Step ${i + 1} (${step.action}): network idle not reached within ${networkIdleTimeout}ms; continuing.`
            );
          } else if (networkIdleTimeoutWarnings === NETWORK_IDLE_WARNING_LIMIT + 1) {
            ui.warn(
              "Additional network idle timeout warnings will be suppressed for this test file."
            );
          }
        }
        const result: StepResult = {
          step,
          index: i,
          passed: true,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.success(`${desc} (${result.durationMs}ms)`);

        if (delayMs > 0 && i < test.steps.length - 1) {
          await sleep(delayMs);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const result: StepResult = {
          step,
          index: i,
          passed: false,
          error: errMsg,
          durationMs: Date.now() - stepStart,
        };
        stepResults.push(result);
        ui.error(`${desc}: ${errMsg}`);
        break; // stop on first failure
      }
    }
  } finally {
    await browser?.close();
  }

  const passed = stepResults.every((r) => r.passed);
  return {
    name: test.name,
    file: filePath,
    steps: stepResults,
    passed,
    durationMs: Date.now() - testStart,
  };
}

async function launchBrowser(headed?: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ headless: !headed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Executable doesn't exist") || msg.includes("browserType.launch")) {
      throw new UserError(
        "Chromium browser is not installed.",
        "Run: npx playwright install chromium"
      );
    }
    throw err;
  }
}

async function waitForPostStepNetworkIdle(
  page: Page,
  enabled: boolean,
  timeoutMs: number
): Promise<boolean> {
  if (!enabled) return false;

  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    return false;
  } catch (err) {
    if (isPlaywrightTimeoutError(err)) {
      return true;
    }
    throw err;
  }
}

function isPlaywrightTimeoutError(err: unknown): boolean {
  if (err instanceof playwrightErrors.TimeoutError) return true;
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return false;
}

function stepDescription(step: Step, index: number): string {
  const desc =
    "description" in step && step.description ? " - " + step.description : "";
  if (step.action === "navigate") {
    return "Step " + (index + 1) + ": navigate to " + step.url + desc;
  }
  return "Step " + (index + 1) + ": " + step.action + desc;
}

// Exports for testing
export {
  resolveLocator,
  resolveLocatorContext,
  resolveNavigateUrl,
  stepDescription,
  waitForPostStepNetworkIdle,
  isPlaywrightTimeoutError,
  isPlaywrightLocator,
};
