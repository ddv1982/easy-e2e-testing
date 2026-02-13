import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  parseImproveAssertions,
  parseImproveAssertionSource,
  parseImproveProvider,
  resolveImproveProfile,
} from "./improve-profile.js";

describe("resolveImproveProfile", () => {
  it("merges CLI and config with proper precedence", () => {
    const out = resolveImproveProfile(
      {
        apply: false,
        applyAssertions: true,
        llm: false,
        provider: "playwright-cli",
        assertions: "none",
        assertionSource: "snapshot-cli",
        report: "out.json",
      },
      {
        improveProvider: "auto",
        improveApplyMode: "apply",
        improveApplyAssertions: false,
        improveAssertionSource: "deterministic",
        improveAssertions: "candidates",
        llm: {
          enabled: true,
          model: "gemma3:4b",
        },
      }
    );

    expect(out.provider).toBe("playwright-cli");
    expect(out.assertions).toBe("none");
    expect(out.assertionSource).toBe("snapshot-cli");
    expect(out.apply).toBe(false);
    expect(out.applyAssertions).toBe(true);
    expect(out.llmEnabled).toBe(false);
    expect(out.reportPath).toBe("out.json");
  });

  it("uses defaults when omitted", () => {
    const out = resolveImproveProfile({}, {});
    expect(out.provider).toBe("auto");
    expect(out.assertions).toBe("candidates");
    expect(out.assertionSource).toBe("deterministic");
    expect(out.apply).toBe(false);
    expect(out.applyAssertions).toBe(false);
    expect(out.llmEnabled).toBe(false);
    expect(out.llmConfig.model).toBe("gemma3:4b");
  });
});

describe("improve-profile parsing", () => {
  it("accepts valid values", () => {
    expect(parseImproveProvider("PLAYWRIGHT")).toBe("playwright");
    expect(parseImproveAssertions("CANDIDATES")).toBe("candidates");
    expect(parseImproveAssertionSource("SNAPSHOT-CLI")).toBe("snapshot-cli");
  });

  it("rejects invalid values", () => {
    expect(() => parseImproveProvider("mcp")).toThrow(UserError);
    expect(() => parseImproveAssertions("all")).toThrow(UserError);
    expect(() => parseImproveAssertionSource("auto")).toThrow(UserError);
  });
});
