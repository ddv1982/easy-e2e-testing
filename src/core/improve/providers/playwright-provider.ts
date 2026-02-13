import type { ProviderContext, ProviderResult } from "./types.js";

export async function collectPlaywrightContext(_context: ProviderContext): Promise<ProviderResult> {
  return {
    providerUsed: "playwright",
    diagnostics: [
      {
        code: "provider_playwright_selected",
        level: "info",
        message: "Using direct Playwright runtime context.",
      },
    ],
  };
}
