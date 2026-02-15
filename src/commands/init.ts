import type { Command } from "commander";
import * as prompts from "@inquirer/prompts";
import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { ui } from "../utils/ui.js";
import { handleError } from "../utils/errors.js";
import { GITHUB_ONE_OFF_PREFIX, resolveCommandPrefix } from "../utils/runtime-info.js";

interface UITestConfig {
  testDir: string;
  baseUrl: string;
  startCommand?: string;
}

interface PromptApi {
  input: typeof prompts.input;
  select: typeof prompts.select;
}

type InitIntent = "example" | "running" | "custom";

const DEFAULT_BASE_ORIGIN = "http://127.0.0.1";
const DEFAULT_PORT = "5173";
const DEFAULT_TEST_DIR = "e2e";
const DEFAULT_INIT_INTENT: InitIntent = "example";

export function registerInit(program: Command) {
  program
    .command("init")
    .description("Set up a new ui-test project")
    .option("-y, --yes", "Use defaults without interactive prompts")
    .action(async (opts: unknown) => {
      try {
        await runInit(parseInitOptions(opts));
      } catch (err) {
        handleError(err);
      }
    });
}

async function runInit(
  opts: { yes?: boolean; promptApi?: PromptApi } = {}
) {
  ui.heading("ui-test project setup");
  console.log();

  const useDefaults = opts.yes ?? false;
  const promptApi = opts.promptApi ?? prompts;
  const commandPrefix = resolveCommandPrefix();
  const testDir = useDefaults
    ? DEFAULT_TEST_DIR
    : await promptApi.input({
        message: "Where should tests be stored?",
        default: DEFAULT_TEST_DIR,
      });

  const intent = useDefaults
    ? DEFAULT_INIT_INTENT
    : await promptApi.select<InitIntent>({
        message: "What are you testing?",
        default: DEFAULT_INIT_INTENT,
        choices: [
          { name: "Built-in example app", value: "example" },
          { name: "Already-running website", value: "running" },
          { name: "Custom app with start command", value: "custom" },
        ],
      });

  const baseOrigin = useDefaults
    ? DEFAULT_BASE_ORIGIN
    : await promptApi.input({
        message: "What is your application's base URL? (protocol + host)",
        default: DEFAULT_BASE_ORIGIN,
        validate: validateBaseOrigin,
      });

  const portInput = useDefaults
    ? DEFAULT_PORT
    : await promptApi.input({
        message: "Port (optional, blank to use URL default):",
        default: DEFAULT_PORT,
        validate: validatePortInput,
      });

  const baseUrl = buildBaseUrl(baseOrigin, portInput);
  const defaultStartCommand = buildDefaultStartCommand(baseUrl, commandPrefix);

  const startCommand =
    intent === "example"
      ? defaultStartCommand
      : intent === "custom"
        ? await promptApi.input({
            message: "App start command? (required for auto-start with `ui-test play`)",
            default: defaultStartCommand,
            validate: (v) => (v.trim().length > 0 ? true : "Start command is required"),
          })
        : "";

  const config: UITestConfig = {
    testDir,
    baseUrl,
    ...(startCommand.trim().length > 0 ? { startCommand: startCommand.trim() } : {}),
  };

  const configPath = path.resolve("ui-test.config.yaml");
  await fs.writeFile(configPath, yaml.dump(config, { quotingType: '"' }), "utf-8");

  await fs.mkdir(path.resolve(testDir), { recursive: true });

  const samplePath = path.join(path.resolve(testDir), "example.yaml");
  const sampleExists = await fs.access(samplePath).then(() => true).catch(() => false);
  const sample = {
    name: "Example Test",
    description: "A sample test to get you started",
    steps: [
      { action: "navigate", url: "/" },
      {
        action: "assertVisible",
        description: "App root is visible",
        target: {
          value: "#app",
          kind: "css",
          source: "manual",
        },
      },
    ],
  };

  if (!sampleExists) {
    await fs.writeFile(samplePath, yaml.dump(sample, { quotingType: '"' }), "utf-8");
    ui.step(`Created sample test: ${samplePath}`);
  } else {
    ui.step(`Sample test already exists; keeping as-is: ${samplePath}`);
  }

  console.log();
  ui.success(`Config saved to ${configPath}`);
  ui.success(`Test directory created: ${testDir}/`);
  console.log();
  ui.info("Next steps:");
  if (config.startCommand) {
    ui.step(`Run tests (auto-starts app): ${commandPrefix} play`);
    ui.step(`Manual mode app start: ${config.startCommand}`);
    ui.step(`Manual mode test run: ${commandPrefix} play --no-start`);
  } else {
    ui.step("Start your app manually.");
    ui.step(`Run tests against running app: ${commandPrefix} play --no-start`);
    ui.dim(
      `Tip: \`${commandPrefix} play\` without --no-start expects \`startCommand\` in config or a reachable baseUrl.`
    );
  }
  ui.step(`Record a test: ${commandPrefix} record`);
  ui.step(`List tests: ${commandPrefix} list`);
  ui.dim("Tip: update ui-test.config.yaml baseUrl if your app runs on a different host or port.");
}

function validateBaseOrigin(value: string): true | string {
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Protocol must be http:// or https://";
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return "Enter only protocol + host (no path/query/hash)";
    }
    return true;
  } catch {
    return "Enter a valid URL like http://localhost or https://example.com";
  }
}

function validatePortInput(value: string): true | string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;

  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "Port must be blank or an integer between 1 and 65535";
  }
  return true;
}

function buildBaseUrl(baseOrigin: string, portInput: string): string {
  const parsed = new URL(baseOrigin.trim());
  const trimmedPort = portInput.trim();

  if (trimmedPort.length > 0) {
    parsed.port = String(Number(trimmedPort));
  }

  return `${parsed.protocol}//${parsed.host}`;
}

function buildDefaultStartCommand(
  baseUrl: string,
  commandPrefix = "ui-test"
): string {
  try {
    const parsed = new URL(baseUrl);
    const isHttp = parsed.protocol === "http:";
    const isLocalHost =
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1";

    if (!isHttp || !isLocalHost) {
      return "";
    }

    const port = parsed.port || "80";
    const preferredCommand = `${commandPrefix} example-app --host ${parsed.hostname} --port ${port}`;
    if (commandPrefix === GITHUB_ONE_OFF_PREFIX) {
      return preferredCommand;
    }

    const oneOffFallbackCommand = `${GITHUB_ONE_OFF_PREFIX} example-app --host ${parsed.hostname} --port ${port}`;
    return `${preferredCommand} || ${oneOffFallbackCommand}`;
  } catch {
    return "";
  }
}

function parseInitOptions(value: unknown): {
  yes?: boolean;
  promptApi?: PromptApi;
} {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    yes: asOptionalBoolean(record.yes),
    promptApi: isPromptApi(record.promptApi) ? record.promptApi : undefined,
  };
}

function isPromptApi(value: unknown): value is PromptApi {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.input === "function" &&
    typeof record.select === "function"
  );
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export {
  DEFAULT_BASE_ORIGIN,
  DEFAULT_PORT,
  DEFAULT_TEST_DIR,
  DEFAULT_INIT_INTENT,
  buildBaseUrl,
  buildDefaultStartCommand,
  validateBaseOrigin,
  validatePortInput,
  runInit,
};
