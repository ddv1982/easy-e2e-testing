import { describe, expect, it } from "vitest";
import { buildAssertionCandidates } from "./assertion-candidates.js";
import type { StepFinding } from "./report-schema.js";

describe("buildAssertionCandidates", () => {
  it("creates value and checked assertion candidates", () => {
    const findings: StepFinding[] = [
      {
        index: 0,
        action: "fill",
        changed: false,
        oldTarget: { value: "#name", kind: "css", source: "manual" },
        recommendedTarget: { value: "#name", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
      {
        index: 1,
        action: "check",
        changed: false,
        oldTarget: { value: "#agree", kind: "css", source: "manual" },
        recommendedTarget: { value: "#agree", kind: "css", source: "manual" },
        oldScore: 0.5,
        recommendedScore: 0.5,
        confidenceDelta: 0,
        reasonCodes: [],
      },
    ];

    const out = buildAssertionCandidates(
      [
        { action: "fill", target: { value: "#name", kind: "css", source: "manual" }, text: "Alice" },
        { action: "check", target: { value: "#agree", kind: "css", source: "manual" } },
      ],
      findings
    );

    expect(out).toHaveLength(2);
    expect(out[0]?.candidate.action).toBe("assertValue");
    expect(out[1]?.candidate.action).toBe("assertChecked");
  });
});
