import { describe, expect, it } from "vitest";
import { generateTargetCandidates } from "./candidate-generator.js";

describe("generateTargetCandidates", () => {
  it("includes existing target as first candidate", () => {
    const candidates = generateTargetCandidates({
      value: "text=Save",
      kind: "playwrightSelector",
      source: "manual",
    });

    expect(candidates[0]?.target.value).toBe("text=Save");
    expect(candidates[0]?.source).toBe("current");
  });

  it("derives getByTestId from data-testid engine selector", () => {
    const candidates = generateTargetCandidates({
      value: "data-testid=checkout",
      kind: "playwrightSelector",
      source: "manual",
    });

    expect(candidates.some((item) => item.target.value === "getByTestId('checkout')")).toBe(true);
  });

  it("derives locator expression from css selectors", () => {
    const candidates = generateTargetCandidates({
      value: "#submit",
      kind: "css",
      source: "manual",
    });

    expect(candidates.some((item) => item.target.value === "locator('#submit')")).toBe(true);
  });
});
