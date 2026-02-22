import { describe, expect, it } from "vitest";
import { locatorNodeToExpression } from "./selector-normalize.js";

describe("locatorNodeToExpression dynamic exact normalization", () => {
  it("drops exact for long headline-like role names when enabled", () => {
    const expression = locatorNodeToExpression(
      {
        kind: "role",
        body: "link",
        options: {
          name: "Nederlaag voor Trump: hooggerechtshof VS oordeelt dat heffingen onwettig zijn",
          exact: true,
        },
      },
      0,
      { dropDynamicExact: true }
    );

    expect(expression).toBe(
      "getByRole('link', { name: 'Nederlaag voor Trump: hooggerechtshof VS oordeelt dat heffingen onwettig zijn' })"
    );
    expect(expression).not.toContain("exact: true");
  });

  it("drops exact for headline-like text with time fragments", () => {
    const expression = locatorNodeToExpression(
      {
        kind: "text",
        body: "Winterweer update Schiphol 12:30, alle vluchten vertraagd",
        options: { exact: true },
      },
      0,
      { dropDynamicExact: true }
    );

    expect(expression).toBe(
      "getByText('Winterweer update Schiphol 12:30, alle vluchten vertraagd')"
    );
    expect(expression).not.toContain("exact: true");
  });

  it("keeps exact for short stable text", () => {
    const expression = locatorNodeToExpression(
      {
        kind: "role",
        body: "link",
        options: { name: "Algemeen", exact: true },
      },
      0,
      { dropDynamicExact: true }
    );

    expect(expression).toBe("getByRole('link', { name: 'Algemeen', exact: true })");
  });
});
