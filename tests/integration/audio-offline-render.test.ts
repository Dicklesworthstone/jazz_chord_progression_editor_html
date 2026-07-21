import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type Request,
  type TestInfo,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type {
  X0AudioBrowserEvidenceHarness,
  X0OfflineRenderCaseInput,
  X0OfflineRenderRecord,
  X0RealAudioContextProbeRecord,
} from "../../src/test-support/x0-audio-browser-harness";

const TRACE_ID = "TR-X0-RENDER";
const RECORD_SCHEMA = "changes.evidence.x0-browser-run.v1";
const TEST_TITLE = "records the complete native X0 audio evidence";
const PRODUCER_FILE = "tests/integration/audio-offline-render.test.ts";
const HARNESS_GLOBAL = "__JCPE_X0_AUDIO_EVIDENCE__";
const REAL_PROBE_PROMISE_GLOBAL = "__JCPE_X0_REAL_PROBE_PROMISE__";
const RUN_ID_ENV = "JCPE_X0_AUDIO_RUN_ID";
const HARNESS_PATH_ENV = "JCPE_X0_AUDIO_HARNESS_PATH";
const HARNESS_SHA256_ENV = "JCPE_X0_AUDIO_HARNESS_SHA256";
const INPUT_DIGEST_ENV = "JCPE_X0_AUDIO_INPUT_DIGEST";
const HARNESS_DOCUMENT_URL =
  "http://127.0.0.1:41739/x0-audio-harness.html";
const REAL_CONTEXT_CYCLES = 100;
const EXPECTED_PERSISTENT_NODE_COUNT = 12;
const EXPECTED_PERSISTENT_EDGE_COUNT = 13;
const EXPECTED_REAL_SOURCE_COUNT = 200;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/u;

const EXPECTED_RENDER_IDS = Object.freeze([
  "X0-RENDER-001",
  "X0-RENDER-002",
  "X0-RENDER-003",
  "X0-RENDER-004",
  "X0-RENDER-005",
  "X0-RENDER-006",
  "X0-RENDER-007",
  "X0-RENDER-008",
  "X0-RENDER-009",
  "X0-RENDER-010",
  "X0-RENDER-011",
  "X0-RENDER-012",
  "X0-RENDER-013",
  "X0-RENDER-014",
  "X0-RENDER-015",
] as const);

const WORK_COUNTER_NAMES = Object.freeze([
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
] as const);

type RenderAssertion =
  | "finite"
  | "non-silent"
  | "onset-window"
  | "bounded-peak"
  | "bounded-active-rms"
  | "no-unity-clipping"
  | "tail-present"
  | "tail-decays"
  | "final-rms-bounded"
  | "voice-cleanup-before-eight-seconds";

type RenderNumericPolicy = Readonly<{
  analysisPolicyVersion: 1;
  channelCount: 2;
  masterVolume: number;
  frameCountRule: "ceil(sampleRate*renderDuration)";
  scalarAggregation: "all channels per frame in ascending channel order";
  absolutePeakMaximumExclusive: number;
  nonSilentAbsolutePeakMinimum: number;
  activeRmsMinimum: number;
  activeRmsMaximumExclusive: number;
  onsetThreshold: number;
  onsetComparison: string;
  onsetToleranceSeconds: number;
  activeRmsWindow: "[start,release)";
  tailRmsWindowSeconds: number;
  earlyTailRmsWindow: string;
  finalTailRmsWindow: string;
  tailPresentRmsMinimum: number;
  tailFinalRmsMaximum: number;
  tailDecayMinimumRatio: number;
  tailDecayComparison: string;
  nanSamples: 0;
  infiniteSamples: 0;
  clippedSamplesAtUnity: 0;
  impulseIdentity: string;
  crossBrowserPcmHashEqualityRequired: false;
}>;

type RenderCase = X0OfflineRenderCaseInput &
  Readonly<{
    expectedSourceCount: number;
    assertions: readonly RenderAssertion[];
  }>;

type RenderMatrixAuthority = Readonly<{
  schema: "changes.fixtures.x0-render-matrix.v1";
  fixtureVersion: 1;
  expectedValuesGenerated: false;
  supportedBrowserMatrix: readonly string[];
  unsupportedCapabilityPolicy: string;
  numericPolicy: RenderNumericPolicy;
  cases: readonly RenderCase[];
}>;

type ImpulseAuthority = Readonly<{
  schema: "changes.fixtures.x0-impulse-golden.v1";
  algorithmId: "changes.audio.impulse.xorshift32-q15.v1";
  ownership: string;
  runtimeNetworkRequired: false;
  seedUint32: number;
  channels: 2;
  durationSeconds: 2;
  sampleRateRange: readonly [number, number];
  referenceSampleRate: 48_000;
  referenceFrames: 96_000;
  referenceScalarSamples: 192_000;
  referenceBytes: 384_000;
  referenceInterleavedInt16LeSha256: string;
}>;

type TraceAuthority = Readonly<{
  schema: "changes.fixtures.x0-trace-ledger.v1";
  expectedValuesGenerated: false;
  productionOutputUsed: false;
  traces: readonly Readonly<{
    id: string;
    caseIds: readonly string[];
    evidenceOwner: string;
  }>[];
}>;

type FixtureEvidence = Readonly<{
  path: string;
  schema: string;
  bytes: number;
  sha256: string;
}>;

type AssertionEvidence = Readonly<{
  outcome: "pass" | "fail";
  detail: string;
}>;

type FindingEvidence = Readonly<{
  code: string;
  message: string;
  assertion: string | null;
  diagnosticIds: readonly string[];
}>;

type RequestEvidence = {
  id: string;
  sequence: number;
  method: string;
  url: string;
  normalizedUrl: string;
  resourceType: string;
  navigation: boolean;
  disposition: "allowed-document" | "blocked";
  status?: number;
  failure?: string;
};

type ConsoleEvidence = Readonly<{
  id: string;
  sequence: number;
  type: string;
  text: string;
  location: Readonly<{
    url: string;
    lineNumber: number;
    columnNumber: number;
  }> | null;
}>;

type BrowserDiagnostics = Readonly<{
  requests: readonly RequestEvidence[];
  console: readonly ConsoleEvidence[];
  pageErrors: readonly string[];
  webErrors: readonly string[];
  workers: readonly string[];
  webSockets: readonly string[];
  dialogs: readonly string[];
  pages: readonly string[];
  resourceEntries: readonly string[];
}>;

type RenderExecutionError = Readonly<{
  caseId: string;
  message: string;
}>;

