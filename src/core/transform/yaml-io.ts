import yaml from "js-yaml";
import type { Step, TestFile } from "../yaml-schema.js";

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
