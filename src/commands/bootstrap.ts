import type { Command } from "commander";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runOnboardingPlan,
  type BootstrapMode,
  type OnboardingPlan,
  resolveInstallArgs,
  runInstallPlaywrightCli,
} from "../app/services/onboarding-service.js";
import { handleError, UserError } from "../utils/errors.js";

const MIN_NODE_MAJOR = 18;

const HELP_TEXT = `
ui-test bootstrap

Usage:
  ui-test bootstrap [mode] [options]

Modes:
  install       Install project dependencies and Playwright-CLI tooling
  init          Run ui-test init (passes through args to "ui-test init") and provision Chromium
  quickstart    Run install + init (default mode). Add --run-play to execute "ui-test play"

Options:
  --run-play    (quickstart only) run "ui-test play" after onboarding
  -h, --help    Show help

Examples:
  ui-test bootstrap install
  ui-test bootstrap init --yes
  ui-test bootstrap quickstart --run-play
  ui-test bootstrap quickstart -- --yes

One-off fallback:
  npx -y github:ddv1982/easy-e2e-testing bootstrap quickstart
`.trim();

interface ParsedBootstrapArgs extends OnboardingPlan {
  showHelp: boolean;
}

export function registerBootstrap(program: Command) {
  program
    .command("bootstrap [mode] [args...]")
    .description("Install dependencies and run onboarding/play for first-time setup")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption(false)
    .action(async (_mode: unknown, _args: unknown, command: Command) => {
      try {
        await runBootstrap(extractRawBootstrapArgs(command));
      } catch (err) {
        handleError(err);
      }
    });
}

function extractRawBootstrapArgs(command: Command): string[] {
  void command;
  const rawArgs = process.argv;
  const commandIndex = rawArgs.indexOf("bootstrap");
  return commandIndex === -1 ? [] : rawArgs.slice(commandIndex + 1);
}

async function runBootstrap(argv: string[]): Promise<void> {
  ensureNodeVersion();
  const parsed = parseBootstrapArgs(argv);

  if (parsed.showHelp) {
    console.log(HELP_TEXT);
    return;
  }

  await runOnboardingPlan(parsed, {
    uiTestCliEntry: resolveUiTestCliEntry(),
  });
}

function parseBootstrapArgs(argv: string[]): ParsedBootstrapArgs {
  let mode: BootstrapMode = "quickstart";
  let rest = argv;

  const maybeMode = argv[0];
  if (maybeMode && !maybeMode.startsWith("-")) {
    if (maybeMode !== "install" && maybeMode !== "init" && maybeMode !== "quickstart") {
      throw new UserError(`Unknown mode: ${maybeMode}`);
    }
    mode = maybeMode;
    rest = argv.slice(1);
  }

  if (mode === "init") {
    return {
      mode,
      runPlay: false,
      initArgs: rest,
      showHelp: false,
    };
  }

  if (mode === "install") {
    if (rest.includes("-h") || rest.includes("--help")) {
      return {
        mode,
        runPlay: false,
        initArgs: [],
        showHelp: true,
      };
    }

    if (rest.length > 0) {
      throw new UserError("install mode does not accept extra arguments.");
    }
    return {
      mode,
      runPlay: false,
      initArgs: [],
      showHelp: false,
    };
  }

  const separatorIndex = rest.indexOf("--");
  const quickstartOptions = separatorIndex === -1 ? rest : rest.slice(0, separatorIndex);
  const initArgs = separatorIndex === -1 ? [] : rest.slice(separatorIndex + 1);

  if (quickstartOptions.includes("-h") || quickstartOptions.includes("--help")) {
    return {
      mode,
      runPlay: false,
      initArgs: [],
      showHelp: true,
    };
  }

  let runPlay = false;
  for (const option of quickstartOptions) {
    if (option === "--run-play") {
      runPlay = true;
      continue;
    }
    throw new UserError(
      `Unknown quickstart option: ${option}. Use "--" before init flags.`
    );
  }

  return {
    mode,
    runPlay,
    initArgs,
    showHelp: false,
  };
}

function ensureNodeVersion() {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  if (!Number.isInteger(major) || major < MIN_NODE_MAJOR) {
    throw new UserError(
      `Node.js ${MIN_NODE_MAJOR}+ is required. Current version: ${process.versions.node}`
    );
  }
}

function resolveUiTestCliEntry(): string {
  const commandsDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(commandsDir, "..", "bin", "ui-test.js");
}

export {
  parseBootstrapArgs,
  resolveInstallArgs,
  resolveUiTestCliEntry,
  runBootstrap,
  runInstallPlaywrightCli,
};
