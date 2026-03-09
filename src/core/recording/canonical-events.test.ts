import { describe, expect, it } from "vitest";
import { playwrightCodeToSteps } from "../transform/playwright-ast-transform.js";
import { devtoolsRecordingToSteps } from "../transform/devtools-recording-adapter.js";
import { canonicalEventsToSteps, stepsToCanonicalEvents } from "./canonical-events.js";
import type { Step } from "../yaml-schema.js";

describe("canonical events", () => {
  it("round-trips steps deterministically", () => {
    const steps = [
      { action: "navigate", url: "/" },
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Submit' })",
          kind: "locatorExpression",
          source: "manual",
          confidence: 0.91,
        },
      },
      {
        action: "fill",
        target: { value: "#email", kind: "css", source: "manual" },
        text: "user@example.com",
      },
    ] as const;

    const canonical = stepsToCanonicalEvents([...steps]);
    const rebuilt = canonicalEventsToSteps(canonical);
    const canonicalAgain = stepsToCanonicalEvents(rebuilt);

    expect(canonicalAgain).toEqual(canonical);
    expect(rebuilt).toEqual(steps);
  });

  it("normalizes adapter outputs through the same canonical action contract", () => {
    const playwrightCode = [
      "import { test, expect } from '@playwright/test';",
      "test('recording', async ({ page }) => {",
      "  await page.goto('/');",
      "  await page.getByRole('button', { name: 'Submit' }).click();",
      "  await page.locator('#email').fill('user@example.com');",
      "});",
    ].join("\n");

    const devtoolsRecording = JSON.stringify({
      title: "recording",
      steps: [
        { type: "navigate", url: "/" },
        { type: "click", selectors: [["aria/Submit[role=\"button\"]"]] },
        { type: "change", selectors: [["#email"]], value: "user@example.com" },
      ],
    });

    const playwrightKinds = stepsToCanonicalEvents(playwrightCodeToSteps(playwrightCode)).map(
      (event) => event.kind
    );
    const devtoolsKinds = stepsToCanonicalEvents(devtoolsRecordingToSteps(devtoolsRecording).steps).map(
      (event) => event.kind
    );

    expect(playwrightKinds).toEqual(["navigate", "click", "fill"]);
    expect(devtoolsKinds).toEqual(["navigate", "click", "fill"]);
  });

  it("preserves selector provenance through canonical round-trips", () => {
    const steps: Step[] = [
      {
        action: "click",
        target: {
          value: "getByRole('button', { name: 'Continue' })",
          kind: "locatorExpression",
          source: "codegen",
          raw: "page.getByRole('button', { name: 'Continue' })",
          framePath: ["iframe[name='checkout']"],
          confidence: 0.9,
          warning: "preferred locator",
          fallbacks: [{ value: "#continue", kind: "css", source: "codegen" }],
        },
      },
    ];

    const rebuilt = canonicalEventsToSteps(stepsToCanonicalEvents([...steps]));

    expect(rebuilt).toEqual(steps);
  });

  it("preserves normalized navigation context through canonical round-trips", () => {
    const steps: Step[] = [
      { action: "navigate", url: "/start?next=%2Fcheckout#summary" },
      {
        action: "click",
        target: {
          value: "#continue",
          kind: "css",
          source: "manual",
        },
      },
    ];

    const rebuilt = canonicalEventsToSteps(stepsToCanonicalEvents(steps));

    expect(rebuilt).toEqual(steps);
  });
});
