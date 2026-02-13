import type { Step, Target } from "../yaml-schema.js";
import type { AssertionCandidate } from "./report-schema.js";
import type { PlaywrightCliStepSnapshot } from "./providers/playwright-cli-replay.js";

interface SnapshotNode {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  rawLine: string;
}

const VISIBLE_ROLE_ALLOWLIST = new Set([
  "alert",
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "heading",
  "link",
  "menuitem",
  "radio",
  "status",
  "switch",
  "tab",
  "textbox",
]);

const TEXT_ROLE_ALLOWLIST = new Set(["heading", "status", "alert"]);

export function buildSnapshotCliAssertionCandidates(
  snapshots: PlaywrightCliStepSnapshot[]
): AssertionCandidate[] {
  const candidates: AssertionCandidate[] = [];

  for (const snapshot of snapshots) {
    const preNodes = parseSnapshotNodes(snapshot.preSnapshot);
    const postNodes = parseSnapshotNodes(snapshot.postSnapshot);
    const delta = buildDeltaNodes(preNodes, postNodes);
    if (delta.length === 0) continue;

    const actedTargetHint = extractActedTargetHint(snapshot.step);
    const framePath =
      snapshot.step.action === "navigate" ? undefined : snapshot.step.target.framePath;

    const textCandidate = buildTextCandidate(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath
    );
    if (textCandidate) {
      candidates.push(textCandidate);
      continue;
    }

    const visibleCandidate = buildVisibleCandidate(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath
    );
    if (visibleCandidate) {
      candidates.push(visibleCandidate);
    }
  }

  return candidates;
}

export function parseSnapshotNodes(snapshot: string): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];
  const lines = snapshot.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;

    const content = trimmed.slice(2);
    if (content.startsWith("/")) continue;

    const roleMatch = /^([a-zA-Z][a-zA-Z0-9_-]*)/.exec(content);
    if (!roleMatch) continue;

    const role = roleMatch[1];
    const refMatch = /\[ref=([^\]]+)\]/.exec(content);
    const nameMatch = /"([^"]+)"/.exec(content);
    const textMatch = /: (.+)$/.exec(content);

    const name = nameMatch?.[1]?.trim();
    const text = textMatch?.[1]?.trim();
    nodes.push({
      role,
      name: name || undefined,
      text: text || undefined,
      ref: refMatch?.[1],
      rawLine: trimmed,
    });
  }

  return nodes;
}

function buildDeltaNodes(pre: SnapshotNode[], post: SnapshotNode[]): SnapshotNode[] {
  const preKeys = new Set(pre.map((node) => nodeSignature(node)));
  return post.filter((node) => !preKeys.has(nodeSignature(node)));
}

function buildVisibleCandidate(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined
): AssertionCandidate | undefined {
  for (const node of nodes) {
    if (!VISIBLE_ROLE_ALLOWLIST.has(node.role)) continue;
    if (!node.name || isNoisyText(node.name)) continue;
    if (matchesActedTarget(node.name, actedTargetHint)) continue;

    return {
      index,
      afterAction,
      candidate: {
        action: "assertVisible",
        target: buildRoleTarget(node.role, node.name, framePath),
      },
      confidence: 0.78,
      rationale: "Snapshot delta found a new role/name element after this step.",
      candidateSource: "snapshot_cli",
    };
  }
  return undefined;
}

function buildTextCandidate(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined
): AssertionCandidate | undefined {
  for (const node of nodes) {
    if (!TEXT_ROLE_ALLOWLIST.has(node.role)) continue;
    const text = (node.text ?? node.name ?? "").trim();
    if (!text || isNoisyText(text)) continue;
    if (matchesActedTarget(text, actedTargetHint)) continue;

    return {
      index,
      afterAction,
      candidate: {
        action: "assertText",
        target: buildTextTarget(node, text, framePath),
        text,
      },
      confidence: 0.82,
      rationale: "Snapshot delta identified new high-signal text after this step.",
      candidateSource: "snapshot_cli",
    };
  }
  return undefined;
}

function buildRoleTarget(
  role: string,
  name: string,
  framePath: string[] | undefined
): Target {
  return {
    value: `getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name)} })`,
    kind: "locatorExpression",
    source: "codegen-fallback",
    ...(framePath && framePath.length > 0 ? { framePath } : {}),
  };
}

function buildTextTarget(
  node: SnapshotNode,
  text: string,
  framePath: string[] | undefined
): Target {
  const value =
    node.name && VISIBLE_ROLE_ALLOWLIST.has(node.role)
      ? `getByRole(${JSON.stringify(node.role)}, { name: ${JSON.stringify(node.name)} })`
      : `getByText(${JSON.stringify(text)})`;

  return {
    value,
    kind: "locatorExpression",
    source: "codegen-fallback",
    ...(framePath && framePath.length > 0 ? { framePath } : {}),
  };
}

function extractActedTargetHint(step: Step): string {
  if (step.action === "navigate") return step.url;
  return step.target.value;
}

function matchesActedTarget(value: string, actedTargetHint: string): boolean {
  const normalizedValue = normalizeForCompare(value);
  const normalizedTarget = normalizeForCompare(actedTargetHint);
  if (!normalizedValue || !normalizedTarget) return false;
  return (
    normalizedTarget.includes(normalizedValue) ||
    normalizedValue.includes(normalizedTarget)
  );
}

function nodeSignature(node: SnapshotNode): string {
  return [
    node.role,
    normalizeForCompare(node.name ?? ""),
    normalizeForCompare(node.text ?? ""),
  ].join("|");
}

function isNoisyText(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 120) return true;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (!/[a-zA-Z]/.test(text)) return true;
  return false;
}

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
