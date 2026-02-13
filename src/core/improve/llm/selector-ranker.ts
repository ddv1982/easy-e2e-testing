import type { ImproveDiagnostic } from "../report-schema.js";
import type { TargetCandidateScore } from "../candidate-scorer.js";
import { rankWithOllama, type OllamaConfig } from "./ollama-client.js";

export interface SelectorRankOptions {
  llmEnabled: boolean;
  llmConfig: OllamaConfig;
  action: string;
  currentCandidateId: string;
  snapshotExcerpt?: string;
}

export interface SelectorRankResult {
  selected: TargetCandidateScore;
  llmUsed: boolean;
  diagnostics: ImproveDiagnostic[];
}

export async function rankSelectorCandidates(
  scored: TargetCandidateScore[],
  options: SelectorRankOptions
): Promise<SelectorRankResult> {
  if (scored.length === 0) {
    throw new Error("Cannot rank empty candidate list.");
  }

  const diagnostics: ImproveDiagnostic[] = [];
  const deterministic = scored[0];

  if (!options.llmEnabled) {
    return {
      selected: deterministic,
      llmUsed: false,
      diagnostics,
    };
  }

  try {
    const llm = await rankWithOllama(
      {
        stepAction: options.action,
        currentCandidateId: options.currentCandidateId,
        candidates: scored.map((item) => ({
          id: item.candidate.id,
          value: item.candidate.target.value,
          kind: item.candidate.target.kind,
          score: item.score,
          reasonCodes: item.reasonCodes,
        })),
        snapshotExcerpt: options.snapshotExcerpt,
      },
      options.llmConfig
    );

    const selected =
      scored.find((item) => item.candidate.id === llm.selectedCandidateId) ?? deterministic;

    diagnostics.push({
      code: "llm_ranking_used",
      level: "info",
      message: `LLM selected candidate ${selected.candidate.id} (confidence=${llm.confidence.toFixed(2)}).`,
    });

    return {
      selected,
      llmUsed: true,
      diagnostics,
    };
  } catch (err) {
    diagnostics.push({
      code: "llm_ranking_fallback",
      level: "warn",
      message:
        err instanceof Error
          ? `LLM ranking failed; using deterministic ranking. ${err.message}`
          : "LLM ranking failed; using deterministic ranking.",
    });

    return {
      selected: deterministic,
      llmUsed: false,
      diagnostics,
    };
  }
}
