import type { ImproveProvider } from "../improve.js";
import { collectPlaywrightCliContext } from "./playwright-cli-provider.js";
import { collectPlaywrightContext } from "./playwright-provider.js";
import type { ProviderResult } from "./types.js";

export async function selectImproveProvider(
  provider: ImproveProvider,
  initialUrl?: string
): Promise<ProviderResult> {
  if (provider === "playwright") {
    return collectPlaywrightContext({ initialUrl });
  }

  if (provider === "playwright-cli") {
    const cli = await collectPlaywrightCliContext({ initialUrl });
    if (cli.providerUsed !== "none") return cli;
    const fallback = await collectPlaywrightContext({ initialUrl });
    return {
      providerUsed: fallback.providerUsed,
      snapshotExcerpt: fallback.snapshotExcerpt,
      diagnostics: [...cli.diagnostics, ...fallback.diagnostics],
    };
  }

  const autoCli = await collectPlaywrightCliContext({ initialUrl });
  if (autoCli.providerUsed !== "none") return autoCli;
  const fallback = await collectPlaywrightContext({ initialUrl });
  return {
    providerUsed: fallback.providerUsed,
    snapshotExcerpt: fallback.snapshotExcerpt,
    diagnostics: [...autoCli.diagnostics, ...fallback.diagnostics],
  };
}
