import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  parseImproveAssertions,
  parseImproveAssertionSource,
  resolveImproveProfile,
} from "./improve-profile.js";

describe("resolveImproveProfile", () => {
  it("merges CLI and config with proper precedence", () => {
    const out = resolveImproveProfile(
      {
        apply: false,
        applyAssertions: true,
        assertions: "none",
        assertionSource: "snapshot-cli",
        report: "out.json",
      },
      {
        improveApplyMode: "apply",
        improveApplyAssertions: false,
        improveAssertionSource: "deterministic",
        improveAssertions: "candidates",
      }
    );

    expect(out.assertions).toBe("none");
    expect(out.assertionSource).toBe("snapshot-cli");
    expect(out.applySelectors).toBe(false);
    expect(out.applyAssertions).toBe(true);
    expect(out.reportPath).toBe("out.json");
  });

  it("uses defaults when omitted", () => {
    const out = resolveImproveProfile({}, {});
    expect(out.assertions).toBe("candidates");
    expect(out.assertionSource).toBe("snapshot-native");
    expect(out.applySelectors).toBe(false);
    expect(out.applyAssertions).toBe(false);
  });

  it("--apply resolves both applySelectors and applyAssertions to true", () => {
    const out = resolveImproveProfile({ apply: true }, {});
    expect(out.applySelectors).toBe(true);
    expect(out.applyAssertions).toBe(true);
  });

  it("--apply-selectors resolves applySelectors=true, applyAssertions=false", () => {
    const out = resolveImproveProfile({ applySelectors: true }, {});
    expect(out.applySelectors).toBe(true);
    expect(out.applyAssertions).toBe(false);
  });

  it("--apply-assertions resolves applySelectors=false, applyAssertions=true", () => {
    const out = resolveImproveProfile({ applyAssertions: true }, {});
    expect(out.applySelectors).toBe(false);
    expect(out.applyAssertions).toBe(true);
  });

  it("--apply --no-apply-assertions resolves applySelectors=true, applyAssertions=false", () => {
    const out = resolveImproveProfile({ apply: true, applyAssertions: false }, {});
    expect(out.applySelectors).toBe(true);
    expect(out.applyAssertions).toBe(false);
  });

  it("--apply --no-apply-selectors resolves applySelectors=false, applyAssertions=true", () => {
    const out = resolveImproveProfile({ apply: true, applySelectors: false }, {});
    expect(out.applySelectors).toBe(false);
    expect(out.applyAssertions).toBe(true);
  });

  it("granular --apply-selectors takes precedence over --apply", () => {
    const out = resolveImproveProfile({ apply: true, applySelectors: false }, {});
    expect(out.applySelectors).toBe(false);
  });

  it("granular --apply-assertions takes precedence over --apply", () => {
    const out = resolveImproveProfile({ apply: true, applyAssertions: false }, {});
    expect(out.applyAssertions).toBe(false);
  });
});

describe("improve-profile parsing", () => {
  it("accepts valid values", () => {
    expect(parseImproveAssertions("CANDIDATES")).toBe("candidates");
    expect(parseImproveAssertionSource("SNAPSHOT-CLI")).toBe("snapshot-cli");
  });

  it("rejects invalid values", () => {
    expect(() => parseImproveAssertions("all")).toThrow(UserError);
    expect(() => parseImproveAssertionSource("auto")).toThrow(UserError);
  });
});