type BrowserCellEvidence = Readonly<{
  schema: typeof RECORD_SCHEMA;
  traceId: typeof TRACE_ID;
  outcome: "pass" | "fail";
  runId: string;
  inputManifestDigest: string;
  harnessSha256: string;
  producerFile: typeof PRODUCER_FILE;
  testcase: typeof TEST_TITLE;
  requestLog: readonly RequestEvidence[];
  consoleErrors: readonly ConsoleEvidence[];
  pageErrors: readonly string[];
  offlineRenders: readonly X0OfflineRenderRecord[];
  realAudioContext: X0RealAudioContextProbeRecord | null;
  untrustedAudioContext: X0RealAudioContextProbeRecord | null;
  listeningAssessment: "not-performed-by-automation";
  run: Readonly<{
    runId: string;
    inputManifestDigestSha256: string;
    nodeVersion: string;
  }>;
  harnessBundle: Readonly<{
    path: string;
    bytes: number;
    expectedSha256: string;
    observedSha256: string;
    format: "self-contained-inline-iife";
  }>;
  browser: Readonly<{
    projectName: string;
    project: string;
    name: string;
    version: string;
    userAgent: string | null;
    secureContext: boolean | null;
  }>;
  playwright: Readonly<{
    version: string;
    workerIndex: number;
    retry: number;
    retriesAllowed: 0;
  }>;
  fixtures: Readonly<{
    renderMatrix: FixtureEvidence;
    impulseGolden: FixtureEvidence;
    traceLedger: FixtureEvidence;
  }> | null;
  rawRenderRecords: readonly (X0OfflineRenderRecord | null)[];
  renderExecutionErrors: readonly RenderExecutionError[];
  realAudioContextRecord: X0RealAudioContextProbeRecord | null;
  untrustedAudioContextRecord: X0RealAudioContextProbeRecord | null;
  capabilityEvidence: Readonly<{
    requiredAudioContext: Readonly<{
      method: "trusted click AudioContext construction and resume";
      browserVersion: string;
      outcome:
        | X0RealAudioContextProbeRecord["outcome"]
        | "execution-failed";
      reasonCode: string | null;
      unsupportedIsPassing: false;
    }>;
    cancelAndHold: Readonly<{
      method: "AudioParam.prototype.cancelAndHoldAtTime";
      available: boolean | null;
      exercisedPath:
        | X0RealAudioContextProbeRecord["mixAutomationPath"]
        | null;
      analyticFallbackRequired: boolean | null;
      analyticFallbackExercised: boolean | null;
    }>;
  }>;
  assertions: Readonly<Record<string, AssertionEvidence>>;
  diagnostics: BrowserDiagnostics;
  findings: readonly FindingEvidence[];
  manualListening: Readonly<{
    performed: false;
    outcome: "not-assessed";
    reason: string;
  }>;
}>;

type BrowserEvidenceScope = typeof globalThis & {
  __JCPE_X0_AUDIO_EVIDENCE__?: X0AudioBrowserEvidenceHarness;
  __JCPE_X0_REAL_PROBE_PROMISE__?: Promise<X0RealAudioContextProbeRecord>;
};

type PackageMetadata = Readonly<{ version: string }>;

const ROOT = resolve(import.meta.dirname, "../..");
const RENDER_MATRIX_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/render-matrix.json",
);
const IMPULSE_GOLDEN_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/impulse-golden.json",
);
const TRACE_LEDGER_PATH = resolve(
  ROOT,
  "tests/fixtures/audio-engine/trace-ledger.json",
);
const PLAYWRIGHT_METADATA_PATH = resolve(
  ROOT,
  "node_modules/@playwright/test/package.json",
);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(source: Uint8Array): unknown {
  const parsed: unknown = JSON.parse(Buffer.from(source).toString("utf8"));
  return parsed;
}

function requireEnvironment(name: string, pattern: RegExp): string {
  const value = process.env[name];
  if (value === undefined || !pattern.test(value)) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return value;
}

function safeSegment(value: string, name: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`${name} is not safe for an evidence filename.`);
  }
  return value;
}

function repoRelative(path: string): string {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function normalizeUrl(url: string): string {
  if (url === HARNESS_DOCUMENT_URL) return "<x0-audio-harness-document>";
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "127.0.0.1") {
      return `${parsed.protocol}//127.0.0.1:<port>${parsed.pathname}`;
    }
  } catch {
    // Raw diagnostic evidence below still preserves the original value.
  }
  return url;
}

function diagnosticId(kind: string, sequence: number): string {
  return `${kind}-${String(sequence).padStart(3, "0")}`;
}

function addFinding(
  findings: FindingEvidence[],
  code: string,
  message: string,
  assertion: string | null = null,
  diagnosticIds: readonly string[] = [],
): void {
  findings.push(
    Object.freeze({
      code,
      message,
      assertion,
      diagnosticIds: Object.freeze([...diagnosticIds]),
    }),
  );
}

function runAssertion(
  assertions: Record<string, AssertionEvidence>,
  findings: FindingEvidence[],
  name: string,
  assertion: () => void,
): void {
  if (assertions[name] !== undefined) {
    throw new Error(`Duplicate assertion name: ${name}`);
  }
  try {
    assertion();
    assertions[name] = Object.freeze({ outcome: "pass", detail: "matched" });
  } catch (error) {
    const detail = errorMessage(error);
    assertions[name] = Object.freeze({ outcome: "fail", detail });
    addFinding(findings, "X0_ASSERTION_FAILED", detail, name);
  }
}

function requireRenderRecord(
  record: X0OfflineRenderRecord | null,
  caseId: string,
): X0OfflineRenderRecord {
  if (record === null) {
    throw new Error(`${caseId} did not produce an offline render record.`);
  }
  return record;
}

function requireRealRecord(
  record: X0RealAudioContextProbeRecord | null,
): X0RealAudioContextProbeRecord {
  if (record === null) {
    throw new Error("The trusted gesture did not produce a real AudioContext record.");
  }
  return record;
}

function expectedImpulseSha256(
  authority: ImpulseAuthority,
  sampleRate: number,
): string {
  const frameCount = Math.ceil(sampleRate * authority.durationSeconds);
  const bytes = Buffer.alloc(
    frameCount * authority.channels * Int16Array.BYTES_PER_ELEMENT,
  );
  let state = authority.seedUint32 >>> 0;
  let byteOffset = 0;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const remaining = frameCount - frame;
    const envelopeQ15 = Math.floor(
      (remaining * remaining * 32_767) / (frameCount * frameCount),
    );
    for (let channel = 0; channel < authority.channels; channel += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      const noise = (state >>> 16) - 32_768;
      const sampleQ15 = Math.trunc((noise * envelopeQ15) / 32_768);
      bytes.writeInt16LE(sampleQ15, byteOffset);
      byteOffset += Int16Array.BYTES_PER_ELEMENT;
    }
  }
  return sha256(bytes);
}

