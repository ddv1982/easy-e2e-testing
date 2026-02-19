import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packCurrentWorkspaceSilent, removeTarball } from "./check-pack-silent.mjs";

export function runGlobalInstallDryRun() {
  const tarballPath = packCurrentWorkspaceSilent();
  const globalPrefix = path.join(
    os.tmpdir(),
    `ui-test-global-install-${process.pid}-${Date.now()}`
  );

  try {
    mkdirSync(globalPrefix, { recursive: true });
    mkdirSync(path.join(globalPrefix, "lib"), { recursive: true });
    mkdirSync(path.join(globalPrefix, "bin"), { recursive: true });

    const result = spawnSync("npm", ["i", "-g", tarballPath, "--dry-run"], {
      encoding: "utf-8",
      env: {
        ...process.env,
        npm_config_prefix: globalPrefix,
      },
    });

    if (result.status !== 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      throw new Error(
        `npm i -g <tarball> --dry-run failed with status ${result.status ?? 1}.`
      );
    }
  } finally {
    removeTarball(tarballPath);
    rmSync(globalPrefix, { recursive: true, force: true });
  }

  process.stdout.write("global-install-dry-run-ok\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runGlobalInstallDryRun();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}
