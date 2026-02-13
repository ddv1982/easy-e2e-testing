import { describe, expect, it } from "vitest";
import { classifySelector, isPlaywrightSelectorEngine } from "./selector-classifier.js";

describe("classifySelector", () => {
  it("classifies locator expressions", () => {
    expect(classifySelector("getByRole('button', { name: 'Save' })").kind).toBe(
      "locatorExpression"
    );
    expect(classifySelector("locator('iframe').contentFrame().getByText('X')").kind).toBe(
      "locatorExpression"
    );
  });

  it("classifies internal selectors", () => {
    expect(classifySelector("internal:role=button[name=\"save\"i]").kind).toBe("internal");
    expect(
      classifySelector("css=iframe >> internal:control=enter-frame >> internal:role=button").kind
    ).toBe("internal");
  });

  it("classifies Playwright selector-engine selectors", () => {
    expect(classifySelector("text=Save").kind).toBe("playwrightSelector");
    expect(classifySelector("data-testid=submit").kind).toBe("playwrightSelector");
    expect(classifySelector("css=button.primary").kind).toBe("playwrightSelector");
    expect(classifySelector("xpath=//button").kind).toBe("playwrightSelector");
    expect(classifySelector("myEngine=foo").kind).toBe("playwrightSelector");
  });

  it("classifies CSS and XPath selectors", () => {
    expect(classifySelector("#submit").kind).toBe("css");
    expect(classifySelector("form button[type=submit]").kind).toBe("css");
    expect(classifySelector("//button[@type='submit']").kind).toBe("xpath");
    expect(classifySelector("..").kind).toBe("xpath");
    expect(classifySelector("../div").kind).toBe("xpath");
    expect(classifySelector("..//button").kind).toBe("xpath");
  });

  it("classifies unknown selectors", () => {
    expect(classifySelector(" ").kind).toBe("unknown");
    expect(classifySelector("!!!").kind).toBe("unknown");
  });
});

describe("isPlaywrightSelectorEngine", () => {
  it("detects engine prefixes", () => {
    expect(isPlaywrightSelectorEngine("text=Hello")).toBe(true);
    expect(isPlaywrightSelectorEngine("data-testid=login")).toBe(true);
    expect(isPlaywrightSelectorEngine("custom_engine=foo")).toBe(true);
  });

  it("ignores non-engine forms", () => {
    expect(isPlaywrightSelectorEngine("internal:role=button")).toBe(false);
    expect(isPlaywrightSelectorEngine("https://example.com")).toBe(false);
    expect(isPlaywrightSelectorEngine("#submit")).toBe(false);
  });
});
