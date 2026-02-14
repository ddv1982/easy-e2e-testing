import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCapturedCommand } from "../../../infra/process/command-runner.js";
import {
  DEFAULT_NETWORK_IDLE_TIMEOUT_MS,
  DEFAULT_WAIT_FOR_NETWORK_IDLE,
} from "../../runtime/network-idle.js";
import { resolveNavigateUrl } from "../../runtime/locator-runtime.js";
import type { Step, Target } from "../../yaml-schema.js";
import type { StepSnapshot } from "../assertion-candidates-snapshot-cli.js";
import type { ImproveDiagnostic } from "../report-schema.js";

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode?: number;
  error?: string;
}

interface PlaywrightCliInvoker {
  command: string;
  prefixArgs: string[];
  source: "playwright-cli" | "npx";
}

export interface PlaywrightCliReplayOptions {
  steps: Step[];
  baseUrl?: string;
  timeoutMs?: number;
  waitForNetworkIdle?: boolean;
  networkIdleTimeout?: number;
}

export interface PlaywrightCliReplayResult {
  available: boolean;
  stepSnapshots: StepSnapshot[];
  diagnostics: ImproveDiagnostic[];
}

type CommandRunner = (
  command: string,
  args: string[],
  timeoutMs: number,
  outputDir: string
) => Promise<CommandResult>;

const DEFAULT_COMMAND_TIMEOUT_MS = 20_000;

export async function collectPlaywrightCliStepSnapshots(
  options: PlaywrightCliReplayOptions,
  runCommand: CommandRunner = runPlaywrightCliCommand
): Promise<PlaywrightCliReplayResult> {
  const diagnostics: ImproveDiagnostic[] = [];
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-pwcli-replay-"));
  const session = createPlaywrightCliSessionId();
  let invoker: PlaywrightCliInvoker | undefined;

  try {
    const resolvedInvoker = await resolvePlaywrightCliInvoker(runCommand, outputDir);
    diagnostics.push(...resolvedInvoker.diagnostics);
    invoker = resolvedInvoker.invoker;
    if (!invoker) {
      return {
        available: false,
        stepSnapshots: [],
        diagnostics,
      };
    }

    diagnostics.push({
      code: "assertion_source_snapshot_cli_selected",
      level: "info",
      message: `Using ${invoker.source} for snapshot-cli assertion source.`,
    });

    const open = await runPlaywrightCliCommandWithInvoker(
      invoker,
      [`-s=${session}`, "open"],
      options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      outputDir,
      runCommand
    );
    if (!open.ok) {
        diagnostics.push({
          code: "assertion_source_snapshot_cli_step_replay_failed",
          level: "warn",
          message: `Failed to open playwright-cli session: ${(open.stderr || open.error) || "unknown error"}`,
        });
      return { available: true, stepSnapshots: [], diagnostics };
    }

    let currentPageUrl = "about:blank";
    let previousSnapshot = await captureSnapshotContent(
      invoker,
      session,
      outputDir,
      "initial",
      options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      runCommand
    );
    const stepSnapshots: StepSnapshot[] = [];
    const waitForNetworkIdle = options.waitForNetworkIdle ?? DEFAULT_WAIT_FOR_NETWORK_IDLE;
    const networkIdleTimeout = options.networkIdleTimeout ?? DEFAULT_NETWORK_IDLE_TIMEOUT_MS;

    for (let index = 0; index < options.steps.length; index += 1) {
      const step = options.steps[index];
      if (isAssertionStep(step)) {
        continue;
      }

      const replay = await replayStepWithCli(
        invoker,
        session,
        step,
        options.baseUrl,
        currentPageUrl,
        options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        outputDir,
        runCommand
      );

      if (!replay.ok) {
        diagnostics.push({
          code: "assertion_source_snapshot_cli_step_replay_failed",
          level: "warn",
          message: `Failed to replay step ${index + 1} (${step.action}): ${replay.error ?? "unknown error"}`,
        });
        return { available: true, stepSnapshots: [], diagnostics };
      }
      currentPageUrl = replay.currentPageUrl;

      if (waitForNetworkIdle) {
        const wait = await runCliCode(
          invoker,
          session,
          `const __timeout = ${networkIdleTimeout}; try { await page.waitForLoadState("networkidle", { timeout: __timeout }); } catch (error) { if (!(error && typeof error === "object" && "name" in error && error.name === "TimeoutError")) throw error; }`,
          options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
          outputDir,
          runCommand
        );
        if (!wait.ok) {
          diagnostics.push({
            code: "assertion_source_snapshot_cli_step_replay_failed",
            level: "warn",
            message: `Network idle wait failed after step ${index + 1}: ${wait.error ?? "unknown error"}`,
          });
          return { available: true, stepSnapshots: [], diagnostics };
        }
      }

      const postSnapshot = await captureSnapshotContent(
        invoker,
        session,
        outputDir,
        `step-${index + 1}`,
        options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
        runCommand
      );
      stepSnapshots.push({
        index,
        step,
        preSnapshot: previousSnapshot,
        postSnapshot,
      });
      previousSnapshot = postSnapshot;
    }

    return { available: true, stepSnapshots, diagnostics };
  } catch (err) {
    diagnostics.push({
      code: "assertion_source_snapshot_cli_parse_failed",
      level: "warn",
      message:
        err instanceof Error
          ? `Snapshot-cli replay crashed: ${err.message}`
          : "Snapshot-cli replay crashed with an unknown error.",
    });
    return { available: true, stepSnapshots: [], diagnostics };
  } finally {
    if (invoker) {
      await runPlaywrightCliCommandWithInvoker(
        invoker,
        [`-s=${session}`, "close"],
        5_000,
        outputDir,
        runCommand
      ).catch(() => {});
    }
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
  }
}

