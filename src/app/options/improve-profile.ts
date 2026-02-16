import type {
  ImproveAssertionsMode,
  ImproveAssertionSource,
} from "../../core/improve/improve.js";
import { UserError } from "../../utils/errors.js";

export interface ImproveProfileInput {
  apply?: boolean;
  assertions?: string;
  assertionSource?: string;
  report?: string;
}

export interface ResolvedImproveProfile {
  assertions: ImproveAssertionsMode;
  assertionSource: ImproveAssertionSource;
  applySelectors: boolean;
  applyAssertions: boolean;
  reportPath?: string;
}

export function resolveImproveProfile(
  input: ImproveProfileInput
): ResolvedImproveProfile {
  const apply = input.apply ?? false;
  return {
    assertions: parseImproveAssertions(input.assertions) ?? "candidates",
    assertionSource:
      parseImproveAssertionSource(input.assertionSource) ??
      "snapshot-native",
    applySelectors: apply,
    applyAssertions: apply,
    reportPath: input.report,
  };
}

export function parseImproveAssertions(value: string | undefined): ImproveAssertionsMode | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "none" || normalized === "candidates") {
    return normalized;
  }
  throw new UserError(
    `Invalid assertions mode: ${value}`,
    "Use --assertions none or --assertions candidates"
  );
}

export function parseImproveAssertionSource(
  value: string | undefined
): ImproveAssertionSource | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "deterministic") return "deterministic";
  if (normalized === "snapshot-native") return "snapshot-native";
  throw new UserError(
    `Invalid assertion source: ${value}`,
    "Use --assertion-source deterministic or --assertion-source snapshot-native"
  );
}
