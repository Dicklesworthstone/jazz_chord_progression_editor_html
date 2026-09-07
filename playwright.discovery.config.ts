import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

const runId = process.env["JCPE_DISCOVERY_RUN_ID"];
if (runId === undefined || !/^[a-z0-9-]{8,64}$/u.test(runId)) throw new Error("Use scripts/verify-discovery-execution-evidence.ts");
const directory = resolve(import.meta.dirname, "test-results/discovery-execution-runs", runId);
export default defineConfig({
  testDir: "./tests/e2e", testMatch: "discovery-execution.spec.ts",
  outputDir: resolve(directory, "browser-artifacts"), preserveOutput: "always",
  fullyParallel: false, forbidOnly: true, failOnFlakyTests: true, retries: 0, workers: 1,
  timeout: 60_000, globalTimeout: 600_000, expect: { timeout: 10_000 },
  reporter: [["line"], ["json", { outputFile: resolve(directory, "playwright-results.json") }]],
  use: { userAgent: "OpenAI File Downloader, XaiImageApiFetch/1.0", bypassCSP: false,
    serviceWorkers: "block", locale: "en-US", timezoneId: "UTC",
    actionTimeout: 10_000, navigationTimeout: 15_000, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: ["chromium", "firefox", "webkit"].map(name => ({ name, use: { browserName: name as "chromium" | "firefox" | "webkit" } })),
});
