import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
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
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