export function createPlaywrightCliSessionId(): string {
  const timestamp = Date.now().toString(36).slice(-6);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `u${timestamp}${nonce}`;
}

export function runPlaywrightCliCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  outputDir: string
): Promise<CommandResult> {
  return runCapturedCommand(command, args, {
    timeoutMs,
    spawnOptions: {
      env: {
        ...process.env,
        PLAYWRIGHT_MCP_OUTPUT_DIR: outputDir,
      },
    },
  });
}

async function resolvePlaywrightCliInvoker(
  runCommand: CommandRunner,
  outputDir: string
): Promise<{
  invoker?: PlaywrightCliInvoker;
  diagnostics: ImproveDiagnostic[];
}> {
  const diagnostics: ImproveDiagnostic[] = [];

  const direct = await runCommand("playwright-cli", ["--help"], 5_000, outputDir);
  if (direct.ok) {
    return {
      invoker: {
        command: "playwright-cli",
        prefixArgs: [],
        source: "playwright-cli",
      },
      diagnostics,
    };
  }

  const npx = await runCommand(
    "npx",
    ["-y", "@playwright/cli@latest", "--help"],
    20_000,
    outputDir
  );
  if (npx.ok) {
    return {
      invoker: {
        command: "npx",
        prefixArgs: ["-y", "@playwright/cli@latest"],
        source: "npx",
      },
      diagnostics,
    };
  }

  diagnostics.push({
    code: "assertion_source_snapshot_cli_unavailable",
    level: "warn",
    message:
      "snapshot-cli assertion source unavailable. Install @playwright/cli or ensure playwright-cli is on PATH.",
  });
  return { diagnostics };
}

async function replayStepWithCli(
  invoker: PlaywrightCliInvoker,
  session: string,
  step: Step,
  baseUrl: string | undefined,
  currentPageUrl: string,
  timeoutMs: number,
  outputDir: string,
  runCommand: CommandRunner
): Promise<{
  ok: boolean;
  currentPageUrl: string;
  error?: string;
}> {
  if (step.action === "navigate") {
    const resolvedUrl = resolveNavigateUrl(step.url, baseUrl, currentPageUrl);
    const result = await runCliCode(
      invoker,
      session,
      `await page.goto(${JSON.stringify(resolvedUrl)});`,
      timeoutMs,
      outputDir,
      runCommand
    );
    return {
      ok: result.ok,
      currentPageUrl: resolvedUrl,
      error: result.error ?? result.stderr,
    };
  }

  const locator = buildLocatorExpression(step.target);
  const code = renderStepActionCode(step, locator);
  if (!code) {
    return {
      ok: false,
      currentPageUrl,
      error: `Unsupported step action for snapshot replay: ${step.action}`,
    };
  }

  const result = await runCliCode(
    invoker,
    session,
    code,
    timeoutMs,
    outputDir,
    runCommand
  );
  return {
    ok: result.ok,
    currentPageUrl,
    error: result.error ?? result.stderr,
  };
}

