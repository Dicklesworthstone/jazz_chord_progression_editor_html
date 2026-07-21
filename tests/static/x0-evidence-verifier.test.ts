import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { sha256Hex, stableJson } from "../../scripts/foundation-io";
import {
  buildX0OwnerSuiteCommand,
  isCanonicalX0InputPath,
  mergeX0EvidenceReports,
  replayX0ImpulseQ15,
  validateX0AutomatedEvidence,
  validateX0TraceOwnerEvidence,
  X0_BROWSER_RUN_SCHEMA,
  X0_PLAYWRIGHT_PRODUCER_FILE,
  X0_PLAYWRIGHT_TESTCASE,
  type X0AutomatedEvidenceInput,
  type X0PackageProofReport,
} from "../../scripts/verify-x0-evidence";
import type { X0ListeningFinding, X0ListeningReport } from
  "../../scripts/verify-x0-listening-evidence";
import impulseGolden from "../fixtures/audio-engine/impulse-golden.json";
import renderMatrix from "../fixtures/audio-engine/render-matrix.json";
import traceLedger from "../fixtures/audio-engine/trace-ledger.json";

type JsonRecord = Record<string, unknown>;

const RUN_ID = "x0-verifier-test-run";
const RUN_PREFIX = `test-results/x0-audio-evidence-runs/${RUN_ID}`;
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const HEX_C = "c".repeat(64);
const BROWSER_PROJECTS = ["chromium", "firefox", "webkit"] as const;
const WORK_NAMES = [
  "operationsStarted",
  "graphNodesCreated",
  "graphEdgesConnected",
  "impulseSamplesWritten",
  "voiceBatchesValidated",
  "voiceSpecsValidated",
  "voicesExaminedForRetrigger",
  "voicesExaminedForRetirement",
  "voicesExaminedForStealing",
  "voicesCreated",
  "scheduledSourcesCreated",
  "registryReads",
  "registryWrites",
  "parameterEventsScheduled",
  "cleanupCallbacksHandled",
] as const;

function work(overrides: Readonly<Record<string, number>>): JsonRecord {
  return Object.fromEntries(
    WORK_NAMES.map((name) => [name, overrides[name] ?? 0]),
  );
}

function renderRecord(
  fixture: (typeof renderMatrix.cases)[number],
): JsonRecord {
  const replay = replayX0ImpulseQ15(fixture.sampleRate, impulseGolden);
  const frameCount = Math.ceil(fixture.sampleRate * fixture.renderDuration);
  const renderEnd = frameCount / fixture.sampleRate;
  const tailWindow = renderMatrix.numericPolicy.tailRmsWindowSeconds;
  return {
    schema: "changes.evidence.x0-offline-render.v1",
    caseId: fixture.id,
    instrumentId: fixture.instrumentId,
    scenario: fixture.scenario,
    sampleRate: fixture.sampleRate,
    masterVolume: renderMatrix.numericPolicy.masterVolume,
    renderDurationSeconds: renderEnd,
    renderFrameCount: frameCount,
    channelCount: renderMatrix.numericPolicy.channelCount,
    initializationState: "ready",
    graph: {
      instanceId: 1,
      persistentCreatedNodeCount: 12,
      persistentEdgeCount: 13,
      contextCreationCount: 1,
    },
    schedule: {
      voiceCount: fixture.midiPitches.length,
      scheduledSourceCount: fixture.expectedSourceCount,
    },
    registryAfterRender: {
      retainedVoiceCount: 0,
      nonreleasingVoiceCount: 0,
      releasingVoiceCount: 0,
      totalIndexReferences: 0,
    },
    impulse: {
      createdBufferCount: 1,
      convolverAssignmentCount: 1,
      assignedGeneratedBufferByIdentity: true,
      numberOfChannels: 2,
      length: replay.frameCount,
      sampleRate: fixture.sampleRate,
    },
    metrics: {
      absolutePeak: 0.1,
      onsetThreshold: renderMatrix.numericPolicy.onsetThreshold,
      onsetSeconds: fixture.start,
      activeRms: 0.01,
      earlyTailRms: 0.001,
      finalTailRms: 0.0001,
      activeWindow: {
        startSeconds: fixture.start,
        endSeconds: Math.min(fixture.release, renderEnd),
      },
      earlyTailWindow: {
        startSeconds: Math.min(fixture.release, renderEnd),
        endSeconds: Math.min(fixture.release + tailWindow, renderEnd),
      },
      finalTailWindow: {
        startSeconds: Math.max(
          Math.min(fixture.release, renderEnd),
          renderEnd - tailWindow,
        ),
        endSeconds: renderEnd,
      },
      nanSampleCount: 0,
      infiniteSampleCount: 0,
      unityClipSampleCount: 0,
      nonZeroSampleCount: 100,
      scalarSampleCount: frameCount * 2,
    },
    hashes: {
      algorithm: "SHA-256",
      pcmEncoding: "channel-interleaved-float32-little-endian",
      impulseEncoding: "q15-interleaved-int16-little-endian",
      webCryptoAvailable: true,
      pcmSha256: HEX_B,
      impulseQ15Sha256: replay.sha256,
    },
    work: work({
      operationsStarted: 3,
      graphNodesCreated: 12,
      graphEdgesConnected: 13,
      impulseSamplesWritten: replay.scalarSamples,
      voiceBatchesValidated: 1,
      voiceSpecsValidated: fixture.midiPitches.length,
      voicesCreated: fixture.midiPitches.length,
      scheduledSourcesCreated: fixture.expectedSourceCount,
      cleanupCallbacksHandled: fixture.expectedSourceCount,
    }),
    listeningAssessment: "not-performed-by-automation",
  };
}

