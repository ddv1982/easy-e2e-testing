import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Layer = "commands" | "app" | "core" | "infra" | "utils" | "bin" | "root";

interface Violation {
  file: string;
  fromLayer: Layer;
  specifier: string;
  targetLayer: Layer;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "..");

const disallowedImports: Record<Layer, Set<Layer>> = {
  app: new Set(["commands", "bin", "infra"]),
  bin: new Set(["commands", "app", "core", "infra", "utils"]),
  commands: new Set(["infra"]),
  core: new Set(["commands", "app", "bin"]),
  infra: new Set(["commands", "app", "core", "bin"]),
  root: new Set(),
  utils: new Set(["commands", "app", "core", "infra", "bin"]),
};

describe("layer boundaries", () => {
  it("enforces source-layer import constraints", async () => {
    const files = await listSourceFiles(srcRoot);
    const violations: Violation[] = [];

    for (const file of files) {
      const fromLayer = layerForFile(file);
      const disallowed = disallowedImports[fromLayer];
      if (!disallowed || disallowed.size === 0) {
        continue;
      }

      const imports = await findRelativeImports(file);
      for (const specifier of imports) {
        const resolvedImportPath = await resolveImportPath(file, specifier);
        if (!resolvedImportPath) continue;

        const targetLayer = layerForFile(resolvedImportPath);
        if (disallowed.has(targetLayer)) {
          violations.push({
            file: toRepoPath(file),
            fromLayer,
            specifier,
            targetLayer,
          });
        }
      }
    }

    const message =
      violations.length === 0
        ? ""
        : violations
            .map(
              (violation) =>
                `${violation.file}: ${violation.fromLayer} -> ${violation.targetLayer} via ${violation.specifier}`
            )
            .join("\n");
    expect(violations, message).toEqual([]);
  });
});

async function listSourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listSourceFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    if (entry.name.endsWith(".integration.test.ts")) continue;
    out.push(fullPath);
  }
  return out;
}

async function findRelativeImports(filePath: string): Promise<string[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const imports: string[] = [];
  const pattern = /(?:import|export)\s+(?:[^"'`]*?\sfrom\s*)?["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const specifier = match[1];
    if (!specifier || !specifier.startsWith(".")) continue;
    imports.push(specifier);
  }
  return imports;
}

async function resolveImportPath(
  filePath: string,
  specifier: string
): Promise<string | undefined> {
  const fromDir = path.dirname(filePath);
  const candidate = path.resolve(fromDir, specifier);
  const normalized = candidate.endsWith(".js")
    ? candidate.slice(0, -3) + ".ts"
    : candidate;

  const withExtensionCandidates = normalized.endsWith(".ts")
    ? [normalized]
    : [normalized + ".ts", path.join(normalized, "index.ts")];

  for (const importPath of withExtensionCandidates) {
    if (importPath.startsWith(srcRoot) && (await exists(importPath))) {
      return importPath;
    }
  }

  return undefined;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function layerForFile(filePath: string): Layer {
  const relativePath = path.relative(srcRoot, filePath);
  const firstSegment = relativePath.split(path.sep)[0];

  if (firstSegment === "commands") return "commands";
  if (firstSegment === "app") return "app";
  if (firstSegment === "core") return "core";
  if (firstSegment === "infra") return "infra";
  if (firstSegment === "utils") return "utils";
  if (firstSegment === "bin") return "bin";
  return "root";
}

function toRepoPath(filePath: string): string {
  return path.relative(path.resolve(srcRoot, ".."), filePath).replaceAll(path.sep, "/");
}