function validateWorkCounters(
  work: X0OfflineRenderRecord["work"],
  voiceCount: number,
  expectedSourceCount: number,
  impulseScalarSamples: number,
): void {
  for (const name of WORK_COUNTER_NAMES) {
    expect(Number.isSafeInteger(work[name]), `${name} must be a safe integer`).toBe(
      true,
    );
    expect(work[name], `${name} must be nonnegative`).toBeGreaterThanOrEqual(0);
  }
  expect(work.graphNodesCreated).toBe(EXPECTED_PERSISTENT_NODE_COUNT);
  expect(work.graphEdgesConnected).toBe(EXPECTED_PERSISTENT_EDGE_COUNT);
  expect(work.impulseSamplesWritten).toBe(impulseScalarSamples);
  expect(work.voiceBatchesValidated).toBe(1);
  expect(work.voiceSpecsValidated).toBe(voiceCount);
  expect(work.voicesCreated).toBe(voiceCount);
  expect(work.scheduledSourcesCreated).toBe(expectedSourceCount);
  expect(work.cleanupCallbacksHandled).toBe(expectedSourceCount);
  expect(work.operationsStarted).toBeGreaterThanOrEqual(3);
  expect(work.parameterEventsScheduled).toBeGreaterThan(0);
}

function validateFixtureAssertion(
  assertion: RenderAssertion,
  record: X0OfflineRenderRecord,
  renderCase: RenderCase,
  policy: RenderNumericPolicy,
): void {
  switch (assertion) {
    case "finite":
      expect(record.metrics.nanSampleCount).toBe(policy.nanSamples);
      expect(record.metrics.infiniteSampleCount).toBe(policy.infiniteSamples);
      expect(
        [
          record.metrics.absolutePeak,
          record.metrics.activeRms,
          record.metrics.earlyTailRms,
          record.metrics.finalTailRms,
        ].every(Number.isFinite),
      ).toBe(true);
      return;
    case "non-silent":
      expect(record.metrics.absolutePeak).toBeGreaterThanOrEqual(
        policy.nonSilentAbsolutePeakMinimum,
      );
      expect(record.metrics.nonZeroSampleCount).toBeGreaterThan(0);
      return;
    case "onset-window": {
      const onset = record.metrics.onsetSeconds;
      expect(onset).not.toBeNull();
      if (onset === null) throw new Error("onsetSeconds was null");
      expect(Math.abs(onset - renderCase.start)).toBeLessThanOrEqual(
        policy.onsetToleranceSeconds,
      );
      return;
    }
    case "bounded-peak":
      expect(record.metrics.absolutePeak).toBeLessThan(
        policy.absolutePeakMaximumExclusive,
      );
      return;
    case "bounded-active-rms":
      expect(record.metrics.activeRms).toBeGreaterThanOrEqual(
        policy.activeRmsMinimum,
      );
      expect(record.metrics.activeRms).toBeLessThan(
        policy.activeRmsMaximumExclusive,
      );
      return;
    case "no-unity-clipping":
      expect(record.metrics.unityClipSampleCount).toBe(
        policy.clippedSamplesAtUnity,
      );
      return;
    case "tail-present":
      expect(record.metrics.earlyTailRms).toBeGreaterThanOrEqual(
        policy.tailPresentRmsMinimum,
      );
      return;
    case "tail-decays":
      expect(record.metrics.earlyTailRms).toBeGreaterThanOrEqual(
        policy.tailDecayMinimumRatio * record.metrics.finalTailRms,
      );
      return;
    case "final-rms-bounded":
      expect(record.metrics.finalTailRms).toBeLessThanOrEqual(
        policy.tailFinalRmsMaximum,
      );
      return;
    case "voice-cleanup-before-eight-seconds":
      expect(record.renderDurationSeconds).toBeLessThan(8);
      expect(record.registryAfterRender.retainedVoiceCount).toBe(0);
      expect(record.registryAfterRender.totalIndexReferences).toBe(0);
      expect(record.work.cleanupCallbacksHandled).toBe(
        renderCase.expectedSourceCount,
      );
      return;
  }
}

function validateRenderRecord(
  assertions: Record<string, AssertionEvidence>,
  findings: FindingEvidence[],
  record: X0OfflineRenderRecord | null,
  renderCase: RenderCase,
  policy: RenderNumericPolicy,
  impulseAuthority: ImpulseAuthority,
  impulseHashes: ReadonlyMap<number, string>,
): void {
  const prefix = renderCase.id;
  runAssertion(assertions, findings, `${prefix}/record-identity`, () => {
    const value = requireRenderRecord(record, prefix);
    expect(value.schema).toBe("changes.evidence.x0-offline-render.v1");
    expect(value.caseId).toBe(renderCase.id);
    expect(value.instrumentId).toBe(renderCase.instrumentId);
    expect(value.scenario).toBe(renderCase.scenario ?? null);
    expect(value.listeningAssessment).toBe("not-performed-by-automation");
  });
  runAssertion(assertions, findings, `${prefix}/native-render-dimensions`, () => {
    const value = requireRenderRecord(record, prefix);
    const expectedFrames = Math.ceil(
      renderCase.sampleRate * renderCase.renderDuration,
    );
    expect(value.sampleRate).toBe(renderCase.sampleRate);
    expect(value.renderFrameCount).toBe(expectedFrames);
    expect(value.renderDurationSeconds).toBe(expectedFrames / renderCase.sampleRate);
    expect(value.channelCount).toBe(policy.channelCount);
    expect(value.metrics.scalarSampleCount).toBe(
      expectedFrames * policy.channelCount,
    );
    expect(value.initializationState).toBe("ready");
  });
  runAssertion(assertions, findings, `${prefix}/frozen-analysis-policy`, () => {
    const value = requireRenderRecord(record, prefix);
    const renderEnd = value.renderDurationSeconds;
    expect(value.masterVolume).toBe(policy.masterVolume);
    expect(value.metrics.onsetThreshold).toBe(policy.onsetThreshold);
    expect(value.metrics.activeWindow).toEqual({
      startSeconds: renderCase.start,
      endSeconds: Math.min(renderCase.release, renderEnd),
    });
    expect(value.metrics.earlyTailWindow).toEqual({
      startSeconds: Math.min(renderCase.release, renderEnd),
      endSeconds: Math.min(
        renderCase.release + policy.tailRmsWindowSeconds,
        renderEnd,
      ),
    });
    expect(value.metrics.finalTailWindow).toEqual({
      startSeconds: Math.max(
        Math.min(renderCase.release, renderEnd),
        renderEnd - policy.tailRmsWindowSeconds,
      ),
      endSeconds: renderEnd,
    });
  });
  runAssertion(assertions, findings, `${prefix}/universal-finite-safety`, () => {
    const value = requireRenderRecord(record, prefix);
    expect(value.metrics.nanSampleCount).toBe(policy.nanSamples);
    expect(value.metrics.infiniteSampleCount).toBe(policy.infiniteSamples);
    expect(value.metrics.unityClipSampleCount).toBe(
      policy.clippedSamplesAtUnity,
    );
  });
  runAssertion(assertions, findings, `${prefix}/persistent-graph`, () => {
    const value = requireRenderRecord(record, prefix);
    expect(value.graph.instanceId).toBe(1);
    expect(value.graph.contextCreationCount).toBe(1);
    expect(value.graph.persistentCreatedNodeCount).toBe(
      EXPECTED_PERSISTENT_NODE_COUNT,
    );
    expect(value.graph.persistentEdgeCount).toBe(
      EXPECTED_PERSISTENT_EDGE_COUNT,
    );
  });
  runAssertion(assertions, findings, `${prefix}/source-accounting`, () => {
    const value = requireRenderRecord(record, prefix);
    expect(value.schedule.voiceCount).toBe(renderCase.midiPitches.length);
    expect(value.schedule.scheduledSourceCount).toBe(
      renderCase.expectedSourceCount,
    );
    expect(value.work.scheduledSourcesCreated).toBe(
      renderCase.expectedSourceCount,
    );
  });
  runAssertion(assertions, findings, `${prefix}/empty-final-registry`, () => {
    const value = requireRenderRecord(record, prefix);
    expect(value.registryAfterRender).toEqual({
      retainedVoiceCount: 0,
      nonreleasingVoiceCount: 0,
      releasingVoiceCount: 0,
      totalIndexReferences: 0,
    });
  });
  runAssertion(assertions, findings, `${prefix}/impulse-object-identity`, () => {
    const value = requireRenderRecord(record, prefix);
    const expectedLength = Math.ceil(
      renderCase.sampleRate * impulseAuthority.durationSeconds,
    );
    expect(value.impulse.createdBufferCount).toBe(1);
    expect(value.impulse.convolverAssignmentCount).toBe(1);
    expect(value.impulse.assignedGeneratedBufferByIdentity).toBe(true);
    expect(value.impulse.numberOfChannels).toBe(impulseAuthority.channels);
    expect(value.impulse.length).toBe(expectedLength);
    expect(value.impulse.sampleRate).toBe(renderCase.sampleRate);
  });
  runAssertion(assertions, findings, `${prefix}/impulse-and-pcm-hashes`, () => {
    const value = requireRenderRecord(record, prefix);
    expect(value.hashes.algorithm).toBe("SHA-256");
    expect(value.hashes.pcmEncoding).toBe(
      "channel-interleaved-float32-little-endian",
    );
    expect(value.hashes.impulseEncoding).toBe(
      "q15-interleaved-int16-little-endian",
    );
    expect(value.hashes.webCryptoAvailable).toBe(true);
    expect(value.hashes.pcmSha256).toMatch(SHA256);
    expect(value.hashes.impulseQ15Sha256).toBe(
      impulseHashes.get(renderCase.sampleRate),
    );
  });
  runAssertion(assertions, findings, `${prefix}/bounded-work`, () => {
    const value = requireRenderRecord(record, prefix);
    validateWorkCounters(
      value.work,
      renderCase.midiPitches.length,
      renderCase.expectedSourceCount,
      value.impulse.length * value.impulse.numberOfChannels,
    );
  });

  for (const fixtureAssertion of renderCase.assertions) {
    runAssertion(
      assertions,
      findings,
      `${prefix}/fixture-${fixtureAssertion}`,
      () => {
        validateFixtureAssertion(
          fixtureAssertion,
          requireRenderRecord(record, prefix),
          renderCase,
          policy,
        );
      },
    );
  }
}

