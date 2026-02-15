#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distBin = path.join(repoRoot, "dist", "bin", "ui-test.js");

if (existsSync(distBin)) {
  process.exit(0);
}

const result = spawnSync(process.execPath, [path.join(scriptDir, "prepare-build.mjs")], {
  cwd: repoRoot,
  stdio: "inherit",
  env: process.env,
});

process.exit(typeof result.status === "number" ? result.status : 1);
