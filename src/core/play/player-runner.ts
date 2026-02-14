import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { testSchema } from "../yaml-schema.js";
import { yamlToTest } from "../transformer.js";
import { ValidationError, UserError } from "../../utils/errors.js";
import {
  DEFAULT_NETWORK_IDLE_TIMEOUT_MS,
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
} from "../runtime/network-idle.js";
import {
  buildPlayFailureArtifactPaths,
  createPlayRunId,
} from "../play-failure-report.js";
import {
  startTraceCapture,
  stopTraceCaptureIfNeeded,
  type TraceCaptureState,
} from "./artifact-writer.js";
import { runPlayStepLoop } from "./step-loop.js";
import type { PlayOptions, TestResult } from "./play-types.js";

export async function play(
  filePath: string,
  options: PlayOptions = {}
): Promise<TestResult> {
  const absoluteFilePath = path.resolve(filePath);
  const timeout = options.timeout ?? 10_000;
  const delayMs = options.delayMs ?? 0;
  const waitForNetworkIdle = options.waitForNetworkIdle ?? DEFAULT_WAIT_FOR_NETWORK_IDLE;
  const networkIdleTimeout = options.networkIdleTimeout ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;
  const saveFailureArtifacts = options.saveFailureArtifacts ?? true;
  const artifactsDir = options.artifactsDir ?? ".ui-test-artifacts";
  const runId = options.runId ?? createPlayRunId();

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

  const content = await fs.readFile(absoluteFilePath, "utf-8");
  const raw = yamlToTest(content);
  const parsed = testSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new ValidationError(`Invalid test file: ${absoluteFilePath}`, issues);
  }

  const test = parsed.data;
  const effectiveBaseUrl = test.baseUrl ?? options.baseUrl;
  const testStart = Date.now();
  const artifactWarnings: string[] = [];
  const artifactPaths = saveFailureArtifacts
    ? buildPlayFailureArtifactPaths({
        artifactsDir,
        runId,
        testFilePath: absoluteFilePath,
      })
    : undefined;

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let traceState: TraceCaptureState = {
    tracingStarted: false,
    tracingStopped: false,
  };

  let stepResults = [] as TestResult["steps"];
  let failureArtifacts = undefined as TestResult["failureArtifacts"];

  try {
    browser = await launchBrowser(options.headed);
    context = await browser.newContext();
    const page = await context.newPage();

    if (artifactPaths) {
      traceState = await startTraceCapture(context, test.name, artifactWarnings);
    }

    const loopResult = await runPlayStepLoop({
      page,
      context,
      steps: test.steps,
      timeout,
      delayMs,
      effectiveBaseUrl,
      waitForNetworkIdle,
      networkIdleTimeout,
      runId,
      absoluteFilePath,
      testName: test.name,
      traceState,
      artifactWarnings,
      artifactPaths,
    });

    stepResults = loopResult.stepResults;
    failureArtifacts = loopResult.failureArtifacts;
  } finally {
    if (context) {
      await stopTraceCaptureIfNeeded(context, traceState, artifactWarnings);
      await context.close();
    }
    await browser?.close();
  }

  const passed = stepResults.every((result) => result.passed);
  return {
    name: test.name,
    file: absoluteFilePath,
    steps: stepResults,
    passed,
    durationMs: Date.now() - testStart,
    failureArtifacts,
    artifactWarnings: artifactWarnings.length > 0 ? artifactWarnings : undefined,
  };
}

async function launchBrowser(headed?: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ headless: !headed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Executable doesn't exist") || message.includes("browserType.launch")) {
      throw new UserError(
        "Chromium browser is not installed.",
        "Run: npx playwright install chromium"
      );
    }
    throw err;
  }
}
