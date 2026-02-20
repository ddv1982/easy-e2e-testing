import type { Step, Target } from "../yaml-schema.js";
import { quote } from "./candidate-generator.js";
import type { AssertionCandidate, AssertionCandidateSource } from "./report-schema.js";

interface SnapshotNode {
  role: string;
  name?: string;
  text?: string;
  ref?: string;
  visible: boolean;
  enabled: boolean;
  expanded?: boolean;
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
  "navigation",
  "radio",
  "status",
  "switch",
  "tab",
  "textbox",
]);

const STABLE_STRUCTURAL_ROLES = new Set([
  "navigation",
  "banner",
  "main",
  "contentinfo",
]);

const TEXT_ROLE_ALLOWLIST = new Set(["heading", "status", "alert", "tab", "link"]);

const STATE_CHANGE_ROLE_ALLOWLIST = new Set([
  "button",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "link",
]);

const MAX_TEXT_CANDIDATES_PER_STEP = 2;
const MAX_VISIBLE_CANDIDATES_PER_STEP = 3;
const MAX_STATE_CANDIDATES_PER_STEP = 2;

export interface StepSnapshot {
  index: number;
  step: Step;
  preSnapshot: string;
  postSnapshot: string;
  preUrl?: string;
  postUrl?: string;
  preTitle?: string;
  postTitle?: string;
}

