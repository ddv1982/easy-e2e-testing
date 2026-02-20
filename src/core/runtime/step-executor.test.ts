import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import type { Step } from "../yaml-schema.js";
import { executeRuntimeStep } from "./step-executor.js";

function createMockPage() {
  const clickMock = vi.fn(async () => {});
  const locatorMock = vi.fn(() => ({
    click: clickMock,
    fill: vi.fn(async () => {}),
    press: vi.fn(async () => {}),
    check: vi.fn(async () => {}),
    uncheck: vi.fn(async () => {}),
    hover: vi.fn(async () => {}),
    selectOption: vi.fn(async () => {}),
    waitFor: vi.fn(async () => {}),
    textContent: vi.fn(async () => ""),
    inputValue: vi.fn(async () => ""),
    isChecked: vi.fn(async () => false),
    isEnabled: vi.fn(async () => true),
    locator: vi.fn(),
  }));

  const page = { locator: locatorMock } as unknown as Page;
  return { page, locatorMock, clickMock };
}

function makeCssClickStep(overrides: Partial<Step> = {}): Step {
  return {
    action: "click",
    target: { value: "#btn", kind: "css", source: "manual" },
    ...overrides,
  } as Step;
}

describe("executeRuntimeStep per-step timeout", () => {
  it("uses step.timeout when present instead of options.timeout", async () => {
    const { page, clickMock } = createMockPage();
    const step = makeCssClickStep({ timeout: 2000 });

    await executeRuntimeStep(page, step, {
      timeout: 10_000,
      mode: "playback",
    });

    expect(clickMock).toHaveBeenCalledWith({ timeout: 2000 });
  });

  it("falls back to options.timeout when step has no timeout", async () => {
    const { page, clickMock } = createMockPage();
    const step = makeCssClickStep();

    await executeRuntimeStep(page, step, {
      timeout: 10_000,
      mode: "playback",
    });

    expect(clickMock).toHaveBeenCalledWith({ timeout: 10_000 });
  });
});

describe("executeRuntimeStep assertUrl", () => {
  it("matches literal URLs that contain regex special characters", async () => {
    const page = {
      url: vi.fn(() => "https://example.com/search?q=test.1"),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertUrl", url: "https://example.com/search?q=test.1" } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });

  it("supports wildcard matching while escaping non-wildcard characters", async () => {
    const page = {
      url: vi.fn(() => "https://example.com/items/42/details?view=full.1"),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertUrl", url: "https://example.com/items/*/details?view=full.1" } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });
});

describe("executeRuntimeStep assertTitle", () => {
  it("passes when the current page title contains the expected value", async () => {
    const page = {
      title: vi.fn(async () => "Settings - Example App"),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        { action: "assertTitle", title: "Settings" } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });
});

describe("executeRuntimeStep assertEnabled", () => {
  it("passes when assertEnabled expects enabled state", async () => {
    const waitFor = vi.fn(async () => {});
    const isEnabled = vi.fn(async () => true);
    const page = {
      locator: vi.fn(() => ({
        waitFor,
        isEnabled,
      })),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
        } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });

  it("passes when assertEnabled expects disabled state", async () => {
    const waitFor = vi.fn(async () => {});
    const isEnabled = vi.fn(async () => false);
    const page = {
      locator: vi.fn(() => ({
        waitFor,
        isEnabled,
      })),
    } as unknown as Page;

    await expect(
      executeRuntimeStep(
        page,
        {
          action: "assertEnabled",
          target: { value: "#submit", kind: "css", source: "manual" },
          enabled: false,
        } as Step,
        { timeout: 10_000, mode: "playback" }
      )
    ).resolves.toBeUndefined();
  });
});