function realContextRecord(userAgent: string): JsonRecord {
  return {
    schema: "changes.evidence.x0-real-audio-context.v1",
    outcome: "completed",
    reasonCode: null,
    userAgent,
    gestureEventType: "click",
    gestureKind: "trusted-pointer",
    gestureTrusted: true,
    nativeAudioContextAvailable: true,
    nativeCancelAndHoldAtTimeAvailable: true,
    platformCreateContextCount: 1,
    initialGraphInstanceId: 1,
    reusedGraphInstanceId: 1,
    reusedExistingGraph: true,
    contextStateAfterInitialization: "running",
    contextSampleRate: 48_000,
    contextTimeBeforeCycles: 0.01,
    contextTimeAfterCleanup: 0.25,
    persistentCreatedNodeCount: 12,
    persistentEdgeCount: 13,
    mixAutomationPath: "native-cancel-and-hold",
    mixAutomationEventDelta: 4,
    cyclesRequested: 100,
    attackSuccessCount: 100,
    retirementSuccessCount: 100,
    retirementNoFutureAttackPostconditionCount: 100,
    cleanupPollCount: 20,
    cleanupComplete: true,
    retainedVoiceCountAfterCleanup: 0,
    registryIndexReferencesAfterCleanup: 0,
    scheduledSourceCount: 200,
    cleanupCallbackCount: 200,
    disposedContextClosed: true,
    engineStateAfterDispose: "closed",
    work: work({
      operationsStarted: 204,
      graphNodesCreated: 12,
      graphEdgesConnected: 13,
      impulseSamplesWritten: 192_000,
      voiceBatchesValidated: 100,
      voiceSpecsValidated: 100,
      voicesExaminedForRetirement: 100,
      voicesCreated: 100,
      scheduledSourcesCreated: 200,
      cleanupCallbacksHandled: 200,
    }),
    listeningAssessment: "not-performed-by-automation",
  };
}

function untrustedContextRecord(userAgent: string): JsonRecord {
  return {
    schema: "changes.evidence.x0-real-audio-context.v1",
    outcome: "refused",
    reasonCode: "X0_REAL_GESTURE_UNTRUSTED",
    userAgent,
    gestureEventType: "click",
    gestureKind: null,
    gestureTrusted: false,
    nativeAudioContextAvailable: true,
    nativeCancelAndHoldAtTimeAvailable: true,
    platformCreateContextCount: 0,
    initialGraphInstanceId: null,
    reusedGraphInstanceId: null,
    reusedExistingGraph: false,
    contextStateAfterInitialization: null,
    contextSampleRate: null,
    contextTimeBeforeCycles: null,
    contextTimeAfterCleanup: null,
    persistentCreatedNodeCount: 0,
    persistentEdgeCount: 0,
    mixAutomationPath: null,
    mixAutomationEventDelta: 0,
    cyclesRequested: 100,
    attackSuccessCount: 0,
    retirementSuccessCount: 0,
    retirementNoFutureAttackPostconditionCount: 0,
    cleanupPollCount: 0,
    cleanupComplete: false,
    retainedVoiceCountAfterCleanup: 0,
    registryIndexReferencesAfterCleanup: 0,
    scheduledSourceCount: 0,
    cleanupCallbackCount: 0,
    disposedContextClosed: false,
    engineStateAfterDispose: null,
    work: null,
    listeningAssessment: "not-performed-by-automation",
  };
}