function validateRealAudioContextRecord(
  assertions: Record<string, AssertionEvidence>,
  findings: FindingEvidence[],
  record: X0RealAudioContextProbeRecord | null,
  browserUserAgent: string | null,
): void {
  runAssertion(assertions, findings, "real-context/completed", () => {
    const value = requireRealRecord(record);
    expect(value.schema).toBe("changes.evidence.x0-real-audio-context.v1");
    expect(value.outcome).toBe("completed");
    expect(value.reasonCode).toBeNull();
    expect(value.nativeAudioContextAvailable).toBe(true);
  });
  runAssertion(assertions, findings, "real-context/trusted-gesture", () => {
    const value = requireRealRecord(record);
    expect(value.gestureEventType).toBe("click");
    expect(value.gestureKind).toBe("trusted-pointer");
    expect(value.gestureTrusted).toBe(true);
  });
  runAssertion(assertions, findings, "real-context/browser-identity", () => {
    const value = requireRealRecord(record);
    expect(value.userAgent.length).toBeGreaterThan(0);
    expect(value.userAgent).toBe(browserUserAgent);
  });
  runAssertion(assertions, findings, "real-context/native-state-rate-time", () => {
    const value = requireRealRecord(record);
    expect(value.contextStateAfterInitialization).toBe("running");
    expect(value.contextSampleRate).not.toBeNull();
    expect(Number.isFinite(value.contextSampleRate)).toBe(true);
    expect(value.contextSampleRate ?? 0).toBeGreaterThanOrEqual(8_000);
    expect(value.contextSampleRate ?? 0).toBeLessThanOrEqual(192_000);
    expect(value.contextTimeBeforeCycles).not.toBeNull();
    expect(value.contextTimeAfterCleanup).not.toBeNull();
    expect(Number.isFinite(value.contextTimeBeforeCycles)).toBe(true);
    expect(Number.isFinite(value.contextTimeAfterCleanup)).toBe(true);
    expect(value.contextTimeBeforeCycles ?? -1).toBeGreaterThanOrEqual(0);
    expect(value.contextTimeAfterCleanup ?? -1).toBeGreaterThanOrEqual(
      value.contextTimeBeforeCycles ?? 0,
    );
  });
  runAssertion(assertions, findings, "real-context/one-reused-graph", () => {
    const value = requireRealRecord(record);
    expect(value.platformCreateContextCount).toBe(1);
    expect(value.initialGraphInstanceId).toBe(1);
    expect(value.reusedGraphInstanceId).toBe(1);
    expect(value.reusedExistingGraph).toBe(true);
    expect(value.persistentCreatedNodeCount).toBe(
      EXPECTED_PERSISTENT_NODE_COUNT,
    );
    expect(value.persistentEdgeCount).toBe(EXPECTED_PERSISTENT_EDGE_COUNT);
  });
  runAssertion(assertions, findings, "real-context/native-or-analytic-mix", () => {
    const value = requireRealRecord(record);
    if (value.nativeCancelAndHoldAtTimeAvailable) {
      expect(value.mixAutomationPath).toBe("native-cancel-and-hold");
      expect(value.mixAutomationEventDelta).toBe(4);
    } else {
      expect(value.mixAutomationPath).toBe("analytic-cancel-set");
      expect(value.mixAutomationEventDelta).toBe(6);
    }
  });
  runAssertion(assertions, findings, "real-context/one-hundred-cycles", () => {
    const value = requireRealRecord(record);
    expect(value.cyclesRequested).toBe(REAL_CONTEXT_CYCLES);
    expect(value.attackSuccessCount).toBe(REAL_CONTEXT_CYCLES);
    expect(value.retirementSuccessCount).toBe(REAL_CONTEXT_CYCLES);
    expect(value.retirementNoFutureAttackPostconditionCount).toBe(
      REAL_CONTEXT_CYCLES,
    );
    expect(value.scheduledSourceCount).toBe(EXPECTED_REAL_SOURCE_COUNT);
    expect(value.cleanupCallbackCount).toBe(EXPECTED_REAL_SOURCE_COUNT);
  });
  runAssertion(assertions, findings, "real-context/cleanup-and-registry", () => {
    const value = requireRealRecord(record);
    expect(value.cleanupPollCount).toBeGreaterThanOrEqual(0);
    expect(value.cleanupPollCount).toBeLessThanOrEqual(200);
    expect(value.cleanupComplete).toBe(true);
    expect(value.retainedVoiceCountAfterCleanup).toBe(0);
    expect(value.registryIndexReferencesAfterCleanup).toBe(0);
  });
  runAssertion(assertions, findings, "real-context/work-accounting", () => {
    const value = requireRealRecord(record);
    expect(value.work).not.toBeNull();
    if (value.work === null) throw new Error("Real-context work was null.");
    for (const name of WORK_COUNTER_NAMES) {
      expect(Number.isSafeInteger(value.work[name])).toBe(true);
      expect(value.work[name]).toBeGreaterThanOrEqual(0);
    }
    expect(value.work.graphNodesCreated).toBe(EXPECTED_PERSISTENT_NODE_COUNT);
    expect(value.work.graphEdgesConnected).toBe(EXPECTED_PERSISTENT_EDGE_COUNT);
    expect(value.work.voiceBatchesValidated).toBe(REAL_CONTEXT_CYCLES);
    expect(value.work.voiceSpecsValidated).toBe(REAL_CONTEXT_CYCLES);
    expect(value.work.voicesCreated).toBe(REAL_CONTEXT_CYCLES);
    expect(value.work.scheduledSourcesCreated).toBe(EXPECTED_REAL_SOURCE_COUNT);
    expect(value.work.cleanupCallbacksHandled).toBe(EXPECTED_REAL_SOURCE_COUNT);
  });
  runAssertion(assertions, findings, "real-context/disposed", () => {
    const value = requireRealRecord(record);
    expect(value.disposedContextClosed).toBe(true);
    expect(value.engineStateAfterDispose).toBe("closed");
  });
  runAssertion(assertions, findings, "real-context/no-listening-claim", () => {
    const value = requireRealRecord(record);
    expect(value.listeningAssessment).toBe("not-performed-by-automation");
  });
}

