import { fileURLToPath } from "node:url";
import type {
  RunInteractiveCommand,
} from "./contracts/process-runner.js";

export type CodegenBrowser = "chromium" | "firefox" | "webkit";

export interface CodegenRunOptions {
  url: string;
  outputFile: string;
  browser: CodegenBrowser;
  device?: string;
  testIdAttribute?: string;
  loadStorage?: string;
  saveStorage?: string;
}

export async function runCodegen(
  playwrightBin: string,
  options: CodegenRunOptions,
  runInteractiveCommand: RunInteractiveCommand
): Promise<void> {
  const argsCore = [
    "codegen",
    "--target",
    "playwright-test",
    "--output",
    options.outputFile,
    "--browser",
    options.browser,
  ];

  if (options.device?.trim()) {
    argsCore.push("--device", options.device.trim());
  }
  if (options.testIdAttribute?.trim()) {
    argsCore.push("--test-id-attribute", options.testIdAttribute.trim());
  }
  if (options.loadStorage?.trim()) {
    argsCore.push("--load-storage", options.loadStorage.trim());
  }
  if (options.saveStorage?.trim()) {
    argsCore.push("--save-storage", options.saveStorage.trim());
  }

  argsCore.push(options.url);
  const args = playwrightBin === "npx" ? ["playwright", ...argsCore] : argsCore;
  const result = await runInteractiveCommand(playwrightBin, args, {
    stdio: ["inherit", "inherit", "inherit"],
  });

  if (result.exitCode === 0) return;
  if (result.signal) {
    throw new Error(`Playwright codegen exited via signal ${result.signal}`);
  }
  throw new Error(`Playwright codegen exited with code ${result.exitCode ?? "unknown"}`);
}

export function resolvePlaywrightCliPath(pathOrFileUrl: string): string {
  return pathOrFileUrl.startsWith("file://")
    ? fileURLToPath(pathOrFileUrl)
    : pathOrFileUrl;
}
