import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const RUN_ID_ENV = "JCPE_STUDIO_AUDIBLE_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_STUDIO_AUDIBLE_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_STUDIO_AUDIBLE_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_STUDIO_AUDIBLE_INPUT_DIGEST";
const SAFE_RUN_ID = /^[A-Za-z0-9._-]{8,128}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

function requireEnvironment(name: string, pattern: RegExp): string {
  const value = process.env[name];
  if (value === undefined || !pattern.test(value)) {
    throw new Error(
      `${name} is missing or invalid; use scripts/run-studio-audible-evidence.ts.`,
    );
  }
  return value;
}

const root = import.meta.dirname;
const runId = requireEnvironment(RUN_ID_ENV, SAFE_RUN_ID);
const runDirectory = resolve(
  root,
  "test-results/studio-audible-evidence-runs",
  runId,
);
const expectedHarnessPath = resolve(
  runDirectory,
  "harness/studio-audible-browser-harness.js",
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

export const STUDIO_AUDIBLE_TEST_TIMEOUT_MS = 120_000;
export const STUDIO_AUDIBLE_GLOBAL_TIMEOUT_MS = 900_000;

export default defineConfig({
  testDir: resolve(root, "tests/integration"),
  testMatch: "studio-audible-browser-evidence.test.ts",
  outputDir: resolve(runDirectory, "playwright-artifacts"),
  preserveOutput: "always",
  fullyParallel: false,
  forbidOnly: true,
  failOnFlakyTests: true,
  retries: 0,
  workers: 1,
  timeout: STUDIO_AUDIBLE_TEST_TIMEOUT_MS,
  globalTimeout: STUDIO_AUDIBLE_GLOBAL_TIMEOUT_MS,
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
      use: {
        ...devices["Desktop Chrome"],
        /*
         * Chromium's own fallback audio output renders WebAudio with an
         * accurate clock when no PulseAudio server is reachable. Through the
         * headless null sink its output stream starts seconds late, which
         * stalls `currentTime` and turns the sampled window into silence, so
         * the evidence run hides the server from Chromium specifically.
         * Firefox is the opposite: its cubeb backend requires the server or
         * `resume()` never settles.
         */
        launchOptions: {
          env: {
            ...process.env,
            PULSE_SERVER: "unix:/nonexistent-chromium-uses-internal-output",
          },
        },
      },
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
