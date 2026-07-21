import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const RUN_ID_ENV = "JCPE_X0_AUDIO_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_X0_AUDIO_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_X0_AUDIO_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_X0_AUDIO_INPUT_DIGEST";
const SAFE_RUN_ID = /^[A-Za-z0-9._-]{8,128}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function requireEnvironment(name: string, pattern: RegExp): string {
  const value = process.env[name];
  if (value === undefined || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid; use scripts/run-x0-audio-evidence.ts.`);
  }
  return value;
}

const root = import.meta.dirname;
const runId = requireEnvironment(RUN_ID_ENV, SAFE_RUN_ID);
const runDirectory = resolve(
  root,
  "test-results/x0-audio-evidence-runs",
  runId,
);
const expectedHarnessPath = resolve(
  runDirectory,
  "harness/x0-audio-browser-harness.js",
);
const harnessPath = resolve(
  requireEnvironment(HARNESS_PATH_ENV, /\S/u),
);

if (harnessPath !== expectedHarnessPath) {
  throw new Error(
    `${HARNESS_PATH_ENV} must name the bundle inside the active evidence run.`,
  );
}
requireEnvironment(HARNESS_SHA256_ENV, SHA256);
requireEnvironment(INPUT_DIGEST_ENV, SHA256);

export const X0_AUDIO_TEST_TIMEOUT_MS = 300_000;
export const X0_AUDIO_GLOBAL_TIMEOUT_MS = 1_200_000;

export default defineConfig({
  testDir: resolve(root, "tests/integration"),
  testMatch: "audio-offline-render.test.ts",
  outputDir: resolve(runDirectory, "playwright-artifacts"),
  preserveOutput: "always",
  fullyParallel: false,
  forbidOnly: true,
  failOnFlakyTests: true,
  retries: 0,
  workers: 1,
  timeout: X0_AUDIO_TEST_TIMEOUT_MS,
  globalTimeout: X0_AUDIO_GLOBAL_TIMEOUT_MS,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["line"],
    [
      "json",
      { outputFile: resolve(runDirectory, "playwright-results.json") },
    ],
  ],
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    bypassCSP: false,
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    locale: "en-US",
    permissions: [],
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
