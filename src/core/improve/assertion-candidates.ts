import type { AssertionCandidate, StepFinding } from "./report-schema.js";
import type { Step } from "../yaml-schema.js";

const CLICK_ASSERT_MIN_CONFIDENCE = 0.85;

export function buildAssertionCandidates(
  steps: Step[],
  findings: StepFinding[]
): AssertionCandidate[] {
  const byIndex = new Map<number, StepFinding>();
  for (const finding of findings) {
    byIndex.set(finding.index, finding);
  }

  const out: AssertionCandidate[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.action === "navigate") continue;

    const finding = byIndex.get(index);
    const target = finding?.recommendedTarget ?? step.target;
    const confidence = finding ? clamp01(finding.recommendedScore) : 0.5;

    if (step.action === "fill") {
      out.push({
        index,
        afterAction: step.action,
        candidate: { action: "assertValue", target, value: step.text },
        confidence: Math.max(0.7, confidence),
        rationale: "Filled input values are stable candidates for value assertions.",
      });
      continue;
    }

    if (step.action === "select") {
      out.push({
        index,
        afterAction: step.action,
        candidate: { action: "assertValue", target, value: step.value },
        confidence: Math.max(0.7, confidence),
        rationale: "Selected options can be validated with an assertValue step.",
      });
      continue;
    }

    if (step.action === "check" || step.action === "uncheck") {
      out.push({
        index,
        afterAction: step.action,
        candidate: {
          action: "assertChecked",
          target,
          checked: step.action === "check",
        },
        confidence: Math.max(0.75, confidence),
        rationale: "Check state transitions map directly to assertChecked.",
      });
      continue;
    }

    if ((step.action === "click" || step.action === "press") && confidence >= CLICK_ASSERT_MIN_CONFIDENCE) {
      out.push({
        index,
        afterAction: step.action,
        candidate: {
          action: "assertVisible",
          target,
        },
        confidence,
        rationale: "High-confidence interactions can be followed by visibility assertions.",
      });
    }
  }

  return out;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
