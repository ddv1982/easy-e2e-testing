import { selectorRankResponseSchema, type SelectorRankResponse } from "./schema.js";
import { UserError } from "../../../utils/errors.js";

export interface OllamaSelectorRankInput {
  stepAction: string;
  currentCandidateId: string;
  candidates: Array<{
    id: string;
    value: string;
    kind: string;
    score: number;
    reasonCodes: string[];
  }>;
  snapshotExcerpt?: string;
}

export interface OllamaConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  temperature: number;
  maxOutputTokens: number;
}

export async function rankWithOllama(
  input: OllamaSelectorRankInput,
  config: OllamaConfig
): Promise<SelectorRankResponse> {
  const response = await fetch(toChatEndpoint(config.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.model,
      stream: false,
      format: {
        type: "object",
        properties: {
          selectedCandidateId: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
          reasonCodes: { type: "array", items: { type: "string" } },
        },
        required: ["selectedCandidateId", "confidence", "rationale"],
      },
      options: {
        temperature: config.temperature,
        num_predict: config.maxOutputTokens,
      },
      messages: [
        {
          role: "system",
          content:
            "You are a strict selector ranking assistant. Return valid JSON only. Prefer robust, unique, user-facing selectors.",
        },
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new UserError(
      `Ollama ranking request failed: ${response.status} ${response.statusText}`,
      "Ensure Ollama is running and configured correctly."
    );
  }

  const data = (await response.json()) as { message?: { content?: unknown } };
  const content = data?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new UserError("Ollama returned an empty ranking response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new UserError("Ollama returned non-JSON ranking output.");
  }

  const validated = selectorRankResponseSchema.safeParse(parsed);
  if (!validated.success) {
    throw new UserError("Ollama ranking output failed schema validation.");
  }

  return validated.data;
}

function toChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");
  return `${trimmed}/api/chat`;
}
