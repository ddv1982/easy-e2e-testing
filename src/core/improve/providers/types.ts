import type { ImproveDiagnostic, ImproveProviderUsed } from "../report-schema.js";

export interface ProviderContext {
  initialUrl?: string;
}

export interface ProviderResult {
  providerUsed: ImproveProviderUsed;
  diagnostics: ImproveDiagnostic[];
  snapshotExcerpt?: string;
}
