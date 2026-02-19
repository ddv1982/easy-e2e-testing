import { spawnSync } from "node:child_process";
import { accessSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function extractTarballName(output) {
  const lines = output
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) continue;
    const match = /([^\s]+\.tgz)\s*$/.exec(line);
    if (match?.[1]) {
      return path.basename(match[1]);
    }
  }

  return undefined;
}

export function packCurrentWorkspaceSilent() {
  const result = spawnSync("npm", ["pack", ".", "--silent"], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`npm pack . --silent failed with status ${result.status ?? 1}.`);
  }

  const tarball =
    extractTarballName(result.stdout ?? "") ?? extractTarballName(result.stderr ?? "");
  if (!tarball) {
    throw new Error(
      "npm pack . --silent did not return a tarball filename on stdout/stderr."
    );
  }

  const tarballPath = path.resolve(process.cwd(), tarball);
  accessSync(tarballPath);
  return tarballPath;
}

export function removeTarball(tarballPath) {
  rmSync(tarballPath, { force: true });
}

export function runPackSilentCheck() {
  const tarballPath = packCurrentWorkspaceSilent();
  const tarballName = path.basename(tarballPath);
  removeTarball(tarballPath);
  process.stdout.write(`${tarballName}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runPackSilentCheck();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
