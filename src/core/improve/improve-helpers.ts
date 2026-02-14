import path from "node:path";
import type { Target, Step } from "../yaml-schema.js";
import type {
  AssertionApplyStatus,
  AssertionCandidate,
  AssertionCandidateSource,
} from "./report-schema.js";
import type { TargetCandidateScore } from "./candidate-scorer.js";

export function isFallbackTarget(target: Target): boolean {
  return (
    target.kind === "css" ||
    target.kind === "xpath" ||
    target.kind === "internal" ||
    target.kind === "unknown"
  );
}

export function defaultReportPath(testPath: string): string {
  const ext = path.extname(testPath);
  const base = ext ? testPath.slice(0, -ext.length) : testPath;
  return `${base}.improve-report.json`;
}

export function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildOriginalToRuntimeIndex(
  outputStepOriginalIndexes: number[]
): Map<number, number> {
  const out = new Map<number, number>();
  for (
    let runtimeIndex = 0;
    runtimeIndex < outputStepOriginalIndexes.length;
    runtimeIndex += 1
  ) {
    const originalIndex = outputStepOriginalIndexes[runtimeIndex];
    if (originalIndex === undefined) continue;
    out.set(originalIndex, runtimeIndex);
  }
  return out;
}

export function buildOutputStepOriginalIndexes(
  steps: Step[],
  staleAssertionIndexes: number[],
  removeStaleAssertions: boolean
): number[] {
  if (!removeStaleAssertions || staleAssertionIndexes.length === 0) {
    return steps.map((_, index) => index);
  }

  const staleIndexSet = new Set(staleAssertionIndexes);
  const out: number[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    if (staleIndexSet.has(index)) continue;
    out.push(index);
  }

  return out;
}

export function chooseDeterministicSelection(
  scored: TargetCandidateScore[],
  fallback: TargetCandidateScore
): TargetCandidateScore {
  if (scored.length === 0) return fallback;

  const first = scored[0];
  if (!first) return fallback;
  let best = first;
  for (let index = 1; index < scored.length; index += 1) {
    const candidate = scored[index];
    if (!candidate) continue;
    if (candidate.score > best.score) {
      best = candidate;
    }
  }
  return best;
}

export function dedupeAssertionCandidates(
  candidates: AssertionCandidate[]
): AssertionCandidate[] {
  const seen = new Set<string>();
  const out: AssertionCandidate[] = [];

  for (const candidate of candidates) {
    const key = assertionCandidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function assertionCandidateKey(candidate: AssertionCandidate): string {
  const candidateStep = candidate.candidate;
  const targetKey =
    candidateStep.action === "navigate"
      ? `navigate:${candidateStep.url}`
      : normalizeTargetKey(candidateStep.target);

  return [
    candidate.index,
    candidateStep.action,
    targetKey,
    "text" in candidateStep ? candidateStep.text : "",
    "value" in candidateStep ? candidateStep.value : "",
    candidateStep.action === "assertChecked"
      ? String(candidateStep.checked ?? true)
      : "",
  ].join("|");
}

function normalizeTargetKey(target: Target): string {
  const framePath = target.framePath ?? [];
  return [target.kind, target.value.trim().toLowerCase(), framePath.join(">")].join(
    "|"
  );
}

export function buildAssertionApplyStatusCounts(
  candidates: AssertionCandidate[]
): Partial<Record<AssertionApplyStatus, number>> {
  const counts: Partial<Record<AssertionApplyStatus, number>> = {};
  for (const candidate of candidates) {
    if (!candidate.applyStatus) continue;
    counts[candidate.applyStatus] = (counts[candidate.applyStatus] ?? 0) + 1;
  }
  return counts;
}

export function buildAssertionCandidateSourceCounts(
  candidates: AssertionCandidate[]
): Partial<Record<AssertionCandidateSource, number>> {
  const counts: Partial<Record<AssertionCandidateSource, number>> = {};
  for (const candidate of candidates) {
    if (!candidate.candidateSource) continue;
    counts[candidate.candidateSource] =
      (counts[candidate.candidateSource] ?? 0) + 1;
  }
  return counts;
}
