import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeRuntimeStepMock } = vi.hoisted(() => ({
  executeRuntimeStepMock: vi.fn(async () => {}),
}));

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newPage: vi.fn(async () => ({ url: () => "about:blank" })),
      close: vi.fn(async () => {}),
    })),
  },
}));

vi.mock("../runtime/step-executor.js", () => ({
  executeRuntimeStep: executeRuntimeStepMock,
}));

vi.mock("./candidate-generator.js", () => ({
  generateTargetCandidates: vi.fn(() => [
    {
      id: "current-1",
      source: "current",
      target: { value: "#submit", kind: "css", source: "manual" },
      reasonCodes: ["existing_target"],
    },
    {
      id: "derived-1",
      source: "derived",
      target: { value: "getByRole('button', { name: 'Save' })", kind: "locatorExpression", source: "manual" },
      reasonCodes: ["derived_target"],
    },
  ]),
}));

vi.mock("./candidate-scorer.js", () => ({
  scoreTargetCandidates: vi.fn(async () => [
    {
      candidate: {
        id: "current-1",
        source: "current",
        target: { value: "#submit", kind: "css", source: "manual" },
        reasonCodes: ["existing_target"],
      },
      score: 0.2,
      baseScore: 0.2,
      uniquenessScore: 0.2,
      visibilityScore: 0,
      matchCount: 2,
      runtimeChecked: true,
      reasonCodes: ["existing_target"],
    },
    {
      candidate: {
        id: "derived-1",
        source: "derived",
        target: { value: "getByRole('button', { name: 'Save' })", kind: "locatorExpression", source: "manual" },
        reasonCodes: ["derived_target"],
      },
      score: 0.9,
      baseScore: 0.9,
      uniquenessScore: 1,
      visibilityScore: 1,
      matchCount: 1,
      runtimeChecked: true,
      reasonCodes: ["derived_target", "unique_match"],
    },
  ]),
  shouldAdoptCandidate: vi.fn(() => true),
}));

vi.mock("./llm/selector-ranker.js", () => ({
  rankSelectorCandidates: vi.fn(async (scored) => ({
    selected: scored[1],
    llmUsed: false,
    diagnostics: [],
  })),
}));

vi.mock("./assertion-candidates.js", () => ({
  buildAssertionCandidates: vi.fn(() => []),
}));

vi.mock("./providers/provider-selector.js", () => ({
  selectImproveProvider: vi.fn(async () => ({
    providerUsed: "playwright",
    diagnostics: [],
  })),
}));

import { improveTestFile } from "./improve.js";

describe("improve apply runtime replay", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    executeRuntimeStepMock.mockClear();
  });

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("replays using updated step target after apply adoption", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ui-test-improve-apply-"));
    tempDirs.push(dir);

    const yamlPath = path.join(dir, "sample.yaml");
    await fs.writeFile(
      yamlPath,
      [
        "name: sample",
        "steps:",
        "  - action: navigate",
        "    url: https://example.com",
        "  - action: click",
        "    target:",
        '      value: "#submit"',
        "      kind: css",
        "      source: manual",
      ].join("\n"),
      "utf-8"
    );

    const result = await improveTestFile({
      testFile: yamlPath,
      apply: true,
      provider: "playwright",
      assertions: "none",
      llmEnabled: false,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.outputPath).toBe(yamlPath);
    expect(executeRuntimeStepMock).toHaveBeenCalledTimes(2);

    const secondStepArg = executeRuntimeStepMock.mock.calls[1]?.[1] as {
      action: string;
      target?: { value: string };
    };
    expect(secondStepArg.action).toBe("click");
    expect(secondStepArg.target?.value).toBe("getByRole('button', { name: 'Save' })");

    const saved = await fs.readFile(yamlPath, "utf-8");
    expect(saved).toContain("getByRole('button', { name: 'Save' })");
  });
});
