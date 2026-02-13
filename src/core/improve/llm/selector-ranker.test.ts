import { afterEach, describe, expect, it, vi } from "vitest";

const { rankWithOllamaMock } = vi.hoisted(() => ({
  rankWithOllamaMock: vi.fn(),
}));
vi.mock("./ollama-client.js", () => ({
  rankWithOllama: rankWithOllamaMock,
}));

import { rankSelectorCandidates } from "./selector-ranker.js";
import type { TargetCandidateScore } from "../candidate-scorer.js";

function makeScore(
  id: string,
  score: number,
  source: "current" | "derived" = "current"
): TargetCandidateScore {
  return {
    candidate: {
      id,
      source,
      target: { value: `locator('#${id}')`, kind: "locatorExpression", source: "manual" },
      reasonCodes: [],
    },
    score,
    baseScore: score,
    uniquenessScore: 0,
    visibilityScore: 0,
    runtimeChecked: false,
    reasonCodes: [],
  };
}

describe("rankSelectorCandidates", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses deterministic winner when llm is disabled", async () => {
    const result = await rankSelectorCandidates([makeScore("a", 0.9), makeScore("b", 0.5)], {
      llmEnabled: false,
      action: "click",
      currentCandidateId: "a",
      snapshotExcerpt: undefined,
      llmConfig: {
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma3:4b",
        timeoutMs: 1000,
        temperature: 0,
        maxOutputTokens: 100,
      },
    });

    expect(result.llmUsed).toBe(false);
    expect(result.selected.candidate.id).toBe("a");
    expect(rankWithOllamaMock).not.toHaveBeenCalled();
  });

  it("passes through real current candidate id when llm is enabled", async () => {
    rankWithOllamaMock.mockResolvedValue({
      selectedCandidateId: "b",
      confidence: 0.9,
      rationale: "prefer candidate b",
    });

    const result = await rankSelectorCandidates(
      [makeScore("b", 0.95, "derived"), makeScore("a", 0.8, "current")],
      {
        llmEnabled: true,
        action: "click",
        currentCandidateId: "a",
        snapshotExcerpt: "snapshot",
        llmConfig: {
          baseUrl: "http://127.0.0.1:11434",
          model: "gemma3:4b",
          timeoutMs: 1000,
          temperature: 0,
          maxOutputTokens: 100,
        },
      }
    );

    expect(rankWithOllamaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentCandidateId: "a",
      }),
      expect.any(Object)
    );
    expect(result.llmUsed).toBe(true);
    expect(result.selected.candidate.id).toBe("b");
  });
});
