import { describe, expect, it } from "vitest";
import { UserError } from "../../utils/errors.js";
import { resolvePlayProfile } from "./play-profile.js";

describe("resolvePlayProfile", () => {
  it("uses CLI overrides over config", () => {
    const out = resolvePlayProfile(
      {
        headed: true,
        timeout: "1500",
        delay: "50",
        waitNetworkIdle: false,
        networkIdleTimeout: "700",
        start: false,
      },
      {
        headed: false,
        timeout: 10_000,
        delay: 0,
        waitForNetworkIdle: true,
        networkIdleTimeout: 2_000,
        startCommand: "npm run dev",
        baseUrl: "http://127.0.0.1:5173",
      }
    );

    expect(out.headed).toBe(true);
    expect(out.timeout).toBe(1500);
    expect(out.delayMs).toBe(50);
    expect(out.waitForNetworkIdle).toBe(false);
    expect(out.networkIdleTimeout).toBe(700);
    expect(out.shouldAutoStart).toBe(false);
  });

  it("uses defaults when values are missing", () => {
    const out = resolvePlayProfile({}, {});
    expect(out.timeout).toBe(10_000);
    expect(out.delayMs).toBe(0);
    expect(out.waitForNetworkIdle).toBe(true);
    expect(out.networkIdleTimeout).toBe(2_000);
    expect(out.testDir).toBe("e2e");
  });

  it("throws for invalid numeric CLI flags", () => {
    expect(() => resolvePlayProfile({ timeout: "abc" }, {})).toThrow(UserError);
    expect(() => resolvePlayProfile({ delay: "-1" }, {})).toThrow(UserError);
    expect(() => resolvePlayProfile({ networkIdleTimeout: "0" }, {})).toThrow(UserError);
  });
});
