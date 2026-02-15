import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import * as fs from "node:fs/promises";
import { UserError } from "./errors.js";

vi.mock("node:fs/promises");

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads valid YAML config", async () => {
    const configContent = `
testDir: e2e-tests
baseUrl: https://example.com
startCommand: npm run dev
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toEqual({
      testDir: "e2e-tests",
      baseUrl: "https://example.com",
      startCommand: "npm run dev",
    });
  });

  it("returns defaults when config file not found", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("returns defaults when config file is empty", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("");

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("rejects invalid YAML", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("invalid: yaml: content:");

    await expect(loadConfig()).rejects.toBeInstanceOf(UserError);
    await expect(loadConfig()).rejects.toThrow(/Invalid YAML syntax/);
  });

  it("accepts canonical config keys", async () => {
    const configContent = `
testDir: integration-tests
baseUrl: https://staging.example.com
startCommand: npm run dev
improveApplyMode: review
improveApplyAssertions: true
improveAssertionSource: snapshot-cli
improveAssertionApplyPolicy: aggressive
improveAssertions: candidates
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toEqual({
      testDir: "integration-tests",
      baseUrl: "https://staging.example.com",
      startCommand: "npm run dev",
      improveApplyMode: "review",
      improveApplyAssertions: true,
      improveAssertionSource: "snapshot-cli",
      improveAssertionApplyPolicy: "aggressive",
      improveAssertions: "candidates",
    });
  });

  it("rejects unknown config keys", async () => {
    const configContent = `
testDir: e2e
timeout: 10000
networkIdleTimeout: 2000
recordBrowser: chromium
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const run = loadConfig();
    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow(/unrecognized key/i);
  });

  it("rejects invalid config types", async () => {
    const configContent = `
testDir: 42
baseUrl: "not-a-url"
startCommand: 123
improveApplyMode: merge
improveApplyAssertions: "yes"
improveAssertionSource: auto
improveAssertionApplyPolicy: safe
improveAssertions: all
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    await expect(loadConfig()).rejects.toBeInstanceOf(UserError);
  });
});
