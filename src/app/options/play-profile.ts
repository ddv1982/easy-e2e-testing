import type { UITestConfig } from "../../utils/config.js";
import { UserError } from "../../utils/errors.js";

export interface PlayProfileInput {
  headed?: boolean;
  timeout?: string;
  delay?: string;
  waitNetworkIdle?: boolean;
  networkIdleTimeout?: string;
  start?: boolean;
}

export interface ResolvedPlayProfile {
  headed: boolean;
  timeout: number;
  delayMs: number;
  waitForNetworkIdle: boolean;
  networkIdleTimeout: number;
  shouldAutoStart: boolean;
  baseUrl?: string;
  startCommand?: string;
  testDir: string;
}

export function resolvePlayProfile(
  input: PlayProfileInput,
  config: UITestConfig
): ResolvedPlayProfile {
  const headed = input.headed ?? config.headed ?? false;
  const shouldAutoStart = input.start !== false;

  const cliTimeout =
    input.timeout !== undefined
      ? parsePositiveInt(
          input.timeout,
          "timeout",
          "CLI flag --timeout",
          "Use a positive integer in milliseconds, for example: --timeout 10000"
        )
      : undefined;
  const timeout = cliTimeout ?? config.timeout ?? 10_000;

  const cliDelay =
    input.delay !== undefined
      ? parseNonNegativeInt(input.delay, "CLI flag --delay")
      : undefined;
  const delayMs = cliDelay ?? config.delay ?? 0;

  const waitForNetworkIdle = input.waitNetworkIdle ?? config.waitForNetworkIdle ?? true;

  const cliNetworkIdleTimeout =
    input.networkIdleTimeout !== undefined
      ? parsePositiveInt(
          input.networkIdleTimeout,
          "network idle timeout",
          "CLI flag --network-idle-timeout",
          "Use a positive integer in milliseconds, for example: --network-idle-timeout 2000"
        )
      : undefined;
  const networkIdleTimeout = cliNetworkIdleTimeout ?? config.networkIdleTimeout ?? 2_000;

  if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isInteger(timeout)) {
    throw new UserError(
      `Invalid timeout value: ${timeout}`,
      "Timeout must be a positive integer in milliseconds."
    );
  }

  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new UserError(
      `Invalid delay value: ${delayMs}`,
      "Delay must be a non-negative integer in milliseconds."
    );
  }

  if (
    !Number.isFinite(networkIdleTimeout) ||
    networkIdleTimeout <= 0 ||
    !Number.isInteger(networkIdleTimeout)
  ) {
    throw new UserError(
      `Invalid network idle timeout value: ${networkIdleTimeout}`,
      "Network idle timeout must be a positive integer in milliseconds."
    );
  }

  return {
    headed,
    timeout,
    delayMs,
    waitForNetworkIdle,
    networkIdleTimeout,
    shouldAutoStart,
    baseUrl: config.baseUrl,
    startCommand: config.startCommand?.trim() || undefined,
    testDir: config.testDir ?? "e2e",
  };
}

function parsePositiveInt(
  input: string,
  label: string,
  source: string,
  hint: string
): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid ${label} value from ${source}: ${input}`,
      hint
    );
  }
  return value;
}

function parseNonNegativeInt(input: string, source: string): number {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new UserError(
      `Invalid delay value from ${source}: ${input}`,
      "Use a non-negative integer in milliseconds, for example: --delay 2000"
    );
  }
  return value;
}
