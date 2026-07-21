import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  createX0AudioRunPaths,
  X0_AUDIO_BUN_VERSION,
  X0_AUDIO_ENVIRONMENT,
  X0_AUDIO_INPUT_MANIFEST_SCHEMA,
  X0_AUDIO_RUNNER_SCHEMA,
} from "../../scripts/run-x0-audio-evidence";

const root = resolve(import.meta.dirname, "../..");
const testRunId = "x0-runner-static-001";
const testHarnessPath = resolve(
  root,
  "test-results/x0-audio-evidence-runs",
  testRunId,
  "harness/x0-audio-browser-harness.js",
);
const digest = "a".repeat(64);

describe("X0 real-audio evidence runner", () => {
  test("uses a traversal-safe ignored run layout and stable schemas", () => {
    const paths = createX0AudioRunPaths(testRunId, root);
    expect(paths).toEqual({
      runDirectory: resolve(
        root,
        "test-results/x0-audio-evidence-runs",
        testRunId,
      ),
      harnessDirectory: resolve(
        root,
        "test-results/x0-audio-evidence-runs",
        testRunId,
        "harness",
      ),
      harnessPath: testHarnessPath,
      inputManifestPath: resolve(
        root,
        "test-results/x0-audio-evidence-runs",
        testRunId,
        "input-manifest.json",
      ),
      metadataPath: resolve(
        root,
        "test-results/x0-audio-evidence-runs",
        testRunId,
        "runner-metadata.json",
      ),
      playwrightResultsPath: resolve(
        root,
        "test-results/x0-audio-evidence-runs",
        testRunId,
        "playwright-results.json",
      ),
    });
    expect(() => createX0AudioRunPaths("../../escape", root)).toThrow(
      "X0_AUDIO_RUN_ID_INVALID",
    );
    expect(X0_AUDIO_BUN_VERSION).toBe("1.3.14");
    expect(X0_AUDIO_RUNNER_SCHEMA).toBe(
      "changes.evidence.x0-audio-runner.v1",
    );
    expect(X0_AUDIO_INPUT_MANIFEST_SCHEMA).toBe(
      "changes.evidence.x0-audio-input-manifest.v1",
    );
    expect(X0_AUDIO_ENVIRONMENT).toEqual({
      runId: "JCPE_X0_AUDIO_RUN_ID",
      harnessPath: "JCPE_X0_AUDIO_HARNESS_PATH",
      harnessSha256: "JCPE_X0_AUDIO_HARNESS_SHA256",
      inputDigest: "JCPE_X0_AUDIO_INPUT_DIGEST",
    });
  });

  test("constrains Playwright to the exact native-audio matrix", async () => {
    const previous = Object.fromEntries(
      Object.values(X0_AUDIO_ENVIRONMENT).map((name) => [
        name,
        process.env[name],
      ]),
    );
    process.env[X0_AUDIO_ENVIRONMENT.runId] = testRunId;
    process.env[X0_AUDIO_ENVIRONMENT.harnessPath] = testHarnessPath;
    process.env[X0_AUDIO_ENVIRONMENT.harnessSha256] = digest;
    process.env[X0_AUDIO_ENVIRONMENT.inputDigest] = digest;

    try {
      const configModule = await import("../../playwright.x0.config");
      const config = configModule.default;
      expect(config.testDir).toBe(resolve(root, "tests/integration"));
      expect(config.testMatch).toBe("audio-offline-render.test.ts");
      expect(config.fullyParallel).toBe(false);
      expect(config.forbidOnly).toBe(true);
      expect(config.failOnFlakyTests).toBe(true);
      expect(config.retries).toBe(0);
      expect(config.workers).toBe(1);
      expect(config.timeout).toBe(configModule.X0_AUDIO_TEST_TIMEOUT_MS);
      expect(config.globalTimeout).toBe(
        configModule.X0_AUDIO_GLOBAL_TIMEOUT_MS,
      );
      expect(config.projects?.map((project) => project.name)).toEqual([
        "chromium",
        "firefox",
        "webkit",
      ]);
      expect(config.use?.serviceWorkers).toBe("block");
      expect(config.reporter).toEqual([
        ["line"],
        [
          "json",
          {
            outputFile: resolve(
              root,
              "test-results/x0-audio-evidence-runs",
              testRunId,
              "playwright-results.json",
            ),
          },
        ],
      ]);
      expect("webServer" in config).toBe(false);
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, name);
        } else {
          process.env[name] = value;
        }
      }
    }
  });

  test("keeps bundling, hashing, atomic writes, and real-Node launch explicit", async () => {
    const source = await Bun.file(
      resolve(root, "scripts/run-x0-audio-evidence.ts"),
    ).text();
    expect(source).toContain("await Bun.build({");
    expect(source).toContain('format: "iife"');
    expect(source).toContain('target: "browser"');
    expect(source).toContain('sourcemap: "none"');
    expect(source).toContain(
      '"tests/integration/audio-offline-render.test.ts"',
    );
    expect(source).toContain(
      '"tests/fixtures/audio-engine/render-matrix.json"',
    );
    expect(source).toContain(
      '"tests/fixtures/audio-engine/impulse-golden.json"',
    );
    expect(source).toContain(
      '"tests/fixtures/audio-engine/trace-ledger.json"',
    );
    expect(source).toContain('"scripts/run-x0-audio-evidence.ts"');
    expect(source).toContain("atomicWrite(paths.harnessPath, bundleBytes)");
    expect(source).toContain("await runNodeTool(\"playwright\", PLAYWRIGHT_ARGS)");
    expect(source).not.toContain("Bun.spawn({");
    expect(source).not.toContain("manualListening: { performed: true");
  });
});