function validateUntrustedAudioContextRecord(
  assertions: Record<string, AssertionEvidence>,
  findings: FindingEvidence[],
  record: X0RealAudioContextProbeRecord | null,
  browserUserAgent: string | null,
): void {
  runAssertion(assertions, findings, "untrusted-context/structured-refusal", () => {
    const value = requireRealRecord(record);
    expect(value.schema).toBe("changes.evidence.x0-real-audio-context.v1");
    expect(value.outcome).toBe("refused");
    expect(value.reasonCode).toBe("X0_REAL_GESTURE_UNTRUSTED");
    expect(value.userAgent).toBe(browserUserAgent);
    expect(value.gestureEventType).toBe("click");
    expect(value.gestureKind).toBeNull();
    expect(value.gestureTrusted).toBe(false);
    expect(value.cyclesRequested).toBe(REAL_CONTEXT_CYCLES);
  });
  runAssertion(assertions, findings, "untrusted-context/no-platform-effects", () => {
    const value = requireRealRecord(record);
    expect(value.platformCreateContextCount).toBe(0);
    expect(value.initialGraphInstanceId).toBeNull();
    expect(value.reusedGraphInstanceId).toBeNull();
    expect(value.reusedExistingGraph).toBe(false);
    expect(value.contextStateAfterInitialization).toBeNull();
    expect(value.contextSampleRate).toBeNull();
    expect(value.contextTimeBeforeCycles).toBeNull();
    expect(value.contextTimeAfterCleanup).toBeNull();
    expect(value.persistentCreatedNodeCount).toBe(0);
    expect(value.persistentEdgeCount).toBe(0);
    expect(value.attackSuccessCount).toBe(0);
    expect(value.retirementSuccessCount).toBe(0);
    expect(value.retirementNoFutureAttackPostconditionCount).toBe(0);
    expect(value.scheduledSourceCount).toBe(0);
    expect(value.cleanupCallbackCount).toBe(0);
    expect(value.work).toBeNull();
  });
  runAssertion(assertions, findings, "untrusted-context/no-listening-claim", () => {
    const value = requireRealRecord(record);
    expect(value.listeningAssessment).toBe("not-performed-by-automation");
  });
}

