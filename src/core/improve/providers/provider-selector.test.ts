import { describe, expect, it, vi } from "vitest";

vi.mock("./playwright-provider.js", () => ({
  collectPlaywrightContext: vi.fn(async () => ({
    providerUsed: "playwright",
    diagnostics: [{ code: "pw", level: "info", message: "pw" }],
  })),
}));

vi.mock("./playwright-cli-provider.js", () => ({
  collectPlaywrightCliContext: vi.fn(async () => ({
    providerUsed: "none",
    diagnostics: [{ code: "cli", level: "warn", message: "cli" }],
  })),
}));

import { selectImproveProvider } from "./provider-selector.js";

describe("selectImproveProvider", () => {
  it("uses direct playwright provider when requested", async () => {
    const out = await selectImproveProvider("playwright", "https://example.com");
    expect(out.providerUsed).toBe("playwright");
    expect(out.diagnostics[0]?.code).toBe("pw");
  });

  it("falls back from playwright-cli to playwright", async () => {
    const out = await selectImproveProvider("playwright-cli", "https://example.com");
    expect(out.providerUsed).toBe("playwright");
    expect(out.diagnostics.map((d) => d.code)).toEqual(["cli", "pw"]);
  });

  it("auto mode falls back from cli to playwright", async () => {
    const out = await selectImproveProvider("auto", "https://example.com");
    expect(out.providerUsed).toBe("playwright");
    expect(out.diagnostics.map((d) => d.code)).toEqual(["cli", "pw"]);
  });
});