function unsupportedContextRecord(userAgent: string): JsonRecord {
  return {
    schema: "changes.evidence.x0-real-audio-context.v1",
    outcome: "unsupported",
    reasonCode: "X0_REAL_AUDIO_CONTEXT_UNAVAILABLE",
    userAgent,
    gestureEventType: "click",
    gestureKind: "trusted-pointer",
    gestureTrusted: true,
    nativeAudioContextAvailable: false,
    nativeCancelAndHoldAtTimeAvailable: false,
    platformCreateContextCount: 0,
    initialGraphInstanceId: null,
    reusedGraphInstanceId: null,
    reusedExistingGraph: false,
    contextStateAfterInitialization: null,
    contextSampleRate: null,
    contextTimeBeforeCycles: null,
    contextTimeAfterCleanup: null,
    persistentCreatedNodeCount: 0,
    persistentEdgeCount: 0,
    mixAutomationPath: null,
    mixAutomationEventDelta: 0,
    cyclesRequested: 100,
    attackSuccessCount: 0,
    retirementSuccessCount: 0,
    retirementNoFutureAttackPostconditionCount: 0,
    cleanupPollCount: 0,
    cleanupComplete: false,
    retainedVoiceCountAfterCleanup: 0,
    registryIndexReferencesAfterCleanup: 0,
    scheduledSourceCount: 0,
    cleanupCallbackCount: 0,
    disposedContextClosed: false,
    engineStateAfterDispose: null,
    work: null,
    listeningAssessment: "not-performed-by-automation",
  };
}

function browserRecord(project: string): JsonRecord {
  const userAgent = `${project} deterministic test user agent`;
  const renders = renderMatrix.cases.map(renderRecord);
  const real = realContextRecord(userAgent);
  const untrusted = untrustedContextRecord(userAgent);
  const request = {
    id: "request-001",
    sequence: 1,
    method: "GET",
    url: "http://127.0.0.1:41739/x0-audio-harness.html",
    normalizedUrl: "<x0-audio-harness-document>",
    resourceType: "document",
    navigation: true,
    disposition: "allowed-document",
    status: 200,
  };
  return {
    schema: X0_BROWSER_RUN_SCHEMA,
    traceId: "TR-X0-RENDER",
    runId: RUN_ID,
    inputManifestDigest: "pending",
    harnessSha256: HEX_A,
    producerFile: X0_PLAYWRIGHT_PRODUCER_FILE,
    testcase: X0_PLAYWRIGHT_TESTCASE,
    browser: {
      projectName: project,
      project,
      name: project,
      version: `${project}-149.1`,
      userAgent,
      secureContext: true,
    },
    outcome: "pass",
    requestLog: [],
    consoleErrors: [],
    pageErrors: [],
    offlineRenders: renders,
    realAudioContext: real,
    untrustedAudioContext: untrusted,
    run: {
      runId: RUN_ID,
      inputManifestDigestSha256: "pending",
      nodeVersion: "26.0.0",
    },
    harnessBundle: {
      path: `${RUN_PREFIX}/harness/x0-audio-browser-harness.js`,
      bytes: 100,
      expectedSha256: HEX_A,
      observedSha256: HEX_A,
      format: "self-contained-inline-iife",
    },
    playwright: {
      version: "1.61.1",
      workerIndex: 0,
      retry: 0,
      retriesAllowed: 0,
    },
    fixtures: {
      renderMatrix: {
        path: "tests/fixtures/audio-engine/render-matrix.json",
        schema: renderMatrix.schema,
        bytes: 14,
        sha256: HEX_C,
      },
      impulseGolden: {
        path: "tests/fixtures/audio-engine/impulse-golden.json",
        schema: impulseGolden.schema,
        bytes: 13,
        sha256: HEX_C,
      },
      traceLedger: {
        path: "tests/fixtures/audio-engine/trace-ledger.json",
        schema: traceLedger.schema,
        bytes: 15,
        sha256: HEX_C,
      },
    },
    rawRenderRecords: renders,
    renderExecutionErrors: [],
    realAudioContextRecord: real,
    untrustedAudioContextRecord: untrusted,
    assertions: {
      "run/no-retry": { outcome: "pass", detail: "matched" },
      "diagnostics/single-request": { outcome: "pass", detail: "matched" },
    },
    diagnostics: {
      requests: [request],
      console: [],
      pageErrors: [],
      webErrors: [],
      workers: [],
      webSockets: [],
      dialogs: [],
      pages: [request.url],
      resourceEntries: [],
    },
    findings: [],
    manualListening: {
      performed: false,
      outcome: "not-assessed",
      reason: "Automation cannot hear.",
    },
    listeningAssessment: "not-performed-by-automation",
  };
}

type InputMutation = (state: Readonly<{
  metadata: JsonRecord;
  manifest: JsonRecord;
  playwright: JsonRecord;
  browserRecords: Map<string, JsonRecord>;
  currentComponents: JsonRecord[];
  bundleReplay: JsonRecord;
}>) => void;

