import { looksLikeLocatorExpression } from "./locator-expression.js";

export type SelectorKind =
  | "locatorExpression"
  | "playwrightSelector"
  | "css"
  | "xpath"
  | "internal"
  | "unknown";

export interface SelectorClassification {
  kind: SelectorKind;
  selector: string;
}

const ENGINE_PREFIX = /^[a-zA-Z_][a-zA-Z0-9_-]*=/;

export function classifySelector(selector: string): SelectorClassification {
  const trimmed = selector.trim();

  if (!trimmed) {
    return { kind: "unknown", selector: trimmed };
  }

  if (looksLikeLocatorExpression(trimmed)) {
    return { kind: "locatorExpression", selector: trimmed };
  }

  if (looksLikeInternalSelector(trimmed)) {
    return { kind: "internal", selector: trimmed };
  }

  if (isPlaywrightSelectorEngine(trimmed)) {
    return { kind: "playwrightSelector", selector: trimmed };
  }

  if (looksLikeXpath(trimmed)) {
    return { kind: "xpath", selector: trimmed };
  }

  if (looksLikeCss(trimmed)) {
    return { kind: "css", selector: trimmed };
  }

  if (trimmed.includes(">>")) {
    return { kind: "playwrightSelector", selector: trimmed };
  }

  return { kind: "unknown", selector: trimmed };
}

export function isPlaywrightSelectorEngine(selector: string): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("internal:")) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return false;
  return ENGINE_PREFIX.test(trimmed);
}

function looksLikeInternalSelector(selector: string): boolean {
  return (
    selector.startsWith("internal:") ||
    selector.includes(" >> internal:") ||
    selector.includes("internal:control=enter-frame")
  );
}

function looksLikeXpath(selector: string): boolean {
  if (
    selector.startsWith("//") ||
    selector.startsWith("..") ||
    selector.startsWith(".//") ||
    selector.startsWith("..//") ||
    selector.startsWith("(//")
  ) {
    return true;
  }
  return false;
}

function looksLikeCss(selector: string): boolean {
  if (
    selector.startsWith("#") ||
    selector.startsWith(".") ||
    selector.startsWith("[") ||
    selector.startsWith(":") ||
    selector.startsWith("*")
  ) {
    return true;
  }

  if (/^[a-zA-Z][a-zA-Z0-9_-]*(?:$|[.#:[\s>~+])/u.test(selector)) {
    return true;
  }

  return false;
}
