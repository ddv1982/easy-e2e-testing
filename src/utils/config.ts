import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { UserError } from "./errors.js";

const configSchema = z.strictObject({
  testDir: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  startCommand: z.string().min(1).optional(),
  improveApplyMode: z.enum(["review", "apply"]).optional(),
  improveApplyAssertions: z.boolean().optional(),
  improveAssertionSource: z.enum(["deterministic", "snapshot-cli", "snapshot-native"]).optional(),
  improveAssertionApplyPolicy: z.enum(["reliable", "aggressive"]).optional(),
  improveAssertions: z.enum(["none", "candidates"]).optional(),
});

export type UITestConfig = z.infer<typeof configSchema>;

const CONFIG_FILENAMES = ["ui-test.config.yaml"];

export async function loadConfig(): Promise<UITestConfig> {
  for (const filename of CONFIG_FILENAMES) {
    const configPath = path.resolve(filename);
    let content: string;

    try {
      content = await fs.readFile(configPath, "utf-8");
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      const message =
        typeof err === "object" && err !== null && "message" in err
          ? String((err as { message?: unknown }).message)
          : "";

      if (code === "ENOENT" || message.includes("ENOENT")) {
        continue;
      }

      throw new UserError(
        `Failed to read config file: ${filename}`,
        "Check file permissions and try again."
      );
    }

    let parsedYaml: unknown;

    try {
      parsedYaml = yaml.load(content);
    } catch {
      throw new UserError(
        `Invalid YAML syntax in ${filename}`,
        "Fix YAML syntax in the config file and try again."
      );
    }

    if (parsedYaml == null) return {};

    const parsedConfig = configSchema.safeParse(parsedYaml);
    if (!parsedConfig.success) {
      const issues = parsedConfig.error.issues
        .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
        .join("; ");

      throw new UserError(
        `Invalid config in ${filename}: ${issues}`,
        "Expected shape: { testDir?: string, baseUrl?: URL, startCommand?: string, improveApplyMode?: 'review'|'apply', improveApplyAssertions?: boolean, improveAssertionSource?: 'deterministic'|'snapshot-cli'|'snapshot-native', improveAssertionApplyPolicy?: 'reliable'|'aggressive', improveAssertions?: 'none'|'candidates' }."
      );
    }

    return parsedConfig.data;
  }

  return {};
}
