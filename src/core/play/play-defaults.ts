import { DEFAULT_WAIT_FOR_NETWORK_IDLE } from "../runtime/network-idle.js";

// Single source of truth for play runtime defaults.
export const PLAY_DEFAULT_HEADED = false;
export const PLAY_DEFAULT_TIMEOUT_MS = 10_000;
export const PLAY_DEFAULT_DELAY_MS = 0;
export const PLAY_DEFAULT_WAIT_FOR_NETWORK_IDLE = DEFAULT_WAIT_FOR_NETWORK_IDLE;
export const PLAY_DEFAULT_SAVE_FAILURE_ARTIFACTS = true;
export const PLAY_DEFAULT_ARTIFACTS_DIR = ".ui-test-artifacts";
