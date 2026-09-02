import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e/**/*.spec.ts", "visual/**/*.spec.ts"],
  outputDir: "./test-results/playwright",
  preserveOutput: "failures-only",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [
    ["line"],
    ["json", { outputFile: "test-results/playwright-results.json" }],
  ],
  use: {
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    bypassCSP: false,
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    locale: "en-US",
    permissions: [],
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        /* Real-audio specs press Play with a real click, but headless
         * Firefox still suspends AudioContext under its autoplay policy and
         * the transport sticks at "Starting playback". The predeploy
         * playback gate ships the same two prefs for the same reason. */
        launchOptions: {
          firefoxUserPrefs: {
            "media.autoplay.default": 0,
            "media.autoplay.blocking_policy": 0,
          },
        },
      },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
