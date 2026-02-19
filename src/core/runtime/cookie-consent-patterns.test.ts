import { describe, expect, it } from "vitest";
import { isCookieConsentDismissText } from "./cookie-consent-patterns.js";

describe("isCookieConsentDismissText", () => {
  it("matches exact lowercase dismiss texts", () => {
    expect(isCookieConsentDismissText("akkoord")).toBe(true);
    expect(isCookieConsentDismissText("accept")).toBe(true);
    expect(isCookieConsentDismissText("tout accepter")).toBe(true);
    expect(isCookieConsentDismissText("akzeptieren")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isCookieConsentDismissText("Akkoord")).toBe(true);
    expect(isCookieConsentDismissText("ACCEPT ALL")).toBe(true);
    expect(isCookieConsentDismissText("Tout Accepter")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isCookieConsentDismissText("  akkoord  ")).toBe(true);
    expect(isCookieConsentDismissText("\taccept\n")).toBe(true);
  });

  it("rejects empty and whitespace-only strings", () => {
    expect(isCookieConsentDismissText("")).toBe(false);
    expect(isCookieConsentDismissText("   ")).toBe(false);
  });

  it("rejects partial matches", () => {
    expect(isCookieConsentDismissText("accept this")).toBe(false);
    expect(isCookieConsentDismissText("not akkoord")).toBe(false);
  });

  it("rejects unrelated text", () => {
    expect(isCookieConsentDismissText("bestellen")).toBe(false);
    expect(isCookieConsentDismissText("login")).toBe(false);
    expect(isCookieConsentDismissText("submit")).toBe(false);
  });

  it("handles French j'accepte with ASCII apostrophe", () => {
    expect(isCookieConsentDismissText("j'accepte")).toBe(true);
  });

  it("handles French j'accepte with unicode right single quotation mark", () => {
    expect(isCookieConsentDismissText("j\u2019accepte")).toBe(true);
  });
});
