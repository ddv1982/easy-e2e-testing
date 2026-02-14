import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { runCapturedCommand } from "../../../infra/process/command-runner.js";
import { collectPlaywrightCliStepSnapshots } from "./playwright-cli-replay.js";
import type { Step } from "../../yaml-schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_FIXTURE_DIR = join(__dirname, "../../../../tests/fixtures/html");

let server: Server | undefined;
let baseUrl = "";
let snapshotCliAvailable = false;

beforeAll(async () => {
  snapshotCliAvailable = await hasPlaywrightCli();
  if (!snapshotCliAvailable) return;

  await new Promise<void>((resolve, reject) => {
    const createdServer = createServer(async (req, res) => {
      try {
        const requestPath = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
        const relativePath = requestPath.replace(/^\/+/, "");
        if (!relativePath) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const filePath = join(HTML_FIXTURE_DIR, relativePath);
        if (!filePath.startsWith(HTML_FIXTURE_DIR)) {
          res.writeHead(400);
          res.end("Invalid path");
          return;
        }

        const content = await readFile(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    createdServer.on("error", reject);
    createdServer.listen(0, "127.0.0.1", () => {
      const address = createdServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to determine integration test server address"));
        return;
      }

      server = createdServer;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}, 60_000);

afterAll(async () => {
  if (!server) return;

  await new Promise<void>((resolve, reject) => {
    server?.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

describe("collectPlaywrightCliStepSnapshots integration", () => {
  it("captures real pre/post snapshots from a replayed click flow", async () => {
    if (!snapshotCliAvailable) return;

    const steps: Step[] = [
      { action: "navigate", url: `${baseUrl}/improve-snapshot.html` },
      {
        action: "click",
        target: { value: "#show-status", kind: "css", source: "manual" },
      },
    ];

    const result = await collectPlaywrightCliStepSnapshots({
      steps,
      timeoutMs: 15_000,
      waitForNetworkIdle: true,
      networkIdleTimeout: 2_000,
    });

    expect(result.available).toBe(true);
    if (result.stepSnapshots.length !== 2) {
      throw new Error(`Unexpected snapshot replay result: ${JSON.stringify(result, null, 2)}`);
    }

    const clickSnapshot = result.stepSnapshots.find((entry) => entry.index === 1);
    expect(clickSnapshot).toBeDefined();
    expect(clickSnapshot?.preSnapshot).not.toContain("Saved successfully");
    expect(clickSnapshot?.postSnapshot).toContain("Saved successfully");
    expect(clickSnapshot?.postSnapshot).not.toBe(clickSnapshot?.preSnapshot);
  }, 90_000);
});

async function hasPlaywrightCli(): Promise<boolean> {
  const direct = await runCapturedCommand("playwright-cli", ["--help"], { timeoutMs: 5_000 });
  if (direct.ok) return true;

  const npx = await runCapturedCommand(
    "npx",
    ["-y", "@playwright/cli@latest", "--help"],
    { timeoutMs: 20_000 }
  );
  return npx.ok;
}
