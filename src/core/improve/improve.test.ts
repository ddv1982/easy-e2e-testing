import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserError } from "../../utils/errors.js";

const { chromiumLaunchMock, runImproveSelectorPassMock, runImproveAssertionPassMock } = vi.hoisted(
  () => ({
    chromiumLaunchMock: vi.fn(),
    runImproveSelectorPassMock: vi.fn(),
    runImproveAssertionPassMock: vi.fn(),
  })
);

vi.mock("playwright", () => ({
  chromium: {
    launch: chromiumLaunchMock,
  },
}));

vi.mock("./improve-selector-pass.js", () => ({
  runImproveSelectorPass: runImproveSelectorPassMock,
}));

vi.mock("./improve-assertion-pass.js", () => ({
  runImproveAssertionPass: runImproveAssertionPassMock,
}));

import { improveTestFile } from "./improve.js";

function createBrowserMock() {
  return {
    newPage: vi.fn(async () => ({})),
    close: vi.fn(async () => {}),
  };
}

describe("improveTestFile runner", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.resetAllMocks();

    chromiumLaunchMock.mockResolvedValue(createBrowserMock());
    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [],
    }));
    runImproveAssertionPassMock.mockImplementation(async (input) => ({
      outputSteps: input.outputSteps,
      assertionCandidates: [],
      appliedAssertions: 0,
      skippedAssertions: 0,
    }));
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  async function writeSampleYaml(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      `name: sample\nsteps:\n  - action: navigate\n    url: https://example.com\n  - action: click\n    target:\n      value: "#submit"\n      kind: css\n      source: manual\n`,
      "utf-8"
    );
    return yamlPath;
  }

  async function writeYamlWithTransientStep(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "transient.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: transient",
        "baseUrl: https://example.com",
        "steps:",
        "  - action: navigate",
        '    url: "/"',
        "  - action: click",
        "    target:",
        '      value: "#cookie-accept"',
        "      kind: css",
        "      source: manual",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n") + "\n",
      "utf-8"
    );
    return yamlPath;
  }

  it("fails in review mode when chromium is unavailable", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
  });

  it("fails in apply mode with explicit remediation hint", async () => {
    chromiumLaunchMock.mockRejectedValueOnce(new Error("Executable doesn't exist"));
    const yamlPath = await writeSampleYaml();

    const run = improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });

    await expect(run).rejects.toBeInstanceOf(UserError);
    await expect(run).rejects.toThrow("Chromium browser is not installed.");
    await expect(run).rejects.toMatchObject({
      hint: expect.stringContaining("ui-test setup"),
    });
  });

  it("writes default report with playwright provider", async () => {
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.reportPath).toBe(path.join(path.dirname(yamlPath), "sample.improve-report.json"));
    expect(result.report.providerUsed).toBe("playwright");
    expect(result.outputPath).toBeUndefined();

    const savedReport = JSON.parse(await fs.readFile(result.reportPath, "utf-8")) as {
      providerUsed: string;
    };
    expect(savedReport.providerUsed).toBe("playwright");
  });

  it("marks runtime-failing steps as optional in apply mode", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    expect(
      result.report.diagnostics.some((d) => d.code === "runtime_failing_step_marked_optional")
    ).toBe(true);

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("cookie-accept");
    expect(written).toContain("submit");
    expect(written).toContain("optional: true");
    expect(written).toContain("timeout: 2000");
  });

  it("does not mark navigate steps as optional even if they fail", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [0, 1],
    }));

    await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: false,
      assertions: "none",
    });

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("navigate");
    expect(written).toContain("cookie-accept");
    // Only the cookie-accept click step should be marked optional, not the navigate step
    const optionalCount = (written.match(/optional: true/g) ?? []).length;
    expect(optionalCount).toBe(1);
    // The navigate step block should not contain optional
    const navigateBlock = written.split("- action: navigate")[1]?.split("  - ")[0] ?? "";
    expect(navigateBlock).not.toContain("optional");
  });

  it("passes all indexes and snapshots to assertion pass when steps are marked optional", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [
        { index: 0, step: {} as any, preSnapshot: "a", postSnapshot: "a" },
        { index: 1, step: {} as any, preSnapshot: "b", postSnapshot: "b" },
        { index: 2, step: {} as any, preSnapshot: "c", postSnapshot: "c" },
      ],
      failedStepIndexes: [1],
    }));

    await improveTestFile({
      testFile: yamlPath,
      applySelectors: true,
      applyAssertions: true,
      assertions: "candidates",
    });

    const assertionCallArgs = runImproveAssertionPassMock.mock.calls[0][0];
    expect(assertionCallArgs.outputSteps).toHaveLength(3);
    expect(assertionCallArgs.outputStepOriginalIndexes).toHaveLength(3);
    expect(assertionCallArgs.nativeStepSnapshots).toHaveLength(3);
    expect(assertionCallArgs.nativeStepSnapshots[0].index).toBe(0);
    expect(assertionCallArgs.nativeStepSnapshots[1].index).toBe(1);
    expect(assertionCallArgs.nativeStepSnapshots[2].index).toBe(2);
  });

  it("does not mark steps as optional in report-only mode", async () => {
    const yamlPath = await writeYamlWithTransientStep();

    runImproveSelectorPassMock.mockImplementation(async (input) => ({
      outputSteps: input.steps,
      findings: [],
      nativeStepSnapshots: [],
      failedStepIndexes: [1],
    }));

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: false,
      assertions: "none",
    });

    expect(result.outputPath).toBeUndefined();
    expect(
      result.report.diagnostics.some((d) => d.code === "runtime_failing_step_marked_optional")
    ).toBe(false);

    const written = await fs.readFile(yamlPath, "utf-8");
    expect(written).toContain("cookie-accept");
  });

  it("downgrades applyAssertions when assertions mode is none", async () => {
    const yamlPath = await writeSampleYaml();

    const result = await improveTestFile({
      testFile: yamlPath,
      applySelectors: false,
      applyAssertions: true,
      assertions: "none",
    });

    expect(runImproveAssertionPassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        applyAssertions: false,
        assertions: "none",
      })
    );
    expect(
      result.report.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "apply_assertions_disabled_by_assertions_none" &&
          diagnostic.level === "warn"
      )
    ).toBe(true);
  });
});
