import type { AssertionCandidate } from "./report-schema.js";
import { buildSnapshotAssertionCandidates, type StepSnapshot } from "./assertion-candidates-snapshot-cli.js";

export function buildSnapshotNativeAssertionCandidates(
  snapshots: StepSnapshot[]
): AssertionCandidate[] {
  return buildSnapshotAssertionCandidates(snapshots, "snapshot_native");
}
