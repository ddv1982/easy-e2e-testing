import type { Step } from "../yaml-schema.js";

export interface PlayOptions {
  headed?: boolean;
  timeout?: number;
  baseUrl?: string;
  delayMs?: number;
  waitForNetworkIdle?: boolean;
  networkIdleTimeout?: number;
  saveFailureArtifacts?: boolean;
  artifactsDir?: string;
  runId?: string;
}

export interface StepResult {
  step: Step;
  index: number;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface PlayFailureArtifacts {
  runId: string;
  testSlug: string;
  reportPath?: string;
  tracePath?: string;
  screenshotPath?: string;
}

export interface TestResult {
  name: string;
  file: string;
  steps: StepResult[];
  passed: boolean;
  durationMs: number;
  failureArtifacts?: PlayFailureArtifacts;
  artifactWarnings?: string[];
}
