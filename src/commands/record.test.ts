import { describe, expect, it } from "vitest";
import { Command } from "commander";
import {
  formatRecordingProfileSummary,
  normalizeRecordUrl,
  parseRecordBrowser,
  parseSelectorPolicy,
} from "./record.js";
import { UserError } from "../utils/errors.js";
import { registerRecord } from "./record.js";

describe("normalizeRecordUrl", () => {
  it("keeps valid absolute URLs", () => {
    expect(normalizeRecordUrl("https://example.com/app")).toBe("https://example.com/app");
  });

  it("adds https protocol when missing for public domains", () => {
    expect(normalizeRecordUrl("example.com/app")).toBe("https://example.com/app");
  });

  it("adds http protocol when missing for localhost", () => {
    expect(normalizeRecordUrl("localhost:3000")).toBe("http://localhost:3000/");
  });

  it("throws for malformed URLs", () => {
    expect(() => normalizeRecordUrl("http://")).toThrow("Invalid starting URL");
  });
});

describe("parseSelectorPolicy", () => {
  it("accepts valid policies", () => {
    expect(parseSelectorPolicy("reliable")).toBe("reliable");
    expect(parseSelectorPolicy("RAW")).toBe("raw");
  });

  it("rejects invalid policy", () => {
    expect(() => parseSelectorPolicy("fast")).toThrow(UserError);
  });
});

describe("parseRecordBrowser", () => {
  it("accepts valid browsers", () => {
    expect(parseRecordBrowser("chromium")).toBe("chromium");
    expect(parseRecordBrowser("FIREFOX")).toBe("firefox");
    expect(parseRecordBrowser("webkit")).toBe("webkit");
  });

  it("rejects invalid browser", () => {
    expect(() => parseRecordBrowser("safari")).toThrow(UserError);
  });
});

describe("record command options", () => {
  it("registers v2 reliability flags", () => {
    const program = new Command();
    registerRecord(program);
    const command = program.commands.find((entry) => entry.name() === "record");
    expect(command).toBeDefined();

    command?.parseOptions([
      "--selector-policy",
      "raw",
      "--browser",
      "firefox",
      "--device",
      "iPhone 13",
      "--test-id-attribute",
      "data-qa",
      "--load-storage",
      ".auth/in.json",
      "--save-storage",
      ".auth/out.json",
    ]);

    const opts = command?.opts() as Record<string, string>;
    expect(opts.selectorPolicy).toBe("raw");
    expect(opts.browser).toBe("firefox");
    expect(opts.device).toBe("iPhone 13");
    expect(opts.testIdAttribute).toBe("data-qa");
    expect(opts.loadStorage).toBe(".auth/in.json");
    expect(opts.saveStorage).toBe(".auth/out.json");
  });
});

describe("formatRecordingProfileSummary", () => {
  it("includes storage fields in profile output", () => {
    const profile = formatRecordingProfileSummary({
      browser: "chromium",
      selectorPolicy: "reliable",
      device: "iPhone 13",
      testIdAttribute: "data-qa",
      loadStorage: ".auth/in.json",
      saveStorage: ".auth/out.json",
    });

    expect(profile).toContain("browser=chromium");
    expect(profile).toContain("selectorPolicy=reliable");
    expect(profile).toContain("device=iPhone 13");
    expect(profile).toContain("testIdAttr=data-qa");
    expect(profile).toContain("loadStorage=.auth/in.json");
    expect(profile).toContain("saveStorage=.auth/out.json");
  });
});
