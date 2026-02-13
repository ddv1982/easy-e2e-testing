import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "./playwright-cli-provider.js";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

interface MockChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

function createChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe("runCommand", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns success when process exits with code 0", async () => {
    const child = createChild();
    spawnMock.mockReturnValue(child);

    const promise = runCommand("playwright-cli", ["--help"], 1000);
    child.emit("close", 0);
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("resolves after timeout escalation when process does not close", async () => {
    vi.useFakeTimers();
    const child = createChild();
    spawnMock.mockReturnValue(child);

    const promise = runCommand("playwright-cli", ["snapshot"], 10);
    await vi.advanceTimersByTimeAsync(10);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  });
});
