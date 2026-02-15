import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import * as fs from "node:fs/promises";
import { UserError } from "./errors.js";

vi.mock("node:fs/promises");

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.access).mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });

  it("should load valid YAML config", async () => {
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

  it("should load config from .yaml extension", async () => {
    const configContent = `
testDir: tests
baseUrl: http://localhost:3000
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toHaveProperty("testDir", "tests");
    expect(config).toHaveProperty("baseUrl", "http://localhost:3000");
  });

  it("should return defaults when config file not found", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" })
    );

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("should reject legacy easy-e2e config filenames", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (filePath) => {
      const file = String(filePath);
      if (file.endsWith("ui-test.config.yaml")) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    vi.mocked(fs.access).mockImplementation(async (filePath) => {
      const file = String(filePath);
      if (file.endsWith("easy-e2e.config.yaml")) {
        return undefined;
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    const run = loadConfig();
    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow(/Legacy config file detected/);
  });

  it("should return defaults when config is invalid YAML", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("invalid: yaml: content:");

    await expect(loadConfig()).rejects.toBeInstanceOf(UserError);
  });

  it("should handle partial config", async () => {
    const configContent = `
testDir: my-tests
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config).toEqual({
      testDir: "my-tests",
    });
  });

  it("should handle empty config file", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("");

    const config = await loadConfig();

    expect(config).toEqual({});
  });

  it("should handle config with all optional fields", async () => {
    const configContent = `
testDir: integration-tests
baseUrl: https://staging.example.com
headed: false
timeout: 15000
delay: 2000
waitForNetworkIdle: false
networkIdleTimeout: 3500
saveFailureArtifacts: true
artifactsDir: ".ui-test-artifacts"
recordSelectorPolicy: reliable
recordBrowser: firefox
recordDevice: "iPhone 13"
recordTestIdAttribute: "data-qa"
recordLoadStorage: ".auth/in.json"
recordSaveStorage: ".auth/out.json"
improveApplyMode: review
improveApplyAssertions: true
improveAssertionSource: snapshot-cli
improveAssertionApplyPolicy: aggressive
improveAssertions: candidates
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const config = await loadConfig();

    expect(config.testDir).toBe("integration-tests");
    expect(config.baseUrl).toBe("https://staging.example.com");
    expect(config).not.toHaveProperty("headed");
    expect(config).not.toHaveProperty("timeout");
    expect(config).not.toHaveProperty("delay");
    expect(config).not.toHaveProperty("waitForNetworkIdle");
    expect(config).not.toHaveProperty("networkIdleTimeout");
    expect(config).not.toHaveProperty("saveFailureArtifacts");
    expect(config).not.toHaveProperty("artifactsDir");
    expect(config).not.toHaveProperty("recordSelectorPolicy");
    expect(config).not.toHaveProperty("recordBrowser");
    expect(config).not.toHaveProperty("recordDevice");
    expect(config).not.toHaveProperty("recordTestIdAttribute");
    expect(config).not.toHaveProperty("recordLoadStorage");
    expect(config).not.toHaveProperty("recordSaveStorage");
    expect(config.improveApplyMode).toBe("review");
    expect(config.improveApplyAssertions).toBe(true);
    expect(config.improveAssertionSource).toBe("snapshot-cli");
    expect(config.improveAssertionApplyPolicy).toBe("aggressive");
    expect(config.improveAssertions).toBe("candidates");
  });

  it("should reject legacy llm config block", async () => {
    const configContent = `
testDir: e2e
llm:
  enabled: true
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const run = loadConfig();
    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow(/local LLM config has been removed and must be deleted/);
  });

  it("should reject legacy improveProvider config key", async () => {
    const configContent = `
testDir: e2e
improveProvider: auto
`;
    vi.mocked(fs.readFile).mockResolvedValue(configContent);

    const run = loadConfig();
    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow(/improve provider config has been removed and must be deleted/);
  });

  it("should reject invalid config types", async () => {
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