async function validInput(
  mutate?: InputMutation,
): Promise<X0AutomatedEvidenceInput> {
  const components: JsonRecord[] = [
    {
      path: "playwright.x0.config.ts",
      roles: ["evidence-driver"],
      bytes: 10,
      sha256: HEX_C,
    },
    {
      path: "scripts/run-x0-audio-evidence.ts",
      roles: ["evidence-driver"],
      bytes: 11,
      sha256: HEX_C,
    },
    {
      path: "src/test-support/x0-audio-browser-harness.ts",
      roles: ["bundle-input"],
      bytes: 12,
      sha256: HEX_C,
    },
    {
      path: "tests/fixtures/audio-engine/impulse-golden.json",
      roles: ["reviewed-authority"],
      bytes: 13,
      sha256: HEX_C,
    },
    {
      path: "tests/fixtures/audio-engine/render-matrix.json",
      roles: ["reviewed-authority"],
      bytes: 14,
      sha256: HEX_C,
    },
    {
      path: "tests/fixtures/audio-engine/trace-ledger.json",
      roles: ["reviewed-authority"],
      bytes: 15,
      sha256: HEX_C,
    },
    {
      path: X0_PLAYWRIGHT_PRODUCER_FILE,
      roles: ["evidence-driver"],
      bytes: 16,
      sha256: HEX_C,
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const digest = await sha256Hex(stableJson(components));
  const manifest: JsonRecord = {
    schema: "changes.evidence.x0-audio-input-manifest.v1",
    algorithm: "sha256-component-manifest-v1",
    digest,
    components,
  };
  const metadata: JsonRecord = {
    schema: "changes.evidence.x0-audio-runner.v1",
    runId: RUN_ID,
    outcome: "pass",
    bunVersion: "1.3.14",
    node: {
      path: "/real/node",
      version: "26.0.0",
      major: 26,
    },
    playwrightVersion: "1.61.1",
    inputManifest: {
      path: `${RUN_PREFIX}/input-manifest.json`,
      algorithm: "sha256-component-manifest-v1",
      digest,
      componentCount: components.length,
    },
    bundle: {
      path: `${RUN_PREFIX}/harness/x0-audio-browser-harness.js`,
      bytes: 100,
      sha256: HEX_A,
      format: "iife",
      target: "browser",
      sourceMap: "none",
      splitting: false,
    },
    playwright: {
      configPath: "playwright.x0.config.ts",
      resultsPath: `${RUN_PREFIX}/playwright-results.json`,
      exitCode: 0,
      retries: 0,
      workers: 1,
      projects: [...BROWSER_PROJECTS],
    },
    manualListening: {
      performed: false,
      outcome: "not-assessed",
      reason: "Automation cannot hear.",
    },
  };
  const browserRecords = new Map(
    BROWSER_PROJECTS.map((project) => [project, browserRecord(project)]),
  );
  for (const record of browserRecords.values()) {
    record["inputManifestDigest"] = digest;
    const run = record["run"] as JsonRecord;
    run["inputManifestDigestSha256"] = digest;
  }
  const tests = BROWSER_PROJECTS.map((project) => ({
    timeout: 300_000,
    annotations: [],
    expectedStatus: "passed",
    projectId: project,
    projectName: project,
    results: [{
      status: "passed",
      retry: 0,
      errors: [],
      annotations: [],
      attachments: [{
        name: `x0-audio-evidence-${project}.json`,
        contentType: "application/json",
        body: Buffer.from(
          `${JSON.stringify(browserRecords.get(project), null, 2)}\n`,
        ).toString("base64"),
      }],
    }],
    status: "expected",
  }));
  const playwright: JsonRecord = {
    config: {
      forbidOnly: true,
      fullyParallel: false,
      failOnFlakyTests: true,
      workers: 1,
      version: "1.61.1",
      projects: BROWSER_PROJECTS.map((name) => ({
        name,
        retries: 0,
        repeatEach: 1,
      })),
    },
    suites: [{
      title: "audio-offline-render.test.ts",
      file: "audio-offline-render.test.ts",
      specs: [{
        title: X0_PLAYWRIGHT_TESTCASE,
        file: "audio-offline-render.test.ts",
        ok: true,
        tags: [],
        tests,
      }],
      suites: [],
    }],
    errors: [],
  };
  const currentComponents = components.map((component) => ({
    path: component["path"],
    bytes: component["bytes"],
    sha256: component["sha256"],
  }));
  const bundleReplay: JsonRecord = {
    inputs: ["src/test-support/x0-audio-browser-harness.ts"],
    bytes: 100,
    sha256: HEX_A,
  };
  mutate?.({
    metadata,
    manifest,
    playwright,
    browserRecords,
    currentComponents,
    bundleReplay,
  });
  if (mutate !== undefined) {
    for (const testResult of tests) {
      const project = testResult.projectName;
      const result = testResult.results[0];
      const attachment = result?.attachments[0];
      if (attachment !== undefined) {
        attachment.body = Buffer.from(
          `${JSON.stringify(browserRecords.get(project), null, 2)}\n`,
        ).toString("base64");
      }
    }
  }
  const rawBrowserFiles = await Promise.all(
    BROWSER_PROJECTS.map(async (project) => {
      const value = browserRecords.get(project);
      const bytes = new TextEncoder().encode(
        `${JSON.stringify(value, null, 2)}\n`,
      );
      return {
        project,
        value,
        artifact: {
          path: `${RUN_PREFIX}/${project}.json`,
          bytes: bytes.byteLength,
          sha256: await sha256Hex(bytes),
        },
      };
    }),
  );
  return {
    runnerMetadata: metadata,
    inputManifest: manifest,
    playwrightReport: playwright,
    renderMatrix,
    impulseGolden,
    traceLedger,
    artifacts: {
      runnerMetadata: {
        path: `${RUN_PREFIX}/runner-metadata.json`,
        bytes: 50,
        sha256: HEX_B,
      },
      inputManifest: {
        path: `${RUN_PREFIX}/input-manifest.json`,
        bytes: 50,
        sha256: HEX_B,
      },
      harnessBundle: {
        path: `${RUN_PREFIX}/harness/x0-audio-browser-harness.js`,
        bytes: 100,
        sha256: HEX_A,
      },
      playwrightReport: {
        path: `${RUN_PREFIX}/playwright-results.json`,
        bytes: 50,
        sha256: HEX_B,
      },
    },
    currentComponents: currentComponents.map((component) => ({
      path: String(component["path"]),
      bytes: Number(component["bytes"]),
      sha256: String(component["sha256"]),
    })),
    bundleReplay: {
      inputs: Array.isArray(bundleReplay["inputs"])
        ? bundleReplay["inputs"].map(String)
        : [],
      bytes: Number(bundleReplay["bytes"]),
      sha256: String(bundleReplay["sha256"]),
    },
    rawBrowserFiles,
  };
}

const incompleteListeningFinding: X0ListeningFinding = Object.freeze({
  code: "X0_LISTENING_EVIDENCE_MISSING",
  path: "release-evidence/audio/listening/x0-listening-v1.json",
  message: "Human evidence is not present.",
  disposition: "incomplete",
});

const incompleteListening: X0ListeningReport = Object.freeze({
  schema: "changes.validation.x0-listening-evidence.v1",
  traceId: "TR-X0-LISTENING",
  outcome: "incomplete",
  expectedRecords: 66,
  observedRecords: 0,
  passingRecords: 0,
  unsupportedRecords: 0,
  failingRecords: 0,
  expectedCells: Object.freeze([]),
  observedCells: Object.freeze([]),
  findings: Object.freeze([incompleteListeningFinding]),
});

function passingPackageProof(): X0PackageProofReport {
  const artifact = Object.freeze({ path: "test-results/x0-proof", bytes: 1, sha256: HEX_A });
  const snapshot = Object.freeze({
    algorithm: "sha256-component-manifest-v1" as const,
    digest: HEX_A,
    components: Object.freeze([artifact]),
  });
  return Object.freeze({
    outcome: "pass",
    input: Object.freeze({ pre: snapshot, post: snapshot }),
    contractValidator: Object.freeze({
      command: Object.freeze(["bun", "scripts/validate-x0-contract.ts"]),
      environment: Object.freeze({ TZ: "UTC" }),
      exitCode: 0,
      elapsedMilliseconds: 1,
      stdout: artifact,
      stderr: artifact,
    }),
    ownerSuite: Object.freeze({
      command: Object.freeze(["bun", "test"]),
      environment: Object.freeze({ TZ: "UTC" }),
      exitCode: 0,
      elapsedMilliseconds: 1,
      junit: artifact,
      stdout: artifact,
      stderr: artifact,
      tests: 1,
      assertions: 1,
      failures: 0,
      errors: 0,
      skipped: 0,
      files: Object.freeze(["tests/integration/audio-engine.test.ts"]),
      cases: Object.freeze([{
        file: "tests/integration/audio-engine.test.ts",
        name: "passes",
      }]),
    }),
    traceOwners: Object.freeze([]),
    findings: Object.freeze([]),
  });
}

describe("X0 package evidence verifier", () => {
  test("uses Bun 1.3.14's real JUnit reporter CLI and emits machine-readable owner identities", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jcpe-x0-junit-"));
    const junitPath = join(directory, "owner-probe.junit.xml");
    const command = buildX0OwnerSuiteCommand(junitPath, [
      "tests/golden/audio-impulse.test.ts",
    ]);
    expect(command.slice(-4)).toEqual([
      "--max-concurrency=1",
      "--retry=0",
      "--reporter=junit",
      `--reporter-outfile=${junitPath}`,
    ]);
    const child = Bun.spawn({
      cmd: [...command],
      cwd: resolve(import.meta.dirname, "../.."),
      env: { ...process.env, LANG: "C", LC_ALL: "C", TZ: "UTC" },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
    const junit = await Bun.file(junitPath).text();
    expect(junit).toContain('<testsuites name="bun test" tests="2"');
    expect(junit).toContain('file="tests/golden/audio-impulse.test.ts"');
    expect(junit).toContain("X0-ROUTE-001");
    expect(junit).toContain("X0-RENDER-003/X0-RENDER-006");
  }, 20_000);

  test("rejects traversal and noncanonical manifest component paths", async () => {
    expect(isCanonicalX0InputPath("src/audio/audio-engine.ts")).toBe(true);
    for (const path of [
      "foo/../../outside",
      "./src/audio/audio-engine.ts",
      "src//audio/audio-engine.ts",
      "src/audio/../audio/audio-engine.ts",
      "src/audio/",
      "/etc/passwd",
      "src\\audio\\audio-engine.ts",
    ]) {
      expect(isCanonicalX0InputPath(path), path).toBe(false);
    }

    const actual = await validateX0AutomatedEvidence(await validInput((state) => {
      const components = state.manifest["components"] as JsonRecord[];
      const first = components[0];
      if (first !== undefined) first["path"] = "foo/../../outside";
    }));
    expect(actual.outcome).toBe("fail");
    expect(actual.findings.map(({ code }) => code)).toContain(
      "X0_EVIDENCE_INPUT_PATH",
    );
  }, 20_000);

  test("independently reproduces every reviewed impulse-rate hash", () => {
    expect(replayX0ImpulseQ15(44_100, impulseGolden)).toEqual({
      sampleRate: 44_100,
      frameCount: 88_200,
      scalarSamples: 176_400,
      finalStateUint32: 986_166_539,
      sha256: "d5c074e95e0a0cf31ea263a3f749a1b85f353f2cdd49deaaedebfc4ec5f48633",
    });
    expect(replayX0ImpulseQ15(48_000, impulseGolden).sha256).toBe(
      impulseGolden.referenceInterleavedInt16LeSha256,
    );
    expect(replayX0ImpulseQ15(96_000, impulseGolden)).toEqual({
      sampleRate: 96_000,
      frameCount: 192_000,
      scalarSamples: 384_000,
      finalStateUint32: 3_538_051_940,
      sha256: "fe3b2d83f016720c16a7359b32bc34350bf36901fa2811273121ebe750b48d3a",
    });
  });

  test("accepts exactly three hash-bound browsers, forty-five renders, and three real probes", async () => {
    const automated = await validateX0AutomatedEvidence(await validInput());
    expect(automated.outcome).toBe("pass");
    expect(automated.observedBrowserRecords).toBe(3);
    expect(automated.observedRenderCells).toBe(45);
    expect(automated.passingRealContextCells).toBe(3);
    expect(automated.producerKeys).toHaveLength(45);
    expect(automated.producerKeys.every((key) =>
      key.startsWith(
        `TR-X0-RENDER|${X0_PLAYWRIGHT_PRODUCER_FILE}|${X0_PLAYWRIGHT_TESTCASE}|`,
      )
    )).toBe(true);
    expect(automated.findings).toEqual([]);

    const merged = mergeX0EvidenceReports(
      automated,
      incompleteListening,
      passingPackageProof(),
    );
    expect(merged.outcome).toBe("incomplete");
    expect(merged.automated.outcome).toBe("pass");
    expect(merged.humanListening.outcome).toBe("incomplete");
  });

  test("rejects retries, expected failures, duplicate projects, and unsupported real audio", async () => {
    const actual = await validateX0AutomatedEvidence(await validInput((state) => {
      const suites = state.playwright["suites"] as JsonRecord[];
      const specs = suites[0]?.["specs"] as JsonRecord[];
      const tests = specs[0]?.["tests"] as JsonRecord[];
      const first = tests[0];
      const second = tests[1];
      const firstResults = first?.["results"] as JsonRecord[];
      if (first !== undefined) first["expectedStatus"] = "failed";
      if (firstResults[0] !== undefined) firstResults[0]["retry"] = 1;
      if (second !== undefined) second["projectName"] = "chromium";
      const webkit = state.browserRecords.get("webkit");
      const real = webkit?.["realAudioContext"] as JsonRecord | undefined;
      if (real !== undefined) real["outcome"] = "unsupported";
    }));
    expect(actual.outcome).toBe("fail");
    const codes = new Set(actual.findings.map(({ code }) => code));
    expect(codes.has("X0_EVIDENCE_EXPECTED_FAILURE")).toBe(true);
    expect(codes.has("X0_EVIDENCE_RESULT_RETRY")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_DUPLICATE")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_MISSING")).toBe(true);
    expect(codes.has("X0_EVIDENCE_REAL_UNSUPPORTED_REASON")).toBe(true);
  });

  test("rejects source drift, closure drift, producer drift, bad thresholds, and trusted impulse drift", async () => {
    const actual = await validateX0AutomatedEvidence(await validInput((state) => {
      const firstComponent = state.currentComponents[0];
      if (firstComponent !== undefined) firstComponent["sha256"] = "0".repeat(64);
      state.bundleReplay["inputs"] = [];
      const chromium = state.browserRecords.get("chromium");
      if (chromium === undefined) return;
      chromium["producerFile"] = "tests/integration/wrong-owner.test.ts";
      const renders = chromium["offlineRenders"] as JsonRecord[];
      const first = renders[0];
      const metrics = first?.["metrics"] as JsonRecord | undefined;
      const hashes = first?.["hashes"] as JsonRecord | undefined;
      if (metrics !== undefined) metrics["absolutePeak"] = 1;
      if (hashes !== undefined) hashes["impulseQ15Sha256"] = "0".repeat(64);
    }));
    expect(actual.outcome).toBe("fail");
    const codes = new Set(actual.findings.map(({ code }) => code));
    expect(codes.has("X0_EVIDENCE_INPUT_HASH")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BUNDLE_CLOSURE")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_PRODUCER")).toBe(true);
    expect(codes.has("X0_EVIDENCE_RENDER_PEAK")).toBe(true);
    expect(codes.has("X0_EVIDENCE_RENDER_IMPULSE_HASH")).toBe(true);
  });

  test("keeps an explicitly unsupported trusted capability non-passing and incomplete", async () => {
    const actual = await validateX0AutomatedEvidence(await validInput((state) => {
      state.metadata["outcome"] = "fail";
      const metadataPlaywright = state.metadata["playwright"] as JsonRecord;
      metadataPlaywright["exitCode"] = 1;
      const suites = state.playwright["suites"] as JsonRecord[];
      const specs = suites[0]?.["specs"] as JsonRecord[];
      const spec = specs[0];
      const tests = spec?.["tests"] as JsonRecord[];
      if (spec !== undefined) spec["ok"] = false;
      const webkitTest = tests.find((item) => item["projectName"] === "webkit");
      if (webkitTest !== undefined) {
        webkitTest["status"] = "unexpected";
        const results = webkitTest["results"] as JsonRecord[];
        const result = results[0];
        if (result !== undefined) {
          result["status"] = "failed";
          result["errors"] = [{ message: "Unsupported AudioContext capability." }];
        }
      }
      const webkit = state.browserRecords.get("webkit");
      if (webkit === undefined) return;
      const browser = webkit["browser"] as JsonRecord;
      const unsupported = unsupportedContextRecord(String(browser["userAgent"]));
      webkit["outcome"] = "fail";
      webkit["realAudioContext"] = unsupported;
      webkit["realAudioContextRecord"] = unsupported;
      webkit["findings"] = [{
        code: "X0_REAL_AUDIO_CONTEXT_UNSUPPORTED",
        message:
          "AudioContext unsupported for webkit webkit-149.1: outcome unsupported, reason X0_REAL_AUDIO_CONTEXT_UNAVAILABLE.",
        assertion: "real-context/completed",
        diagnosticIds: [],
      }];
      const assertions = webkit["assertions"] as JsonRecord;
      assertions["real-context/completed"] = {
        outcome: "fail",
        detail: "X0_REAL_AUDIO_CONTEXT_UNAVAILABLE",
      };
    }));
    expect(actual.outcome).toBe("incomplete");
    expect(actual.passingRealContextCells).toBe(2);
    expect(actual.unsupportedRealContextCells).toBe(1);
    expect(actual.findings.filter(({ disposition }) => disposition === "fail")).toEqual([]);
    expect(actual.findings.map(({ code }) => code)).toEqual([
      "X0_EVIDENCE_REAL_UNSUPPORTED",
    ]);
  }, 20_000);

  test("allows only the exact bounded inline Firefox favicon resource", async () => {
    const allowed = await validateX0AutomatedEvidence(await validInput((state) => {
      const firefox = state.browserRecords.get("firefox");
      const diagnostics = firefox?.["diagnostics"] as JsonRecord | undefined;
      if (diagnostics !== undefined) {
        diagnostics["resourceEntries"] = [
          "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
        ];
      }
    }));
    expect(allowed.outcome).toBe("pass");
    expect(allowed.findings).toEqual([]);

    const rejected = await validateX0AutomatedEvidence(await validInput((state) => {
      const chromium = state.browserRecords.get("chromium");
      const chromiumDiagnostics = chromium?.["diagnostics"] as
        | JsonRecord
        | undefined;
      if (chromiumDiagnostics !== undefined) {
        chromiumDiagnostics["resourceEntries"] = [
          "http://127.0.0.1:41739/favicon.svg",
        ];
      }
      const webkit = state.browserRecords.get("webkit");
      const webkitDiagnostics = webkit?.["diagnostics"] as
        | JsonRecord
        | undefined;
      if (webkitDiagnostics !== undefined) {
        webkitDiagnostics["resourceEntries"] = [
          "data:image/svg+xml,%3Csvg%3Eattacker-controlled%3C/svg%3E",
        ];
      }
    }));
    expect(rejected.outcome).toBe("fail");
    expect(
      rejected.findings.filter(
        ({ code }) => code === "X0_EVIDENCE_BROWSER_RESOURCE_ENTRY",
      ),
    ).toHaveLength(2);
  }, 20_000);

  test("rejects a green alias layer that contradicts raw records and rich diagnostics", async () => {
    const actual = await validateX0AutomatedEvidence(await validInput((state) => {
      const chromium = state.browserRecords.get("chromium");
      if (chromium === undefined) return;
      chromium["traceId"] = "TR-WRONG";
      const offline = structuredClone(chromium["offlineRenders"]);
      const offlineRecords = offline as JsonRecord[];
      const firstMetrics = offlineRecords[0]?.["metrics"] as JsonRecord | undefined;
      if (firstMetrics !== undefined) firstMetrics["absolutePeak"] = 0.2;
      chromium["offlineRenders"] = offline;
      chromium["realAudioContext"] = {
        ...(chromium["realAudioContext"] as JsonRecord),
        cleanupComplete: false,
      };
      const untrusted = chromium["untrustedAudioContext"] as JsonRecord;
      untrusted["platformCreateContextCount"] = 1;
      chromium["renderExecutionErrors"] = [{
        caseId: "X0-RENDER-001",
        message: "concealed render failure",
      }];
      chromium["findings"] = [{
        code: "CONCEALED",
        message: "concealed producer finding",
        assertion: null,
        diagnosticIds: [],
      }];
      const assertions = chromium["assertions"] as JsonRecord;
      assertions["concealed/assertion"] = {
        outcome: "fail",
        detail: "concealed assertion failure",
      };
      const fixtures = chromium["fixtures"] as JsonRecord;
      const renderFixture = fixtures["renderMatrix"] as JsonRecord;
      renderFixture["sha256"] = "0".repeat(64);
      const diagnostics = chromium["diagnostics"] as JsonRecord;
      const requests = diagnostics["requests"] as JsonRecord[];
      requests.push({
        id: "request-002",
        sequence: 2,
        method: "GET",
        url: "https://example.invalid/forbidden",
        normalizedUrl: "https://example.invalid/forbidden",
        resourceType: "fetch",
        navigation: false,
        disposition: "blocked",
        failure: "blockedbyclient",
      });
    }));
    const codes = new Set(actual.findings.map(({ code }) => code));
    expect(codes.has("X0_EVIDENCE_BROWSER_TRACE")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_RENDER_ALIAS")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_REAL_ALIAS")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_RENDER_ERRORS")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_FINDINGS")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_ASSERTION_FAILED")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_FIXTURE_HASH")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_REQUEST_COUNT")).toBe(true);
    expect(codes.has("X0_EVIDENCE_BROWSER_REQUEST_ALIAS")).toBe(true);
    expect(codes.has("X0_EVIDENCE_UNTRUSTED_SIDE_EFFECT")).toBe(true);
  });

  test("does not let one passing owner-file testcase bless an unnamed trace case", () => {
    const ownerSuite = passingPackageProof().ownerSuite;
    const validation = validateX0TraceOwnerEvidence(
      {
        traces: [{
          id: "TR-X0-MUTATION",
          evidenceOwner: "tests/integration/audio-engine.test.ts",
          caseIds: ["X0-NAMED-001", "X0-UNNAMED-002"],
        }],
      },
      {
        ...ownerSuite,
        cases: [{
          file: "tests/integration/audio-engine.test.ts",
          name: "X0-NAMED-001 has direct proof",
        }],
      },
    );
    expect(validation.rows).toEqual([{
      traceId: "TR-X0-MUTATION",
      evidenceOwner: "tests/integration/audio-engine.test.ts",
      caseIds: ["X0-NAMED-001", "X0-UNNAMED-002"],
      observedTestcases: 1,
      producerKeys: [
        "TR-X0-MUTATION|tests/integration/audio-engine.test.ts|X0-NAMED-001 has direct proof|X0-NAMED-001",
      ],
      outcome: "fail",
    }]);
    expect(validation.findings.map(({ code }) => code)).toEqual([
      "X0_EVIDENCE_TRACE_OWNER",
    ]);
  });
});
