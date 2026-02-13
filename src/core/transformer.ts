import yaml from "js-yaml";
import type { Step, TestFile } from "./yaml-schema.js";

/**
 * Represents a single action from Playwright codegen JSONL output.
 * The codegen --target jsonl format outputs one JSON object per line
 * with fields like: type, selector, url, text, key, value, etc.
 */
interface CodegenAction {
  type?: string;
  name?: string;
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  value?: string;
  options?: string[];
  signals?: Array<{ name: string; url?: string }>;
  [key: string]: unknown;
}

export function jsonlToSteps(jsonlContent: string): Step[] {
  const lines = jsonlContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const steps: Step[] = [];

  for (const line of lines) {
    let action: CodegenAction;
    try {
      action = JSON.parse(line);
    } catch {
      continue; // skip malformed lines
    }

    const step = actionToStep(action);
    if (step) steps.push(step);
  }

  return steps;
}

function actionToStep(action: CodegenAction): Step | null {
  const selector = action.selector ?? "";
  const actionName = action.type ?? action.name ?? "";

  switch (actionName) {
    case "openPage":
      if (!action.url || action.url === "about:blank" || action.url === "chrome://newtab/") {
        return null;
      }
      return { action: "navigate", url: action.url };

    case "navigate":
      return { action: "navigate", url: action.url ?? "/" };

    case "click":
      if (!selector) return null;
      return { action: "click", selector };

    case "fill":
      if (!selector) return null;
      return { action: "fill", selector, text: action.text ?? action.value ?? "" };

    case "press":
      if (!selector) return null;
      return { action: "press", selector, key: action.key ?? "" };

    case "check":
      if (!selector) return null;
      return { action: "check", selector };

    case "uncheck":
      if (!selector) return null;
      return { action: "uncheck", selector };

    case "hover":
      if (!selector) return null;
      return { action: "hover", selector };

    case "select":
      if (!selector) return null;
      return { action: "select", selector, value: action.value ?? action.options?.[0] ?? "" };

    case "assertVisible":
      if (!selector) return null;
      return { action: "assertVisible", selector };

    case "assertText":
      if (!selector) return null;
      return { action: "assertText", selector, text: action.text ?? "" };

    case "assertValue":
      if (!selector) return null;
      return { action: "assertValue", selector, value: action.value ?? "" };

    case "assertChecked":
      if (!selector) return null;
      return { action: "assertChecked", selector, checked: true };

    case "closePage":
      return null;

    default:
      return null; // skip unsupported actions
  }
}

export function stepsToYaml(
  name: string,
  steps: Step[],
  options?: { description?: string; baseUrl?: string }
): string {
  const test: TestFile = {
    name,
    ...(options?.description && { description: options.description }),
    ...(options?.baseUrl && { baseUrl: options.baseUrl }),
    steps,
  };
  return yaml.dump(test, { lineWidth: 120, noRefs: true, quotingType: '"' });
}

export function yamlToTest(yamlContent: string): unknown {
  return yaml.load(yamlContent);
}
