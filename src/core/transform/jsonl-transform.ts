import type { Step, Target } from "../yaml-schema.js";
import { classifySelector } from "../selector-classifier.js";
import { locatorNodeToExpression, type JsonlLocatorNode } from "./selector-normalize.js";

export type RecordSelectorPolicy = "reliable" | "raw";

export interface RecordingTransformStats {
  selectorSteps: number;
  stableSelectors: number;
  fallbackSelectors: number;
  frameAwareSelectors: number;
}

export interface JsonlTransformOptions {
  selectorPolicy?: RecordSelectorPolicy;
}

interface CodegenAction {
  type?: string;
  name?: string;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  value?: string;
  options?: string[];
  locator?: JsonlLocatorNode;
  framePath?: string[];
  pageAlias?: string;
  signals?: Array<{ name: string; url?: string }>;
  [key: string]: unknown;
}

interface SelectorResolution {
  target: Target;
  stable: boolean;
  fallback: boolean;
  frameAware: boolean;
}

const selectorActionNames = [
  "click",
  "fill",
  "press",
  "check",
  "uncheck",
  "hover",
  "select",
  "assertVisible",
  "assertText",
  "assertValue",
  "assertChecked",
] as const;

const selectorActionNameSet = new Set<string>(selectorActionNames);

type SelectorActionName = (typeof selectorActionNames)[number];

export function jsonlToSteps(
  jsonlContent: string,
  options: JsonlTransformOptions = {}
): Step[] {
  return jsonlToRecordingSteps(jsonlContent, options).steps;
}

export function jsonlToRecordingSteps(
  jsonlContent: string,
  options: JsonlTransformOptions = {}
): { steps: Step[]; stats: RecordingTransformStats } {
  const lines = jsonlContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const policy = options.selectorPolicy ?? "reliable";
  const steps: Step[] = [];
  const stats: RecordingTransformStats = {
    selectorSteps: 0,
    stableSelectors: 0,
    fallbackSelectors: 0,
    frameAwareSelectors: 0,
  };

  for (const line of lines) {
    let action: CodegenAction;
    try {
      action = JSON.parse(line) as CodegenAction;
    } catch {
      continue;
    }

    const transformed = actionToStep(action, policy);
    if (!transformed) continue;
    steps.push(transformed.step);

    if (transformed.selectorResolution) {
      stats.selectorSteps += 1;
      if (transformed.selectorResolution.stable) stats.stableSelectors += 1;
      if (transformed.selectorResolution.fallback) stats.fallbackSelectors += 1;
      if (transformed.selectorResolution.frameAware) stats.frameAwareSelectors += 1;
    }
  }

  return { steps, stats };
}

function actionToStep(
  action: CodegenAction,
  policy: RecordSelectorPolicy
): { step: Step; selectorResolution?: SelectorResolution } | null {
  const actionName = action.type ?? action.name ?? "";

  if (actionName === "openPage") {
    if (!action.url || action.url === "about:blank" || action.url === "chrome://newtab/") {
      return null;
    }
    return { step: { action: "navigate", url: action.url } };
  }

  if (actionName === "navigate") {
    return { step: { action: "navigate", url: action.url ?? "/" } };
  }

  if (!isSelectorActionName(actionName)) {
    return null;
  }

  const selectorResolution = resolveSelector(action, policy);
  if (!selectorResolution) return null;

  const step = buildSelectorStep(actionName, selectorResolution, action);
  return { step, selectorResolution };
}

function buildSelectorStep(
  actionName: SelectorActionName,
  selectorResolution: SelectorResolution,
  action: CodegenAction
): Step {
  const target = selectorResolution.target;

  switch (actionName) {
    case "click":
      return { action: "click", target };
    case "check":
      return { action: "check", target };
    case "uncheck":
      return { action: "uncheck", target };
    case "hover":
      return { action: "hover", target };
    case "assertVisible":
      return { action: "assertVisible", target };
    case "fill":
      return { action: "fill", target, text: action.text ?? action.value ?? "" };
    case "press":
      return { action: "press", target, key: action.key ?? "" };
    case "select":
      return { action: "select", target, value: action.value ?? action.options?.[0] ?? "" };
    case "assertText":
      return { action: "assertText", target, text: action.text ?? "" };
    case "assertValue":
      return { action: "assertValue", target, value: action.value ?? "" };
    case "assertChecked":
      return { action: "assertChecked", target, checked: true };
    default:
      return assertNever(actionName);
  }
}

function isSelectorActionName(actionName: string): actionName is SelectorActionName {
  return selectorActionNameSet.has(actionName);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled selector action: ${String(value)}`);
}

function resolveSelector(
  action: CodegenAction,
  policy: RecordSelectorPolicy
): SelectorResolution | null {
  const rawSelector = typeof action.selector === "string" ? action.selector.trim() : "";
  const framePath = Array.isArray(action.framePath)
    ? action.framePath.filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    : [];
  const normalized = locatorNodeToExpression(action.locator);

  if (policy === "raw") {
    if (rawSelector) {
      const kind = classifySelector(rawSelector).kind;
      return {
        target: {
          value: rawSelector,
          kind,
          source: "codegen-jsonl",
          ...(framePath.length > 0 ? { framePath } : {}),
        },
        stable: true,
        fallback: false,
        frameAware: framePath.length > 0,
      };
    }

    if (normalized) {
      return {
        target: {
          value: normalized,
          kind: "locatorExpression",
          source: "codegen-jsonl",
          ...(framePath.length > 0 ? { framePath } : {}),
          confidence: 0.8,
          warning: "Raw selector was unavailable, using normalized locator expression.",
        },
        stable: true,
        fallback: true,
        frameAware: framePath.length > 0,
      };
    }

    return null;
  }

  if (normalized) {
    return {
      target: {
        value: normalized,
        kind: "locatorExpression",
        source: "codegen-jsonl",
        ...(framePath.length > 0 ? { framePath } : {}),
      },
      stable: true,
      fallback: false,
      frameAware: framePath.length > 0,
    };
  }

  if (rawSelector) {
    const kind = classifySelector(rawSelector).kind;
    return {
      target: {
        value: rawSelector,
        kind,
        source: "codegen-jsonl",
        ...(framePath.length > 0 ? { framePath } : {}),
        raw: rawSelector,
        confidence: 0.4,
        warning: "Could not normalize selector from codegen locator chain; preserving raw selector.",
      },
      stable: false,
      fallback: true,
      frameAware: framePath.length > 0,
    };
  }

  return null;
}
