import { describe, expect, it, vi } from "vitest";
import { generateAriaTargetCandidates } from "./candidate-generator-aria.js";
import type { Target } from "../yaml-schema.js";

function mockPage(snapshotYaml: string, placeholder?: string) {
  const locator = {
    ariaSnapshot: vi.fn().mockResolvedValue(snapshotYaml),
    getAttribute: vi.fn().mockResolvedValue(placeholder ?? null),
  };
  return {
    page: {
      locator: vi.fn().mockReturnValue(locator),
      getByRole: vi.fn().mockReturnValue(locator),
      getByTestId: vi.fn().mockReturnValue(locator),
      getByText: vi.fn().mockReturnValue(locator),
      getByLabel: vi.fn().mockReturnValue(locator),
      getByPlaceholder: vi.fn().mockReturnValue(locator),
      frameLocator: vi.fn().mockReturnValue({
        locator: vi.fn().mockReturnValue(locator),
      }),
    } as any,
    locator,
  };
}

describe("generateAriaTargetCandidates", () => {
  const cssTarget: Target = { value: "#email", kind: "css", source: "manual" };

  it("generates getByRole candidate from textbox with name", async () => {
    const { page } = mockPage('- textbox "Email"');
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    const roleCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_role_name"));
    expect(roleCandidate).toBeDefined();
    expect(roleCandidate!.target.value).toBe("getByRole('textbox', { name: 'Email' })");
    expect(roleCandidate!.target.kind).toBe("locatorExpression");
    expect(roleCandidate!.source).toBe("derived");
  });

  it("generates getByLabel candidate for form control roles", async () => {
    const { page } = mockPage('- textbox "Email"');
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    const labelCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_label"));
    expect(labelCandidate).toBeDefined();
    expect(labelCandidate!.target.value).toBe("getByLabel('Email')");
  });

  it("generates getByPlaceholder candidate when placeholder attribute exists", async () => {
    const { page } = mockPage('- textbox "Email"', "Enter your email");
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    const placeholderCandidate = result.candidates.find((c) =>
      c.reasonCodes.includes("aria_placeholder")
    );
    expect(placeholderCandidate).toBeDefined();
    expect(placeholderCandidate!.target.value).toBe("getByPlaceholder('Enter your email')");
  });

  it("generates getByText candidate for text roles like heading", async () => {
    const target: Target = { value: ".title", kind: "css", source: "manual" };
    const { page } = mockPage('- heading "Welcome"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const textCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_text"));
    expect(textCandidate).toBeDefined();
    expect(textCandidate!.target.value).toBe("getByText('Welcome')");
  });

  it("generates getByText for link role", async () => {
    const target: Target = { value: "a.settings", kind: "css", source: "manual" };
    const { page } = mockPage('- link "Settings"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const textCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_text"));
    expect(textCandidate).toBeDefined();
    expect(textCandidate!.target.value).toBe("getByText('Settings')");
  });

  it("skips useless roles like generic", async () => {
    const { page } = mockPage('- generic "wrapper"');
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates).toHaveLength(0);
  });

  it("skips candidates that already exist in existingValues set", async () => {
    const { page } = mockPage('- textbox "Email"');
    const existing = new Set(["getByRole('textbox', { name: 'Email' })"]);
    const result = await generateAriaTargetCandidates(page, cssTarget, existing, 1000);

    const roleCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_role_name"));
    expect(roleCandidate).toBeUndefined();
  });

  it("returns diagnostic when ariaSnapshot fails", async () => {
    const page = {
      locator: vi.fn().mockReturnValue({
        ariaSnapshot: vi.fn().mockRejectedValue(new Error("Element not found")),
      }),
    } as any;

    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("aria_snapshot_failed");
  });

  it("preserves framePath from target", async () => {
    const target: Target = {
      value: "#email",
      kind: "css",
      source: "manual",
      framePath: ['iframe[name="app"]'],
    };
    const locator = {
      ariaSnapshot: vi.fn().mockResolvedValue('- textbox "Email"'),
      getAttribute: vi.fn().mockResolvedValue(null),
    };
    const page = {
      frameLocator: vi.fn().mockReturnValue({
        locator: vi.fn().mockReturnValue(locator),
      }),
    } as any;

    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0]!.target.framePath).toEqual(['iframe[name="app"]']);
  });

  it("does not generate getByLabel for non-form-control roles", async () => {
    const target: Target = { value: ".btn", kind: "css", source: "manual" };
    const { page } = mockPage('- button "Submit"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const labelCandidate = result.candidates.find((c) => c.reasonCodes.includes("aria_label"));
    expect(labelCandidate).toBeUndefined();
  });

  it("does not generate getByPlaceholder for non-form-control roles", async () => {
    const target: Target = { value: ".btn", kind: "css", source: "manual" };
    const { page } = mockPage('- button "Submit"');
    const result = await generateAriaTargetCandidates(page, target, new Set(), 1000);

    const placeholderCandidate = result.candidates.find((c) =>
      c.reasonCodes.includes("aria_placeholder")
    );
    expect(placeholderCandidate).toBeUndefined();
  });

  it("handles node without name gracefully", async () => {
    const { page } = mockPage("- textbox");
    const result = await generateAriaTargetCandidates(page, cssTarget, new Set(), 1000);

    expect(result.candidates).toHaveLength(0);
  });
});
