import type { Command } from "commander";
import { handleError, UserError } from "../utils/errors.js";
import { runImprove, type ImproveCliOptions } from "../app/services/improve-service.js";

export function registerImprove(program: Command) {
  program
    .command("improve")
    .description("Analyze and improve recorded selectors")
    .argument("<test-file>", "Path to the YAML test file to analyze")
    .option("--apply", "Apply all improvements (selectors and assertions)")
    .option("--no-apply", "Force review mode and do not write any changes")
    .option("--apply-selectors", "Apply selector improvements only")
    .option("--no-apply-selectors", "Do not apply selector improvements")
    .option("--apply-assertions", "Apply high-confidence assertion candidates to the YAML file")
    .option("--no-apply-assertions", "Do not apply assertion candidates for this run")
    .option("--assertions <mode>", "Assertion mode: none or candidates")
    .option(
      "--assertion-source <source>",
      "Assertion source: deterministic, snapshot-cli (requires playwright-cli), or snapshot-native"
    )
    .option(
      "--assertion-apply-policy <policy>",
      "Assertion apply policy: reliable (default) or aggressive"
    )
    .option("--report <path>", "Write JSON report to a custom path")
    .action(async (testFile: unknown, opts: unknown) => {
      try {
        await runImprove(
          parseRequiredArgument(testFile, "test-file"),
          parseImproveCliOptions(opts)
        );
      } catch (err) {
        handleError(err);
      }
    });
}

function parseImproveCliOptions(value: unknown): ImproveCliOptions {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    apply: asOptionalBoolean(record.apply),
    applySelectors: asOptionalBoolean(record.applySelectors),
    applyAssertions: asOptionalBoolean(record.applyAssertions),
    assertions: asOptionalString(record.assertions),
    assertionSource: asOptionalString(record.assertionSource),
    assertionApplyPolicy: asOptionalString(record.assertionApplyPolicy),
    report: asOptionalString(record.report),
  };
}

function parseRequiredArgument(value: unknown, name: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new UserError(`Missing required argument: ${name}`);
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
