import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { play } from "./player.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let server: Server;
const PORT = 8888;

beforeAll(async () => {
  return new Promise<void>((resolve) => {
    server = createServer(async (req, res) => {
      try {
        const filePath = join(__dirname, "../../tests/fixtures/html", req.url!);
        const content = await readFile(filePath, "utf-8");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(PORT, () => {
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("player integration tests", () => {
  it("should successfully play a valid test file", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/valid-test.yaml");
    const result = await play(testFile, { headed: false, timeout: 5000 });

    expect(result.passed).toBe(true);
    expect(result.name).toBe("Valid Test");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].passed).toBe(true);
    expect(result.steps[1].passed).toBe(true);
  }, 30000);

  it("should fail on invalid YAML schema", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/invalid-schema.yaml");

    await expect(play(testFile, { headed: false })).rejects.toThrow(
      /Invalid test file/
    );
  }, 30000);

  it("should fail when element not found", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/missing-element.yaml");
    const result = await play(testFile, { headed: false, timeout: 2000 });

    expect(result.passed).toBe(false);
    expect(result.steps.some((s) => !s.passed)).toBe(true);
    const failedStep = result.steps.find((s) => !s.passed);
    expect(failedStep?.error).toBeDefined();
  }, 30000);
});

describe("player integration - step execution", () => {
  it("should execute click action", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/click-test.yaml");
    const result = await play(testFile, { headed: false, timeout: 5000 });

    expect(result.passed).toBe(true);
  }, 30000);

  it("should execute fill action", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/fill-test.yaml");
    const result = await play(testFile, { headed: false, timeout: 5000 });

    expect(result.passed).toBe(true);
  }, 30000);

  it("should respect custom timeout", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/missing-element.yaml");
    const start = Date.now();
    const result = await play(testFile, { headed: false, timeout: 1000 });
    const duration = Date.now() - start;

    expect(result.passed).toBe(false);
    expect(duration).toBeLessThan(3000); // Should timeout quickly
  }, 30000);

  it("should stop on first failure", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/multi-step-failure.yaml");
    const result = await play(testFile, { headed: false, timeout: 2000 });

    expect(result.passed).toBe(false);
    // Should have stopped after the failed step
    const failedIndex = result.steps.findIndex((s) => !s.passed);
    expect(result.steps).toHaveLength(failedIndex + 1);
  }, 30000);

  it("should return correct test result structure", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/valid-test.yaml");
    const result = await play(testFile, { headed: false });

    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("file");
    expect(result).toHaveProperty("steps");
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("durationMs");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThan(0);
  }, 30000);

  it("should include step duration in results", async () => {
    const testFile = join(__dirname, "../../tests/fixtures/yaml/valid-test.yaml");
    const result = await play(testFile, { headed: false });

    for (const step of result.steps) {
      expect(step).toHaveProperty("durationMs");
      expect(typeof step.durationMs).toBe("number");
      expect(step.durationMs).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});
