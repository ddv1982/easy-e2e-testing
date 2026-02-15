import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import {
  normalizeRecordUrl,
  parseRecordBrowser,
  parseSelectorPolicy,
  resolveRecordProfile,
} from "./record-profile.js";

describe("resolveRecordProfile", () => {
  it("prefers CLI values over config and normalizes optionals", () => {
    const out = resolveRecordProfile(
      {
        selectorPolicy: "raw",
        browser: "firefox",
        device: "  iPhone 13  ",
        testIdAttribute: "  data-qa  ",
        loadStorage: "  .auth/in.json  ",
        saveStorage: "  .auth/out.json  ",
      },
      {
        testDir: "tests",
      }
    );

    expect(out).toEqual({
      selectorPolicy: "raw",
      browser: "firefox",
      device: "iPhone 13",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
      outputDir: "tests",
    });
  });

  it("uses defaults when CLI and config are unset", () => {
    const out = resolveRecordProfile({}, {});
    expect(out.selectorPolicy).toBe("reliable");
    expect(out.browser).toBe("chromium");
    expect(out.outputDir).toBe("e2e");
  });
});

describe("record-profile parsing", () => {
  it("parses valid enums", () => {
    expect(parseSelectorPolicy("RAW")).toBe("raw");
    expect(parseRecordBrowser("Webkit")).toBe("webkit");
  });

  it("rejects invalid enums", () => {
    expect(() => parseSelectorPolicy("fast")).toThrow(UserError);
    expect(() => parseRecordBrowser("safari")).toThrow(UserError);
  });

  it("normalizes record URLs", () => {
    expect(normalizeRecordUrl("example.com/app")).toBe("https://example.com/app");
    expect(normalizeRecordUrl("localhost:3000")).toBe("http://localhost:3000/");
  });
});