function harnessDocument(bundle: string): string {
  if (/<\/script/iu.test(bundle)) {
    throw new Error(
      "X0_AUDIO_BUNDLE_INLINE_UNSAFE: bundle contains an HTML script terminator.",
    );
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"><title>X0 native audio evidence</title></head>
<body>
<button id="real-audio-probe" type="button">Run trusted audio probe</button>
<script>${bundle}</script>
<script>
(() => {
  "use strict";
  const button = document.getElementById("real-audio-probe");
  if (!(button instanceof HTMLButtonElement)) throw new Error("X0_REAL_PROBE_BUTTON_MISSING");
  button.addEventListener("click", (event) => {
    const harness = globalThis.${HARNESS_GLOBAL};
    if (harness === undefined) throw new Error("X0_AUDIO_HARNESS_GLOBAL_MISSING");
    globalThis.${REAL_PROBE_PROMISE_GLOBAL} = harness.beginRealAudioContextProbe(event, { cycles: ${String(REAL_CONTEXT_CYCLES)} });
  }, { once: true });
  document.documentElement.dataset.x0AudioHarnessReady = "true";
})();
</script>
</body>
</html>`;
}

async function installDiagnostics(
  context: BrowserContext,
  page: Page,
  diagnostics: {
    requests: RequestEvidence[];
    console: ConsoleEvidence[];
    pageErrors: string[];
    webErrors: string[];
    workers: string[];
    webSockets: string[];
    dialogs: string[];
  },
  documentBody: string,
): Promise<void> {
  const requestIndex = new Map<Request, RequestEvidence>();
  const installedPages = new WeakSet<Page>();
  let requestSequence = 0;
  let consoleSequence = 0;
  let allowedDocumentCount = 0;

  const installPage = (observedPage: Page): void => {
    if (installedPages.has(observedPage)) return;
    installedPages.add(observedPage);
    observedPage.on("console", (message) => {
      const location = message.location();
      diagnostics.console.push(
        Object.freeze({
          id: diagnosticId("console", ++consoleSequence),
          sequence: consoleSequence,
          type: message.type(),
          text: message.text(),
          location:
            location.url.length === 0
              ? null
              : Object.freeze({
                  url: location.url,
                  lineNumber: location.lineNumber,
                  columnNumber: location.columnNumber,
                }),
        }),
      );
    });
    observedPage.on("pageerror", (error) => {
      diagnostics.pageErrors.push(error.message);
    });
    observedPage.on("crash", () => {
      diagnostics.pageErrors.push("PAGE_CRASH");
    });
    observedPage.on("worker", (worker) => {
      diagnostics.workers.push(worker.url());
    });
    observedPage.on("websocket", (socket) => {
      diagnostics.webSockets.push(socket.url());
    });
    observedPage.on("dialog", (dialog) => {
      diagnostics.dialogs.push(`${dialog.type()}:${dialog.message()}`);
      void dialog.dismiss();
    });
  };

  installPage(page);
  context.on("page", installPage);
  context.on("serviceworker", (worker) => {
    diagnostics.workers.push(`service:${worker.url()}`);
  });
  context.on("weberror", (error) => {
    diagnostics.webErrors.push(error.error().message);
  });
  context.on("response", (response) => {
    const evidence = requestIndex.get(response.request());
    if (evidence !== undefined) evidence.status = response.status();
  });
  context.on("requestfailed", (request) => {
    const evidence = requestIndex.get(request);
    const failure = request.failure();
    if (evidence !== undefined && failure !== null) {
      evidence.failure = failure.errorText;
    }
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const allowed =
      allowedDocumentCount === 0 &&
      request.isNavigationRequest() &&
      request.method() === "GET" &&
      request.url() === HARNESS_DOCUMENT_URL &&
      request.frame() === page.mainFrame();
    const evidence: RequestEvidence = {
      id: diagnosticId("request", ++requestSequence),
      sequence: requestSequence,
      method: request.method(),
      url: request.url(),
      normalizedUrl: normalizeUrl(request.url()),
      resourceType: request.resourceType(),
      navigation: request.isNavigationRequest(),
      disposition: allowed ? "allowed-document" : "blocked",
    };
    diagnostics.requests.push(evidence);
    requestIndex.set(request, evidence);
    if (allowed) {
      allowedDocumentCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        headers: { "cache-control": "no-store" },
        body: documentBody,
      });
    } else {
      await route.abort("blockedbyclient");
    }
  });
}

async function resourcesFor(page: Page): Promise<string[]> {
  return await page
    .evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .sort(),
    )
    .catch(() => [] as string[]);
}

async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid.toString()}-${randomUUID()}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, path);
}

test(TEST_TITLE, async ({
  browser,
  browserName,
  context,
  page,
}, testInfo: TestInfo) => {
  const runId = requireEnvironment(RUN_ID_ENV, /^[A-Za-z0-9._-]{8,128}$/u);
  const expectedHarnessSha256 = requireEnvironment(HARNESS_SHA256_ENV, SHA256);
  const inputDigest = requireEnvironment(INPUT_DIGEST_ENV, SHA256);
  const harnessPath = resolve(requireEnvironment(HARNESS_PATH_ENV, /\S/u));
  const runDirectory = resolve(
    ROOT,
    "test-results/x0-audio-evidence-runs",
    safeSegment(runId, "Run ID"),
  );
  const expectedHarnessPath = resolve(
    runDirectory,
    "harness/x0-audio-browser-harness.js",
  );
  const recordPath = resolve(
    runDirectory,
    `${safeSegment(browserName, "Browser name")}.json`,
  );
  const assertions: Record<string, AssertionEvidence> = {};
  const findings: FindingEvidence[] = [];
  const rawRenderRecords: (X0OfflineRenderRecord | null)[] = [];
  const renderExecutionErrors: RenderExecutionError[] = [];
  let realAudioContextRecord: X0RealAudioContextProbeRecord | null = null;
  let untrustedAudioContextRecord: X0RealAudioContextProbeRecord | null = null;
  let fixtureEvidence: BrowserCellEvidence["fixtures"] = null;
  let observedHarnessSha256 = "";
  let harnessBytes = 0;
  let playwrightVersion = "unknown";
  let browserUserAgent: string | null = null;
  let secureContext: boolean | null = null;
  const diagnostics = {
    requests: [] as RequestEvidence[],
    console: [] as ConsoleEvidence[],
    pageErrors: [] as string[],
    webErrors: [] as string[],
    workers: [] as string[],
    webSockets: [] as string[],
    dialogs: [] as string[],
  };

  try {
    const [
      harnessSource,
      renderMatrixSource,
      impulseSource,
      traceSource,
      playwrightMetadataSource,
    ] = await Promise.all([
      readFile(harnessPath),
      readFile(RENDER_MATRIX_PATH),
      readFile(IMPULSE_GOLDEN_PATH),
      readFile(TRACE_LEDGER_PATH),
      readFile(PLAYWRIGHT_METADATA_PATH),
    ]);
    const renderMatrix = parseJson(renderMatrixSource) as RenderMatrixAuthority;
    const impulseAuthority = parseJson(impulseSource) as ImpulseAuthority;
    const traceAuthority = parseJson(traceSource) as TraceAuthority;
    const playwrightMetadata = parseJson(
      playwrightMetadataSource,
    ) as PackageMetadata;
    playwrightVersion = playwrightMetadata.version;
    observedHarnessSha256 = sha256(harnessSource);
    harnessBytes = harnessSource.byteLength;
    fixtureEvidence = Object.freeze({
      renderMatrix: Object.freeze({
        path: repoRelative(RENDER_MATRIX_PATH),
        schema: renderMatrix.schema,
        bytes: renderMatrixSource.byteLength,
        sha256: sha256(renderMatrixSource),
      }),
      impulseGolden: Object.freeze({
        path: repoRelative(IMPULSE_GOLDEN_PATH),
        schema: impulseAuthority.schema,
        bytes: impulseSource.byteLength,
        sha256: sha256(impulseSource),
      }),
      traceLedger: Object.freeze({
        path: repoRelative(TRACE_LEDGER_PATH),
        schema: traceAuthority.schema,
        bytes: traceSource.byteLength,
        sha256: sha256(traceSource),
      }),
    });

    runAssertion(assertions, findings, "run/no-retry", () => {
      expect(testInfo.retry).toBe(0);
    });
    runAssertion(assertions, findings, "run/project-identity", () => {
      expect(testInfo.project.name).toBe(browserName);
      expect(["chromium", "firefox", "webkit"]).toContain(browserName);
    });
    runAssertion(assertions, findings, "run/harness-path", () => {
      expect(harnessPath).toBe(expectedHarnessPath);
    });
    runAssertion(assertions, findings, "run/harness-hash", () => {
      expect(observedHarnessSha256).toBe(expectedHarnessSha256);
      expect(observedHarnessSha256).toMatch(SHA256);
    });
    runAssertion(assertions, findings, "authority/render-identities", () => {
      expect(renderMatrix.schema).toBe(
        "changes.fixtures.x0-render-matrix.v1",
      );
      expect(renderMatrix.expectedValuesGenerated).toBe(false);
      expect(renderMatrix.cases.map((item) => item.id)).toEqual(
        EXPECTED_RENDER_IDS,
      );
      expect(renderMatrix.cases).toHaveLength(15);
    });
    runAssertion(assertions, findings, "authority/frozen-analysis-policy", () => {
      expect(renderMatrix.numericPolicy).toMatchObject({
        analysisPolicyVersion: 1,
        channelCount: 2,
        masterVolume: 0.8,
        frameCountRule: "ceil(sampleRate*renderDuration)",
        scalarAggregation: "all channels per frame in ascending channel order",
        onsetThreshold: 0.0000001,
        onsetComparison:
          "first frame where any channel absolute sample is strictly greater than onsetThreshold",
        activeRmsWindow: "[start,release)",
        tailRmsWindowSeconds: 0.5,
        earlyTailRmsWindow:
          "[release,min(release+tailRmsWindowSeconds,renderDuration))",
        finalTailRmsWindow:
          "[max(release,renderDuration-tailRmsWindowSeconds),renderDuration)",
        crossBrowserPcmHashEqualityRequired: false,
      });
    });
    runAssertion(assertions, findings, "authority/trace-owner", () => {
      const matches = traceAuthority.traces.filter(
        (trace) => trace.id === TRACE_ID,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.caseIds).toEqual(EXPECTED_RENDER_IDS);
      expect(matches[0]?.evidenceOwner).toBe(
        "tests/integration/audio-offline-render.test.ts",
      );
      expect(traceAuthority.expectedValuesGenerated).toBe(false);
      expect(traceAuthority.productionOutputUsed).toBe(false);
    });
    const impulseHashes = new Map<number, string>();
    for (const sampleRate of new Set(
      renderMatrix.cases.map((renderCase) => renderCase.sampleRate),
    )) {
      impulseHashes.set(
        sampleRate,
        expectedImpulseSha256(impulseAuthority, sampleRate),
      );
    }
    runAssertion(assertions, findings, "authority/impulse-identity", () => {
      expect(impulseAuthority.schema).toBe(
        "changes.fixtures.x0-impulse-golden.v1",
      );
      expect(impulseAuthority.algorithmId).toBe(
        "changes.audio.impulse.xorshift32-q15.v1",
      );
      expect(impulseAuthority.runtimeNetworkRequired).toBe(false);
      expect(impulseAuthority.channels).toBe(2);
      expect(impulseAuthority.referenceFrames).toBe(
        impulseAuthority.referenceSampleRate * impulseAuthority.durationSeconds,
      );
      expect(impulseAuthority.referenceScalarSamples).toBe(
        impulseAuthority.referenceFrames * impulseAuthority.channels,
      );
      expect(impulseAuthority.referenceBytes).toBe(
        impulseAuthority.referenceScalarSamples * Int16Array.BYTES_PER_ELEMENT,
      );
      expect(impulseHashes.get(impulseAuthority.referenceSampleRate)).toBe(
        impulseAuthority.referenceInterleavedInt16LeSha256,
      );
    });

    const documentBody = harnessDocument(harnessSource.toString("utf8"));
    await installDiagnostics(context, page, diagnostics, documentBody);
    const response = await page.goto(HARNESS_DOCUMENT_URL, {
      waitUntil: "load",
    });
    browserUserAgent = await page.evaluate(() => navigator.userAgent);
    secureContext = await page.evaluate(() => globalThis.isSecureContext);
    runAssertion(assertions, findings, "document/one-loopback-response", () => {
      expect(response?.status()).toBe(200);
      expect(response?.url()).toBe(HARNESS_DOCUMENT_URL);
    });
    runAssertion(assertions, findings, "document/secure-webcrypto", () => {
      expect(secureContext).toBe(true);
      expect(SHA256.test(inputDigest)).toBe(true);
    });
    const harnessReadyCount = await page
      .locator('html[data-x0-audio-harness-ready="true"]')
      .count();
    runAssertion(assertions, findings, "document/harness-ready", () => {
      expect(harnessReadyCount).toBe(1);
    });

    for (const renderCase of renderMatrix.cases) {
      let record: X0OfflineRenderRecord | null = null;
      try {
        record = await page.evaluate(
          async ({ input, options }) => {
            const scope = globalThis as BrowserEvidenceScope;
            const harness = scope.__JCPE_X0_AUDIO_EVIDENCE__;
            if (harness === undefined) {
              throw new Error("X0_AUDIO_HARNESS_GLOBAL_MISSING");
            }
            return await harness.runOfflineRenderCase(input, options);
          },
          {
            input: renderCase,
            options: {
              masterVolume: renderMatrix.numericPolicy.masterVolume,
              onsetThreshold: renderMatrix.numericPolicy.onsetThreshold,
              rmsWindowSeconds:
                renderMatrix.numericPolicy.tailRmsWindowSeconds,
            },
          },
        );
      } catch (error) {
        const message = errorMessage(error);
        renderExecutionErrors.push(
          Object.freeze({ caseId: renderCase.id, message }),
        );
        addFinding(
          findings,
          "X0_OFFLINE_RENDER_EXECUTION_FAILED",
          message,
          `${renderCase.id}/execution`,
        );
      }
      rawRenderRecords.push(record);
      validateRenderRecord(
        assertions,
        findings,
        record,
        renderCase,
        renderMatrix.numericPolicy,
        impulseAuthority,
        impulseHashes,
      );
    }

    try {
      untrustedAudioContextRecord = await page.evaluate(async () => {
        const scope = globalThis as BrowserEvidenceScope;
        const harness = scope.__JCPE_X0_AUDIO_EVIDENCE__;
        if (harness === undefined) {
          throw new Error("X0_AUDIO_HARNESS_GLOBAL_MISSING");
        }
        return await harness.beginRealAudioContextProbe(new Event("click"), {
          cycles: 100,
        });
      });
    } catch (error) {
      addFinding(
        findings,
        "X0_UNTRUSTED_AUDIO_CONTEXT_EXECUTION_FAILED",
        errorMessage(error),
      );
    }
    validateUntrustedAudioContextRecord(
      assertions,
      findings,
      untrustedAudioContextRecord,
      browserUserAgent,
    );

    await page.getByRole("button", { name: "Run trusted audio probe" }).click();
    try {
      realAudioContextRecord = await page.evaluate(async () => {
        const scope = globalThis as BrowserEvidenceScope;
        const promise = scope.__JCPE_X0_REAL_PROBE_PROMISE__;
        if (promise === undefined) {
          throw new Error("X0_REAL_PROBE_PROMISE_MISSING");
        }
        return await promise;
      });
    } catch (error) {
      addFinding(
        findings,
        "X0_REAL_AUDIO_CONTEXT_EXECUTION_FAILED",
        errorMessage(error),
      );
    }
    if (
      realAudioContextRecord !== null &&
      realAudioContextRecord.outcome !== "completed"
    ) {
      addFinding(
        findings,
        realAudioContextRecord.outcome === "unsupported"
          ? "X0_REAL_AUDIO_CONTEXT_UNSUPPORTED"
          : "X0_REAL_AUDIO_CONTEXT_NONPASS",
        [
          `method=trusted click AudioContext construction and resume`,
          `browser=${browserName}`,
          `version=${browser.version()}`,
          `outcome=${realAudioContextRecord.outcome}`,
          `reason=${realAudioContextRecord.reasonCode ?? "none"}`,
        ].join("; "),
      );
    }
    validateRealAudioContextRecord(
      assertions,
      findings,
      realAudioContextRecord,
      browserUserAgent,
    );
  } catch (error) {
    addFinding(
      findings,
      "X0_BROWSER_CELL_EXECUTION_FAILED",
      errorMessage(error),
    );
  }

  const resourceEntries = await resourcesFor(page);
  const pages = context.pages().map((observedPage) => observedPage.url());
  runAssertion(assertions, findings, "diagnostics/single-request", () => {
    expect(diagnostics.requests).toHaveLength(1);
    expect(diagnostics.requests[0]).toMatchObject({
      method: "GET",
      url: HARNESS_DOCUMENT_URL,
      navigation: true,
      disposition: "allowed-document",
      status: 200,
    });
  });
  runAssertion(assertions, findings, "diagnostics/no-request-failure", () => {
    expect(
      diagnostics.requests.filter(
        (request) =>
          request.disposition === "blocked" || request.failure !== undefined,
      ),
    ).toEqual([]);
  });
  runAssertion(assertions, findings, "diagnostics/clean-console", () => {
    expect(diagnostics.console).toEqual([]);
  });
  runAssertion(assertions, findings, "diagnostics/no-page-or-web-errors", () => {
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.webErrors).toEqual([]);
  });
  runAssertion(assertions, findings, "diagnostics/no-workers-or-sockets", () => {
    expect(diagnostics.workers).toEqual([]);
    expect(diagnostics.webSockets).toEqual([]);
  });
  runAssertion(assertions, findings, "diagnostics/no-dialogs", () => {
    expect(diagnostics.dialogs).toEqual([]);
  });
  runAssertion(assertions, findings, "diagnostics/one-page-no-sidecars", () => {
    expect(pages).toEqual([HARNESS_DOCUMENT_URL]);
    expect(
      resourceEntries.filter((entry) => !entry.startsWith("data:")),
    ).toEqual([]);
  });

  const browserDiagnostics: BrowserDiagnostics = Object.freeze({
    requests: Object.freeze([...diagnostics.requests]),
    console: Object.freeze([...diagnostics.console]),
    pageErrors: Object.freeze([...diagnostics.pageErrors]),
    webErrors: Object.freeze([...diagnostics.webErrors]),
    workers: Object.freeze([...diagnostics.workers]),
    webSockets: Object.freeze([...diagnostics.webSockets]),
    dialogs: Object.freeze([...diagnostics.dialogs]),
    pages: Object.freeze([...pages]),
    resourceEntries: Object.freeze([...resourceEntries]),
  });
  const outcome = findings.length === 0 ? "pass" : "fail";
  const offlineRenders = rawRenderRecords.filter(
    (record): record is X0OfflineRenderRecord => record !== null,
  );
  const unexpectedRequests = diagnostics.requests.filter(
    (request) =>
      request.disposition === "blocked" || request.failure !== undefined,
  );
  const consoleErrors = diagnostics.console.filter((message) =>
    ["assert", "error", "warning"].includes(message.type),
  );
  const evidence: BrowserCellEvidence = Object.freeze({
    schema: RECORD_SCHEMA,
    traceId: TRACE_ID,
    outcome,
    runId,
    inputManifestDigest: inputDigest,
    harnessSha256: observedHarnessSha256,
    producerFile: PRODUCER_FILE,
    testcase: TEST_TITLE,
    requestLog: Object.freeze([...unexpectedRequests]),
    consoleErrors: Object.freeze([...consoleErrors]),
    pageErrors: Object.freeze([...diagnostics.pageErrors]),
    offlineRenders: Object.freeze([...offlineRenders]),
    realAudioContext: realAudioContextRecord,
    untrustedAudioContext: untrustedAudioContextRecord,
    listeningAssessment: "not-performed-by-automation",
    run: Object.freeze({
      runId,
      inputManifestDigestSha256: inputDigest,
      nodeVersion: process.versions.node,
    }),
    harnessBundle: Object.freeze({
      path: repoRelative(harnessPath),
      bytes: harnessBytes,
      expectedSha256: expectedHarnessSha256,
      observedSha256: observedHarnessSha256,
      format: "self-contained-inline-iife",
    }),
    browser: Object.freeze({
      projectName: testInfo.project.name,
      project: testInfo.project.name,
      name: browserName,
      version: browser.version(),
      userAgent: browserUserAgent,
      secureContext,
    }),
    playwright: Object.freeze({
      version: playwrightVersion,
      workerIndex: testInfo.workerIndex,
      retry: testInfo.retry,
      retriesAllowed: 0,
    }),
    fixtures: fixtureEvidence,
    rawRenderRecords: Object.freeze([...rawRenderRecords]),
    renderExecutionErrors: Object.freeze([...renderExecutionErrors]),
    realAudioContextRecord,
    untrustedAudioContextRecord,
    capabilityEvidence: Object.freeze({
      requiredAudioContext: Object.freeze({
        method: "trusted click AudioContext construction and resume",
        browserVersion: browser.version(),
        outcome: realAudioContextRecord?.outcome ?? "execution-failed",
        reasonCode: realAudioContextRecord?.reasonCode ?? null,
        unsupportedIsPassing: false,
      }),
      cancelAndHold: Object.freeze({
        method: "AudioParam.prototype.cancelAndHoldAtTime",
        available:
          realAudioContextRecord?.nativeCancelAndHoldAtTimeAvailable ?? null,
        exercisedPath: realAudioContextRecord?.mixAutomationPath ?? null,
        analyticFallbackRequired:
          realAudioContextRecord === null
            ? null
            : !realAudioContextRecord.nativeCancelAndHoldAtTimeAvailable,
        analyticFallbackExercised:
          realAudioContextRecord === null
            ? null
            : realAudioContextRecord.mixAutomationPath ===
              "analytic-cancel-set",
      }),
    }),
    assertions: Object.freeze({ ...assertions }),
    diagnostics: browserDiagnostics,
    findings: Object.freeze(
      [...findings].sort((left, right) => {
        const code = left.code.localeCompare(right.code);
        if (code !== 0) return code;
        return (left.assertion ?? "").localeCompare(right.assertion ?? "");
      }),
    ),
    manualListening: Object.freeze({
      performed: false,
      outcome: "not-assessed",
      reason:
        "Automation records signal and lifecycle evidence only; it does not claim to hear the output.",
    }),
  });

  let persistenceError: string | null = null;
  try {
    await atomicWriteJson(recordPath, evidence);
  } catch (error) {
    persistenceError = `atomic evidence write failed: ${errorMessage(error)}`;
  }
  try {
    await testInfo.attach(`x0-audio-evidence-${browserName}.json`, {
      body: Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`),
      contentType: "application/json",
    });
  } catch (error) {
    const attachmentError = `evidence attachment failed: ${errorMessage(error)}`;
    persistenceError =
      persistenceError === null
        ? attachmentError
        : `${persistenceError}; ${attachmentError}`;
  }

  if (persistenceError !== null) throw new Error(persistenceError);
  if (outcome !== "pass") {
    throw new Error(
      `${TRACE_ID} ${browserName} failed with ${String(findings.length)} finding(s); see ${repoRelative(recordPath)}.`,
    );
  }
});
