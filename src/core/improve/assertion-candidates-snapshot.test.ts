import { describe, expect, it } from "vitest";
import {
  buildSnapshotAssertionCandidates,
  parseSnapshotNodes,
} from "./assertion-candidates-snapshot.js";
import { richDeltaStepSnapshot } from "./assertion-candidates-snapshot.test-fixtures.js";

describe("snapshot assertion candidates", () => {
  it("parses snapshot nodes from aria snapshot output", () => {
    const snapshot = `
- generic [ref=e1]:
  - heading "Dashboard" [level=1] [ref=e2]
  - paragraph [ref=e3]: Welcome back
  - link "Open settings" [ref=e4] [cursor=pointer]:
`;

    const nodes = parseSnapshotNodes(snapshot);
    expect(nodes).toHaveLength(4);
    expect(nodes[1]?.role).toBe("heading");
    expect(nodes[1]?.name).toBe("Dashboard");
    expect(nodes[2]?.text).toBe("Welcome back");
    expect(nodes[3]?.ref).toBe("e4");
  });

  it("generates a high-signal text assertion from post-step snapshot delta", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 1,
        step: {
          action: "click",
          target: { value: "#submit", kind: "css", source: "manual" },
        },
        preSnapshot: `- generic [ref=e1]:\n  - button "Submit" [ref=e2]\n`,
        postSnapshot:
          `- generic [ref=e1]:\n  - button "Submit" [ref=e2]\n  - heading "Welcome" [level=1] [ref=e3]\n`,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    expect(out[0]?.confidence).toBe(0.82);
    expect(out[0]?.candidateSource).toBe("snapshot_native");
  });

  it("generates stable structural candidate when pre and post snapshots match for click action", () => {
    const snapshot = `- generic [ref=e1]:\n  - navigation "Main menu" [ref=e2]\n`;
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(1);
    expect(out[0]?.candidate.action).toBe("assertVisible");
    expect(out[0]?.confidence).toBe(0.84);
    expect(out[0]?.stableStructural).toBe(true);
  });

  it("does not treat unchanged heading as stable structural", () => {
    const snapshot = `- generic [ref=e1]:\n  - heading "Dashboard" [level=1] [ref=e2]\n`;
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(0);
  });

  it("excludes unchanged nodes for fill actions without delta", () => {
    const snapshot = `- generic [ref=e1]:\n  - heading "Dashboard" [level=1] [ref=e2]\n`;
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "fill",
          target: { value: "#name", kind: "css", source: "manual" },
          text: "Alice",
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(0);
  });

  it("does not generate same-target click visibility assertions", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 2,
        step: {
          action: "click",
          target: {
            value: "getByRole('button', { name: 'Log in' })",
            kind: "locatorExpression",
            source: "manual",
          },
        },
        preSnapshot: `- generic [ref=e1]:\n  - button "Log in" [ref=e2]\n`,
        postSnapshot: `- generic [ref=e1]:\n  - button "Log in" [ref=e2]\n`,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(0);
  });

  it("generates multiple candidates from a rich delta", () => {
    const out = buildSnapshotAssertionCandidates([richDeltaStepSnapshot], "snapshot_native");

    expect(out.length).toBeGreaterThan(1);
    expect(out[0]?.candidate.action).toBe("assertText");
    const actions = out.map((c) => c.candidate.action);
    expect(actions).toContain("assertVisible");
  });

  it("ranks headings before status in text candidates", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#go", kind: "css", source: "manual" },
        },
        preSnapshot: "- generic [ref=e1]:\n",
        postSnapshot: [
          "- generic [ref=e1]:",
          '  - status "Online" [ref=e2]',
          '  - heading "Welcome" [level=1] [ref=e3]',
        ].join("\n") + "\n",
      },
    ], "snapshot_native");

    const textCandidates = out.filter((c) => c.candidate.action === "assertText");
    expect(textCandidates.length).toBe(2);
    expect(textCandidates[0]?.candidate.action).toBe("assertText");
    if (textCandidates[0]?.candidate.action === "assertText") {
      expect(textCandidates[0].candidate.text).toBe("Welcome");
    }
  });

  it("prioritizes navigation over heading in stable structural candidates", () => {
    const snapshot = [
      "- generic [ref=e1]:",
      '  - navigation "Main menu" [ref=e2]',
      '  - heading "Nieuws" [level=1] [ref=e3]',
    ].join("\n") + "\n";

    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#open", kind: "css", source: "manual" },
        },
        preSnapshot: snapshot,
        postSnapshot: snapshot,
      },
    ], "snapshot_native");

    const stableCandidates = out.filter((c) => c.stableStructural === true);
    expect(stableCandidates).toHaveLength(1);
    const step = stableCandidates[0]?.candidate;
    expect(step?.action).not.toBe("navigate");
    if (step && step.action !== "navigate") {
      expect(step.target.value).toContain("navigation");
    }
  });

  it("generates stable candidate alongside delta candidates for click actions", () => {
    const preSnapshot = [
      "- generic [ref=e1]:",
      '  - navigation "Main menu" [ref=e2]',
    ].join("\n") + "\n";
    const postSnapshot = [
      "- generic [ref=e1]:",
      '  - navigation "Main menu" [ref=e2]',
      '  - heading "Welcome" [level=1] [ref=e3]',
    ].join("\n") + "\n";

    const out = buildSnapshotAssertionCandidates([
      {
        index: 0,
        step: {
          action: "click",
          target: { value: "#go", kind: "css", source: "manual" },
        },
        preSnapshot,
        postSnapshot,
      },
    ], "snapshot_native");

    const stableCandidates = out.filter((c) => c.stableStructural === true);
    const deltaCandidates = out.filter((c) => !c.stableStructural);
    expect(stableCandidates).toHaveLength(1);
    expect(deltaCandidates.length).toBeGreaterThan(0);
  });

  it("preserves framePath from triggering step target", () => {
    const out = buildSnapshotAssertionCandidates([
      {
        index: 3,
        step: {
          action: "click",
          target: {
            value: "#open",
            kind: "css",
            source: "manual",
            framePath: ["iframe[name=\"app-frame\"]"],
          },
        },
        preSnapshot: `- generic [ref=e1]:\n`,
        postSnapshot: `- generic [ref=e1]:\n  - heading "Done" [level=1] [ref=e3]\n`,
      },
    ], "snapshot_native");

    expect(out).toHaveLength(1);
    expect("framePath" in out[0]!.candidate.target).toBe(true);
    expect(out[0]?.candidate.target.framePath).toEqual(["iframe[name=\"app-frame\"]"]);
  });
});