export function buildSnapshotAssertionCandidates(
  snapshots: StepSnapshot[],
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const candidates: AssertionCandidate[] = [];

  for (const snapshot of snapshots) {
    const preNodes = parseSnapshotNodes(snapshot.preSnapshot);
    const postNodes = parseSnapshotNodes(snapshot.postSnapshot);
    const delta = buildDeltaNodes(preNodes, postNodes);

    const actedTargetHint = extractActedTargetHint(snapshot.step);
    const framePath =
      snapshot.step.action !== "navigate" &&
      snapshot.step.action !== "assertUrl" &&
      snapshot.step.action !== "assertTitle" &&
      "target" in snapshot.step &&
      snapshot.step.target
        ? snapshot.step.target.framePath
        : undefined;

    if (snapshot.step.action === "click") {
      const stableNodes = buildStableNodes(preNodes, postNodes);
      const stableCandidates = buildStableVisibleCandidates(
        snapshot.index,
        snapshot.step.action,
        stableNodes,
        actedTargetHint,
        framePath,
        candidateSource
      );
      candidates.push(...stableCandidates);
    }

    const urlCandidates = buildUrlCandidates(
      snapshot.index,
      snapshot.step.action,
      snapshot.preUrl,
      snapshot.postUrl,
      candidateSource
    );
    candidates.push(...urlCandidates);

    const titleCandidates = buildTitleCandidates(
      snapshot.index,
      snapshot.step.action,
      snapshot.preTitle,
      snapshot.postTitle,
      candidateSource
    );
    candidates.push(...titleCandidates);

    const textChangeCandidates = buildTextChangedCandidates(
      snapshot.index,
      snapshot.step.action,
      preNodes,
      postNodes,
      actedTargetHint,
      framePath,
      candidateSource
    );
    candidates.push(...textChangeCandidates);

    const stateChangeCandidates = buildStateChangeCandidates(
      snapshot.index,
      snapshot.step.action,
      preNodes,
      postNodes,
      actedTargetHint,
      framePath,
      candidateSource
    );
    candidates.push(...stateChangeCandidates);

    if (delta.length === 0) continue;

    const textCandidates = buildTextCandidates(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath,
      candidateSource,
      MAX_TEXT_CANDIDATES_PER_STEP
    );
    candidates.push(...textCandidates);

    const textTargetValues = new Set(
      textCandidates.map((c) =>
        normalizeForCompare(
          "target" in c.candidate && c.candidate.target ? c.candidate.target.value : ""
        )
      )
    );

    const visibleCandidates = buildVisibleCandidates(
      snapshot.index,
      snapshot.step.action,
      delta,
      actedTargetHint,
      framePath,
      candidateSource,
      MAX_VISIBLE_CANDIDATES_PER_STEP
    );
    for (const vc of visibleCandidates) {
      const vcTarget =
        "target" in vc.candidate && vc.candidate.target
          ? normalizeForCompare(vc.candidate.target.value)
          : "";
      if (textTargetValues.has(vcTarget)) continue;
      candidates.push(vc);
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

    const hiddenMatch = /\[hidden\]/.test(content);
    const disabledMatch = /\[disabled\]/.test(content);
    const expandedMatch = /\[expanded=(true|false)\]/.exec(content);

    nodes.push({
      role,
      name: name || undefined,
      text: text || undefined,
      ref: refMatch?.[1],
      visible: !hiddenMatch,
      enabled: !disabledMatch,
      expanded: expandedMatch ? expandedMatch[1] === "true" : undefined,
      rawLine: trimmed,
    });
  }

  return nodes;
}

function buildDeltaNodes(pre: SnapshotNode[], post: SnapshotNode[]): SnapshotNode[] {
  const preKeys = new Set(pre.map((node) => nodeSignature(node)));
  return post.filter((node) => !preKeys.has(nodeSignature(node)));
}

function buildStableNodes(pre: SnapshotNode[], post: SnapshotNode[]): SnapshotNode[] {
  const preKeys = new Set(pre.map((node) => nodeSignature(node)));
  return post.filter((node) => preKeys.has(nodeSignature(node)));
}

function buildUrlCandidates(
  index: number,
  afterAction: Step["action"],
  preUrl?: string,
  postUrl?: string,
  candidateSource?: AssertionCandidateSource
): AssertionCandidate[] {
  if (!preUrl || !postUrl || preUrl === postUrl) return [];
  if (afterAction !== "click" && afterAction !== "navigate") return [];

  return [{
    index,
    afterAction,
    candidate: {
      action: "assertUrl" as const,
      url: postUrl,
    },
    confidence: 0.88,
    rationale: "URL changed after navigation action.",
    candidateSource: candidateSource ?? "snapshot_native",
  }];
}

function buildTitleCandidates(
  index: number,
  afterAction: Step["action"],
  preTitle?: string,
  postTitle?: string,
  candidateSource?: AssertionCandidateSource
): AssertionCandidate[] {
  if (!preTitle || !postTitle || preTitle === postTitle) return [];
  if (afterAction !== "click" && afterAction !== "navigate") return [];

  if (isNoisyText(postTitle)) return [];

  return [{
    index,
    afterAction,
    candidate: {
      action: "assertTitle" as const,
      title: postTitle,
    },
    confidence: 0.82,
    rationale: "Page title changed after action.",
    candidateSource: candidateSource ?? "snapshot_native",
  }];
}

interface TextChange {
  node: SnapshotNode;
  oldText: string;
  newText: string;
}

function buildTextChangedCandidates(
  index: number,
  afterAction: Step["action"],
  preNodes: SnapshotNode[],
  postNodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const changes = detectTextChanges(preNodes, postNodes);
  const qualifying: TextChange[] = [];
  for (const change of changes) {
    if (!TEXT_ROLE_ALLOWLIST.has(change.node.role)) continue;
    if (isNoisyText(change.newText)) continue;
    if (matchesActedTarget(change.newText, actedTargetHint)) continue;
    qualifying.push(change);
  }

  const candidates: AssertionCandidate[] = [];
  for (const change of qualifying.slice(0, MAX_TEXT_CANDIDATES_PER_STEP)) {
    candidates.push({
      index,
      afterAction,
      candidate: {
        action: "assertText" as const,
        target: buildTextTarget(change.node, change.newText, framePath),
        text: change.newText,
      },
      confidence: 0.85,
      rationale: "Text content changed after action.",
      candidateSource,
    });
  }

  return candidates;
}

function detectTextChanges(preNodes: SnapshotNode[], postNodes: SnapshotNode[]): TextChange[] {
  const changes: TextChange[] = [];
  const preByKey = new Map<string, SnapshotNode>();

  for (const node of preNodes) {
    const key = nodeIdentityKey(node);
    preByKey.set(key, node);
  }

  for (const postNode of postNodes) {
    const key = nodeIdentityKey(postNode);
    const preNode = preByKey.get(key);
    if (!preNode) continue;

    const preText = (preNode.text ?? preNode.name ?? "").trim();
    const postText = (postNode.text ?? postNode.name ?? "").trim();

    if (preText !== postText && preText && postText) {
      changes.push({
        node: postNode,
        oldText: preText,
        newText: postText,
      });
    }
  }

  return changes;
}

interface StateChange {
  node: SnapshotNode;
  type: "enabled" | "disabled" | "expanded" | "collapsed";
}

function buildStateChangeCandidates(
  index: number,
  afterAction: Step["action"],
  preNodes: SnapshotNode[],
  postNodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const changes = detectStateChanges(preNodes, postNodes);
  const qualifying: StateChange[] = [];
  for (const change of changes) {
    if (!STATE_CHANGE_ROLE_ALLOWLIST.has(change.node.role)) continue;
    if (!change.node.name || isNoisyText(change.node.name)) continue;
    if (matchesActedTarget(change.node.name, actedTargetHint)) continue;
    if (change.type !== "enabled" && change.type !== "disabled") continue;
    qualifying.push(change);
  }

  const candidates: AssertionCandidate[] = [];
  for (const change of qualifying.slice(0, MAX_STATE_CANDIDATES_PER_STEP)) {
    candidates.push({
      index,
      afterAction,
      candidate: {
        action: "assertEnabled" as const,
        target: buildRoleTarget(change.node.role, change.node.name!, framePath),
        enabled: change.type === "enabled",
      },
      confidence: 0.80,
      rationale: `Element became ${change.type} after action.`,
      candidateSource,
    });
  }

  return candidates;
}

function detectStateChanges(preNodes: SnapshotNode[], postNodes: SnapshotNode[]): StateChange[] {
  const changes: StateChange[] = [];
  const preByKey = new Map<string, SnapshotNode>();

  for (const node of preNodes) {
    const key = nodeIdentityKey(node);
    preByKey.set(key, node);
  }

  for (const postNode of postNodes) {
    const key = nodeIdentityKey(postNode);
    const preNode = preByKey.get(key);
    if (!preNode) continue;

    if (preNode.enabled !== postNode.enabled) {
      changes.push({
        node: postNode,
        type: postNode.enabled ? "enabled" : "disabled",
      });
    }

    if (preNode.expanded !== postNode.expanded && postNode.expanded !== undefined) {
      changes.push({
        node: postNode,
        type: postNode.expanded ? "expanded" : "collapsed",
      });
    }
  }

  return changes;
}

function buildVisibleCandidates(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxCount: number
): AssertionCandidate[] {
  const qualifying: SnapshotNode[] = [];
  for (const node of nodes) {
    if (!VISIBLE_ROLE_ALLOWLIST.has(node.role)) continue;
    if (!node.name || isNoisyText(node.name)) continue;
    if (matchesActedTarget(node.name, actedTargetHint)) continue;
    qualifying.push(node);
  }

  qualifying.sort((a, b) => visibleRolePriority(a.role) - visibleRolePriority(b.role));

  return qualifying.slice(0, maxCount).map((node) => ({
    index,
    afterAction,
    candidate: {
      action: "assertVisible" as const,
      target: buildRoleTarget(node.role, node.name!, framePath),
    },
    confidence: 0.78,
    rationale: "Snapshot delta found a new role/name element after this step.",
    candidateSource,
  }));
}

function buildTextCandidates(
  index: number,
  afterAction: Step["action"],
  nodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource,
  maxCount: number
): AssertionCandidate[] {
  const qualifying: { node: SnapshotNode; text: string }[] = [];
  for (const node of nodes) {
    if (!TEXT_ROLE_ALLOWLIST.has(node.role)) continue;
    const text = (node.text ?? node.name ?? "").trim();
    if (!text || isNoisyText(text)) continue;
    if (matchesActedTarget(text, actedTargetHint)) continue;
    qualifying.push({ node, text });
  }

  qualifying.sort((a, b) => textRolePriority(a.node.role) - textRolePriority(b.node.role));

  return qualifying.slice(0, maxCount).map(({ node, text }) => ({
    index,
    afterAction,
    candidate: {
      action: "assertText" as const,
      target: buildTextTarget(node, text, framePath),
      text,
    },
    confidence: 0.82,
    rationale: "Snapshot delta identified new high-signal text after this step.",
    candidateSource,
  }));
}

function buildRoleTarget(
  role: string,
  name: string,
  framePath: string[] | undefined
): Target {
  return {
    value: "getByRole(" + quote(role) + ", { name: " + quote(name) + " })",
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
      ? "getByRole(" + quote(node.role) + ", { name: " + quote(node.name) + " })"
      : "getByText(" + quote(text) + ")";

  return {
    value,
    kind: "locatorExpression",
    source: "codegen-fallback",
    ...(framePath && framePath.length > 0 ? { framePath } : {}),
  };
}

function extractActedTargetHint(step: Step): string {
  if (step.action === "navigate") return step.url;
  if (step.action === "assertUrl") return step.url;
  if (step.action === "assertTitle") return step.title;
  if ("target" in step && step.target) return step.target.value;
  return "";
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
    node.visible ? "v" : "h",
    node.enabled ? "e" : "d",
  ].join("|");
}

function nodeIdentityKey(node: SnapshotNode): string {
  if (node.ref) {
    return `ref:${normalizeForCompare(node.ref)}`;
  }
  return [
    node.role,
    normalizeForCompare(node.name ?? ""),
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

function textRolePriority(role: string): number {
  switch (role) {
    case "heading": return 0;
    case "alert": return 1;
    case "status": return 2;
    case "tab": return 3;
    case "link": return 4;
    default: return 5;
  }
}

function visibleRolePriority(role: string): number {
  switch (role) {
    case "heading": return 0;
    case "dialog": return 1;
    case "alert": return 2;
    case "link": return 3;
    case "button": return 4;
    case "tab": return 5;
    default: return 6;
  }
}

function stableStructuralRolePriority(role: string): number {
  switch (role) {
    case "navigation": return 0;
    case "banner": return 1;
    case "main": return 2;
    case "contentinfo": return 3;
    default: return 5;
  }
}

function buildStableVisibleCandidates(
  index: number,
  afterAction: Step["action"],
  stableNodes: SnapshotNode[],
  actedTargetHint: string,
  framePath: string[] | undefined,
  candidateSource: AssertionCandidateSource
): AssertionCandidate[] {
  const qualifying: SnapshotNode[] = [];
  for (const node of stableNodes) {
    if (!STABLE_STRUCTURAL_ROLES.has(node.role)) continue;
    if (!node.name || isNoisyText(node.name)) continue;
    if (matchesActedTarget(node.name, actedTargetHint)) continue;
    qualifying.push(node);
  }

  qualifying.sort(
    (a, b) => stableStructuralRolePriority(a.role) - stableStructuralRolePriority(b.role)
  );

  return qualifying.slice(0, 1).map((node) => ({
    index,
    afterAction,
    candidate: {
      action: "assertVisible" as const,
      target: buildRoleTarget(node.role, node.name!, framePath),
    },
    confidence: 0.84,
    rationale: "Stable structural element present in both pre- and post-snapshots.",
    candidateSource,
    stableStructural: true,
  }));
}
