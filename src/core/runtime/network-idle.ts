import { errors as playwrightErrors, type Page } from "playwright";

export const DEFAULT_WAIT_FOR_NETWORK_IDLE = true;
export const DEFAULT_NETWORK_IDLE_TIMEOUT_MS = 2_000;

export async function waitForPostStepNetworkIdle(
  page: Page,
  enabled: boolean,
  timeoutMs: number
): Promise<boolean> {
  if (!enabled) return false;

  try {
    await page.waitForLoadState("networkidle", { timeout: timeoutMs });
    return false;
  } catch (err) {
    if (isPlaywrightTimeoutError(err)) {
      return true;
    }
    throw err;
  }
}

export function isPlaywrightTimeoutError(err: unknown): boolean {
  if (err instanceof playwrightErrors.TimeoutError) return true;
  if (err instanceof Error && err.name === "TimeoutError") return true;
  return false;
}
