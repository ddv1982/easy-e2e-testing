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