function buildLocatorExpression(target: Target): string {
  const context = buildLocatorContextExpression(target.framePath);
  if (target.kind === "locatorExpression") {
    const expression = target.value.trim();
    if (expression.startsWith("page.")) {
      return expression;
    }
    if (expression.startsWith(".")) {
      return `${context}${expression}`;
    }
    return `${context}.${expression}`;
  }
  return `${context}.locator(${JSON.stringify(target.value)})`;
}

function buildLocatorContextExpression(framePath?: string[]): string {
  let context = "page";
  for (const frameSelector of framePath ?? []) {
    if (!frameSelector.trim()) continue;
    context += `.frameLocator(${JSON.stringify(frameSelector)})`;
  }
  return context;
}

function renderStepActionCode(step: Exclude<Step, { action: "navigate" }>, locator: string): string | undefined {
  switch (step.action) {
    case "click":
      return `await ${locator}.click();`;
    case "fill":
      return `await ${locator}.fill(${JSON.stringify(step.text)});`;
    case "press":
      return `await ${locator}.press(${JSON.stringify(step.key)});`;
    case "check":
      return `await ${locator}.check();`;
    case "uncheck":
      return `await ${locator}.uncheck();`;
    case "hover":
      return `await ${locator}.hover();`;
    case "select":
      return `await ${locator}.selectOption(${JSON.stringify(step.value)});`;
    case "assertVisible":
    case "assertText":
    case "assertValue":
    case "assertChecked":
      return undefined;
  }
}

async function runCliCode(
  invoker: PlaywrightCliInvoker,
  session: string,
  code: string,
  timeoutMs: number,
  outputDir: string,
  runCommand: CommandRunner
): Promise<CommandResult> {
  const functionCode = wrapRunCodeFunction(code);
  return runPlaywrightCliCommandWithInvoker(
    invoker,
    [`-s=${session}`, "run-code", functionCode],
    timeoutMs,
    outputDir,
    runCommand
  );
}

async function captureSnapshotContent(
  invoker: PlaywrightCliInvoker,
  session: string,
  outputDir: string,
  snapshotName: string,
  timeoutMs: number,
  runCommand: CommandRunner
): Promise<string> {
  const snapshotPath = path.join(outputDir, `${snapshotName}.yml`);
  const snapshot = await runPlaywrightCliCommandWithInvoker(
    invoker,
    [`-s=${session}`, "snapshot", "--filename", snapshotPath],
    timeoutMs,
    outputDir,
    runCommand
  );

  if (!snapshot.ok) {
    throw new Error(
      (snapshot.error ?? snapshot.stderr) || "playwright-cli snapshot failed"
    );
  }

  const content = await fs.readFile(snapshotPath, "utf-8").catch(() => "");
  return content;
}

function isAssertionStep(step: Step): boolean {
  return (
    step.action === "assertVisible" ||
    step.action === "assertText" ||
    step.action === "assertValue" ||
    step.action === "assertChecked"
  );
}

function runPlaywrightCliCommandWithInvoker(
  invoker: PlaywrightCliInvoker,
  args: string[],
  timeoutMs: number,
  outputDir: string,
  runCommand: CommandRunner
): Promise<CommandResult> {
  return runCommand(invoker.command, [...invoker.prefixArgs, ...args], timeoutMs, outputDir);
}

function wrapRunCodeFunction(code: string): string {
  return `async (page) => { ${code} }`;
}
