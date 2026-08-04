import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type JsonObjectProperty =
  | "algorithmId"
  | "alterationFlagEntries"
  | "applicability"
  | "authorities"
  | "authorityIds"
  | "automatedListeningClaim"
  | "beadId"
  | "caseIds"
  | "cases"
  | "channels"
  | "checkpoints"
  | "chords"
  | "codes"
  | "companions"
  | "contractVersion"
  | "controlIds"
  | "controls"
  | "convolverNormalize"
  | "counts"
  | "coverageSummary"
  | "createdNodeCount"
  | "currentDocumentMutation"
  | "deferredCaseIds"
  | "deferredReason"
  | "deferredUntilPackage"
  | "dimension"
  | "durationSeconds"
  | "edgeCount"
  | "edges"
  | "evidenceOwner"
  | "existingDestinationCount"
  | "expected"
  | "expectedCounts"
  | "expectedFindingCode"
  | "expectedValuesGenerated"
  | "fault"
  | "file"
  | "firstEightLeftQ15"
  | "firstEightRightQ15"
  | "fixtureIds"
  | "groupOrder"
  | "id"
  | "identities"
  | "independence"
  | "instrumentId"
  | "instrumentRows"
  | "legacyPresetId"
  | "license"
  | "limits"
  | "linkedCaseId"
  | "lowpassAlphaQ15"
  | "lowpassStages"
  | "maximums"
  | "nearMissOf"
  | "nodes"
  | "normalization"
  | "numericPolicy"
  | "operation"
  | "operationOrder"
  | "ordering"
  | "outputLevel"
  | "ownership"
  | "package"
  | "pointer"
  | "policies"
  | "polyphonyLimit"
  | "predelayDivisor"
  | "presets"
  | "productionImplementationAvailableWhenAuthored"
  | "productionImportsForbidden"
  | "productionOutputUsed"
  | "publicSurface"
  | "publication"
  | "pulseWave"
  | "recipeSetId"
  | "recipeSetVersion"
  | "recipes"
  | "referenceBytes"
  | "referenceChannelInt16LeSha256"
  | "referenceCountPerVoice"
  | "referenceFinalStateHex"
  | "referenceFinalStateUint32"
  | "referenceFrames"
  | "referenceInterleavedInt16LeSha256"
  | "referencePeakQ15"
  | "referencePredelayFrames"
  | "referenceSampleRate"
  | "referenceScalarSamples"
  | "refusal"
  | "refusalCodes"
  | "releaseSeconds"
  | "releaseStatus"
  | "report"
  | "reportCodes"
  | "requirement"
  | "reviewState"
  | "reviewedCompanionDigests"
  | "reviewedCounts"
  | "reviewedFileSha256"
  | "routingCases"
  | "runtimeNetworkRequired"
  | "sampleRateRange"
  | "scenarioRows"
  | "scheduledSourceCount"
  | "schema"
  | "sections"
  | "seedHex"
  | "seedUint32"
  | "settings"
  | "states"
  | "targetFile"
  | "terminations"
  | "traces"
  | "typeSuffixEntries"
  | "validatedBrand"
  | "value"
  | "wallTimeCutoff"
  | "work"
  | "workCounterOrder"
;

type JsonObject = Record<string, unknown> &
  Partial<Record<JsonObjectProperty, unknown>>;

export type X0ContractFinding = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type X0ContractValidationReport = Readonly<{
  schema: "changes.validation.x0-contract.v1";
  package: "X0";
  outcome: "pass" | "fail";
  counts: Readonly<{
    companions: number;
    routingCases: number;
    recipes: number;
    impulseCheckpoints: number;
    lifecycleCases: number;
    registryCases: number;
    renderCases: number;
    listeningInstrumentRows: number;
    listeningScenarioRows: number;
    mutationControls: number;
    traces: number;
    authorities: number;
  }>;
  findings: readonly X0ContractFinding[];
}>;

const CONTRACT_FILENAME = "x0-audio-engine-contract.json";

export const X0_REVIEWED_COMPANIONS = [
  "graph-topology.json",
  "impulse-golden.json",
  "instrument-recipes.json",
  "lifecycle-cases.json",
  "listening-rubric.json",
  "mutation-controls.json",
  "provenance-ledger.json",
  "registry-cases.json",
  "render-matrix.json",
  "trace-ledger.json",
] as const;

type CompanionFilename = (typeof X0_REVIEWED_COMPANIONS)[number];

const EXPECTED_FILES = [CONTRACT_FILENAME, ...X0_REVIEWED_COMPANIONS] as const;
type ExpectedFilename = (typeof EXPECTED_FILES)[number];

const EXPECTED_SCHEMAS: Readonly<Record<ExpectedFilename, string>> = {
  "x0-audio-engine-contract.json":
    "changes.fixtures.x0-audio-engine-contract.v1",
  "graph-topology.json": "changes.fixtures.x0-graph-topology.v1",
  "impulse-golden.json": "changes.fixtures.x0-impulse-golden.v1",
  "instrument-recipes.json": "changes.fixtures.x0-instrument-recipes.v1",
  "lifecycle-cases.json": "changes.fixtures.x0-lifecycle-cases.v1",
  "listening-rubric.json": "changes.fixtures.x0-listening-rubric.v1",
  "mutation-controls.json": "changes.fixtures.x0-mutation-controls.v1",
  "provenance-ledger.json": "changes.fixtures.x0-provenance-ledger.v1",
  "registry-cases.json": "changes.fixtures.x0-registry-cases.v1",
  "render-matrix.json": "changes.fixtures.x0-render-matrix.v1",
  "trace-ledger.json": "changes.fixtures.x0-trace-ledger.v1",
};

export const X0_REVIEWED_CONTRACT_BYTE_DIGEST =
  "89d5df19c0187603f05f5c46ba1be3ff90136211b309fdb8b8901cb69850d056";

export const X0_REVIEWED_BYTE_DIGESTS: Readonly<
  Record<CompanionFilename, string>
> = {
  "graph-topology.json":
    "72a4c6aa8951186fcabd66d75cb9d4aec7404950a7c9dee7917c9be686e89290",
  "impulse-golden.json":
    "9330b747b85defb801b6456ad7d4ee519f78bdf83ea22a4b6ab47268b3b79888",
  "instrument-recipes.json":
    "a170f0d076aafd00f67749dbdb3e0ce1c29252e202b09dc4763a1a77af14015c",
  "lifecycle-cases.json":
    "3ad712126fe22bf314ea76e41fb501ee549be2ef944a45aafbe1c1f2e8b8dcf5",
  "listening-rubric.json":
    "d2111f1571cc044d9b19a77d64ec5e70f4d2a5de2c59ffd07369a875c7a1f491",
  "mutation-controls.json":
    "12d896515143dcd978e7a8839692dfc6c4248e3569bf23f2268c8e2aa1466cad",
  "provenance-ledger.json":
    "66f3fa709c6ce6522abc7e881dbd83b587e14860c9e4db870ba0887231f94e1b",
  "registry-cases.json":
    "2f373b5d3fb35e99dc9c7dddf6b324a33cf76f94d62bfb210453c74788e391c8",
  "render-matrix.json":
    "300ed448f53000fde7408929a556ed8c745382e6b39b53dd57950d8e032169b3",
  "trace-ledger.json":
    "ccf7414cd10a081377776d66b93eea48c484189c446d4a0d743ab92968f861c6",
};

export const X0_REVIEWED_OPERATION_ORDER = [
  "initializeAudioEngine",
  "resumeAudioEngine",
  "setAudioMix",
  "attackAudioVoices",
  "retireAudioVoices",
  "inspectAudioEngine",
  "disposeAudioEngine",
  "prepareRenderedAudioVoices",
  "analyzeAudioOutput",
] as const;

export const X0_REVIEWED_STATES = [
  "uninitialized",
  "initializing",
  "ready",
  "suspended",
  "resuming",
  "fault",
  "closed",
] as const;

export const X0_REVIEWED_TERMINATIONS = [
  "completed",
  "refused",
  "platform-fault",
] as const;

export const X0_REVIEWED_REFUSAL_CODES = [
  "audio.user_gesture_required",
  "audio.gesture_sequence_invalid",
  "audio.engine_closed",
  "audio.engine_not_ready",
  "audio.context_create_failed",
  "audio.context_resume_failed",
  "audio.context_unusable",
  "audio.context_sample_rate_unsupported",
  "audio.graph_create_failed",
  "audio.internal_sequence_exhausted",
  "audio.mix_invalid",
  "audio.owner_invalid",
  "audio.event_id_invalid",
  "audio.instrument_id_invalid",
  "audio.voice_batch_empty",
  "audio.voice_batch_limit",
  "audio.voice_id_invalid",
  "audio.voice_id_duplicate",
  "audio.midi_pitch_invalid",
  "audio.velocity_invalid",
  "audio.start_time_invalid",
  "audio.release_time_invalid",
  "audio.gate_duration_limit",
  "audio.retiring_voice_capacity",
  "audio.retirement_selector_invalid",
  "audio.retirement_time_invalid",
  "audio.dispose_reason_invalid",
  "audio.renderer_unavailable",
] as const;

export const X0_REVIEWED_LIMITS = {
  idAsciiLength: 128,
  maximumGeneration: 9_007_199_254_740_991,
  maximumGestureSequence: 9_007_199_254_740_991,
  maximumInternalSequence: 9_007_199_254_740_991,
  nonreleasingVoices: 64,
  retainedVoices: 128,
  progressionVoices: 48,
  previewVoices: 16,
  voicesPerBatch: 16,
  scheduleLookaheadSeconds: 0.25,
  minimumGateSeconds: 0.005,
  maximumGateSeconds: 600,
  maximumRecipeReleaseSeconds: 1.8,
  sourceStopPaddingSeconds: 0.02,
  naturalCleanupSecondsAfterRelease: 8,
  scheduledSourcesPerVoice: 7,
  scheduledSourceNodes: 896,
  registryIndexReferences: 768,
  persistentCreatedNodes: 12,
  persistentEdges: 13,
  impulseScalarSamples: 1_536_000,
  impulseBytes: 6_144_000,
  softClipCurveLength: 4_097,
  debugEvents: 4_096,
} as const;

export const X0_REVIEWED_WORK_COUNTER_ORDER = [
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

export const X0_REVIEWED_GRAPH_NODE_IDS = [
  "instrument-bus",
  "dc-block",
  "low-shelf",
  "high-shelf",
  "dry-gain",
  "reverb-send",
  "convolver",
  "reverb-return",
  "dynamics",
  "soft-clip",
  "safety-gain",
  "master-gain",
  "destination",
] as const;

export const X0_REVIEWED_GRAPH_EDGES = [
  ["instrument-bus", "dc-block"],
  ["dc-block", "low-shelf"],
  ["low-shelf", "high-shelf"],
  ["high-shelf", "dry-gain"],
  ["dry-gain", "dynamics"],
  ["high-shelf", "reverb-send"],
  ["reverb-send", "convolver"],
  ["convolver", "reverb-return"],
  ["reverb-return", "dynamics"],
  ["dynamics", "soft-clip"],
  ["soft-clip", "safety-gain"],
  ["safety-gain", "master-gain"],
  ["master-gain", "destination"],
] as const;

export const X0_REVIEWED_GRAPH_SETTINGS = {
  dcBlock: { type: "highpass", frequencyHz: 24, q: 0.707 },
  lowShelf: { type: "lowshelf", frequencyHz: 180, gainDb: 1.5 },
  highShelf: { type: "highshelf", frequencyHz: 6_000, gainDb: -1 },
  dryGain: 1,
  maximumReverbSendGain: 0.28,
  reverbReturnGain: 1,
  dynamics: {
    thresholdDb: -18,
    kneeDb: 18,
    ratio: 4,
    attackSeconds: 0.006,
    releaseSeconds: 0.18,
  },
  softClip: {
    curveLength: 4_097,
    drive: 1.5,
    formula: "tanh(drive*x)/tanh(drive)",
    oversample: "2x",
  },
  safetyGain: 0.9,
  mixRampSeconds: 0.015,
} as const;

export const X0_REVIEWED_RECIPE_IDS = [
  "mellow-keys",
  "fm-electric-piano",
  "vibraphone",
  "warm-pad",
  "analog-poly",
  "concert-grand",
] as const;

export const X0_REVIEWED_RECIPE_LEVELS = [0.62, 0.48, 0.5, 0.3, 0.34, 0.3] as const;
export const X0_REVIEWED_RECIPE_POLYPHONY = [64, 48, 48, 32, 48, 64] as const;
export const X0_REVIEWED_RECIPE_SOURCE_COUNTS = [3, 2, 4, 3, 3, 1] as const;

/**
 * The reviewed rendered recipe, checked literal-by-literal the same way the
 * additive and fm recipes are checked through the canonical recipe digest.
 * A rendered voice schedules exactly one AudioBufferSourceNode of embedded
 * project-owned DSP output; its amplitude keeps only the click-guard attack
 * and the damper release, and its flat filter preserves the uniform
 * source-filter-gain-bus voice topology.
 */
export const X0_REVIEWED_RENDERED_RECIPE = {
  id: "concert-grand",
  label: "Concert Grand",
  designClaim:
    "deterministic rendered piano: inharmonic partials, unison detuning, dual-rate decay, hammer noise",
  synthesis: "rendered",
  outputLevel: 0.3,
  polyphonyLimit: 64,
  scheduledSourceCount: 1,
  renderer: {
    algorithmId: "changes.dsp.concert-grand@1",
    channels: 2,
    maximumRenderSeconds: 8,
    bufferCacheLimit: 96,
  },
  amplitude: {
    attackSeconds: 0.002,
    decaySeconds: 0,
    sustainLevel: 1,
    releaseSeconds: 0.2,
  },
  filter: {
    type: "lowpass",
    attackHz: 16_000,
    peakHz: 16_000,
    sustainHz: 16_000,
    q: 0.5,
    decaySeconds: 0.1,
  },
} as const;

export const X0_REVIEWED_IMPULSE = {
  algorithmId: "changes.audio.impulse.hall-quartic-q15.v2",
  seedUint32: 0x58403031,
  channels: 2,
  durationSeconds: 4,
  predelayDivisor: 50,
  lowpassAlphaQ15: 6_000,
  lowpassStages: 2,
  minimumSampleRate: 8_000,
  maximumSampleRate: 192_000,
  referenceSampleRate: 48_000,
  referenceFrames: 192_000,
  q15Divisor: 32_768,
  envelopeQ15Maximum: 32_767,
  convolverNormalize: true,
  referenceInterleavedInt16LeSha256:
    "ee0449f080bc31f1a9710ec7a316e8e34fb7979421f1a56c6ffd55b667df2017",
  referenceChannelInt16LeSha256: [
    "f97dee335bf4a7308a2dff2c6b9a609cac4f345edc90aa3b1058f45c1d415394",
    "7ff4c5a34a8848bc08148c821aac3d23940a3a94bba9c041615ce6e093795416",
  ],
  referencePeakQ15: 13_352,
  referenceFinalStateUint32: 0xd2e26364,
} as const;

export const X0_REVIEWED_RENDER_POLICY = {
  analysisPolicyVersion: 1,
  channelCount: 2,
  masterVolume: 0.8,
  frameCountRule: "ceil(sampleRate*renderDuration)",
  scalarAggregation: "all channels per frame in ascending channel order",
  absolutePeakMaximumExclusive: 0.99,
  nonSilentAbsolutePeakMinimum: 0.0005,
  activeRmsMinimum: 0.00005,
  activeRmsMaximumExclusive: 0.5,
  onsetThreshold: 0.0000001,
  onsetComparison:
    "first frame where any channel absolute sample is strictly greater than onsetThreshold",
  onsetToleranceSeconds: 0.02,
  activeRmsWindow: "[start,release)",
  tailRmsWindowSeconds: 0.5,
  earlyTailRmsWindow:
    "[release,min(release+tailRmsWindowSeconds,renderDuration))",
  finalTailRmsWindow:
    "[max(release,renderDuration-tailRmsWindowSeconds),renderDuration)",
  tailPresentRmsMinimum: 0.00005,
  tailFinalRmsMaximum: 0.01,
  tailDecayMinimumRatio: 2,
  tailDecayComparison:
    "earlyTailRms>=tailDecayMinimumRatio*finalTailRms",
  nanSamples: 0,
  infiniteSamples: 0,
  clippedSamplesAtUnity: 0,
  impulseIdentity:
    "interleaved signed-int16 little-endian Q15 SHA-256 equals the reviewed 48000 Hz reference and an independent algorithm replay at other sample rates",
  crossBrowserPcmHashEqualityRequired: false,
} as const;

export const X0_REVIEWED_RELEASE_SECONDS = {
  "preview-release": 0.04,
  "voice-steal": 0.02,
  "generation-retire": 0.012,
  "all-notes-off": 0.012,
  "note-retrigger": 0.012,
  "page-teardown": 0,
} as const;

export const X0_REVIEWED_COUNTS = {
  companions: 10,
  routingCases: 14,
  recipes: 6,
  impulseCheckpoints: 8,
  lifecycleCases: 46,
  registryCases: 32,
  renderCases: 18,
  listeningInstrumentRows: 6,
  listeningScenarioRows: 9,
  mutationControls: 31,
  traces: 18,
  authorities: 7,
} as const;

const REVIEWED_CANONICAL_DIGESTS = {
  graphNodes: "63e4ef534f244a1e2ab328ccf99da7a27056d418e02d5b771eb8e44c9ff34409",
  graphEdges: "86f0e0d8307ab85e40d9ed1f1f1d7547f34018bf117a754521d3814ca4c526b0",
  graphSettings: "ed4816e5e4ea9fbcb1a941cddb2479db072453f54a44272f35717a6ebf9c53a5",
  routingCases: "cb78dae03ce88d9bc853f8c8a6339f6de64f53ad8d38d566d7b311191834b2cc",
  recipes: "a113bd8a9f085a4295e95698cf6a90d7bf7c63230471d2d6a80adc3be2161019",
  normalization: "f927955f137a6d4800b8845b3a472c92d22c662083e9de5d9ebaf47614b028bc",
  pulse: "e5bad32f09dbfe03ef87124d811125144145168bc8f07a48ef78b530b1c1e839",
  impulseCheckpoints: "29ffb97240f4a5f80f24812ff592df1a15413bf2a21d1b8f314ef0e2ee15c1d8",
  lifecycleCases: "2c62e2859e3b9f38f146d7ffd8d6546580f6ee43153c9be68b39330684760c2e",
  registryCases: "97191f50abef6e929f508244f2c5e260d4c9a3616380cb87477a841f02d598f1",
  renderPolicy: "2f48761e269d258d5768c5a708b744c663897140871f9eeadef083ab594cd5db",
  renderCases: "85f86f1edc7e570d8c69f57185ce31d613c7b9a8eedeccea6b4f66b3523995f6",
  listeningInstruments:
    "e676a634a33271eab7f4c2ed9d8cbda008248b3a4403afbe0fc6db4c31596906",
  listeningScenarios:
    "ac4e15093fb990ec23eadb7c9470002442cafc732dbf3b7ac8457e3787424e31",
  authorities: "b964ac82a872c50a40454571225f1a033b25c08f1b25f7a18ca61947b5d52040",
  controls: "dfd0d0df78484042f29d7825c376219d5adf81c2d69f53194e7838f44c8bd2aa",
  traces: "07699cf1ff56714749b89f2e5ff5d8ea6c9c21b1585eb16285f4f51c52e0e44b",
} as const;

type ParsedFixture = Readonly<{
  source: Uint8Array;
  value: JsonObject;
}>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalDigest(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addFinding(
  findings: X0ContractFinding[],
  code: string,
  path: string,
  message: string,
): void {
  findings.push({ code, path, message });
}

function expectEqual(
  findings: X0ContractFinding[],
  code: string,
  path: string,
  actual: unknown,
  expected: unknown,
): void {
  if (!same(actual, expected)) {
    addFinding(findings, code, path, "value differs from reviewed authority");
  }
}

function expectCanonicalDigest(
  findings: X0ContractFinding[],
  code: string,
  path: string,
  actual: unknown,
  expectedDigest: string,
): void {
  if (canonicalDigest(actual) !== expectedDigest) {
    addFinding(findings, code, path, "reviewed semantic records changed");
  }
}

async function parseFixtures(
  fixtureRoot: string,
  findings: X0ContractFinding[],
): Promise<Map<ExpectedFilename, ParsedFixture>> {
  const parsed = new Map<ExpectedFilename, ParsedFixture>();
  let filenames: string[];
  try {
    filenames = (await readdir(fixtureRoot)).sort();
  } catch {
    addFinding(findings, "X0_FILES", fixtureRoot, "fixture directory is unreadable");
    return parsed;
  }

  const expectedSet = new Set<string>(EXPECTED_FILES);
  for (const filename of filenames) {
    if (!expectedSet.has(filename)) {
      addFinding(findings, "X0_FILES", filename, "unexpected fixture file");
    }
  }

  for (const filename of EXPECTED_FILES) {
    if (!filenames.includes(filename)) {
      addFinding(findings, "X0_FILES", filename, "required fixture file is missing");
      continue;
    }
    try {
      const source = await readFile(join(fixtureRoot, filename));
      const value: unknown = JSON.parse(source.toString("utf8"));
      if (!isObject(value)) {
        addFinding(findings, "X0_JSON", filename, "fixture root must be an object");
        continue;
      }
      parsed.set(filename, { source, value });
      if (value.schema !== EXPECTED_SCHEMAS[filename]) {
        addFinding(findings, "X0_SCHEMA", `${filename}.schema`, "schema mismatch");
      }
    } catch {
      addFinding(findings, "X0_JSON", filename, "fixture is not valid JSON");
    }
  }
  return parsed;
}

function validateUniqueIds(
  findings: X0ContractFinding[],
  code: string,
  path: string,
  values: unknown,
  expectedCount: number,
  prefix: string,
): Set<string> {
  const entries = rows(values);
  const ids = new Set<string>();
  if (entries.length !== expectedCount) {
    addFinding(findings, code, path, `expected ${String(expectedCount)} rows`);
  }
  for (const [index, entry] of entries.entries()) {
    if (typeof entry.id !== "string" || !entry.id.startsWith(prefix)) {
      addFinding(
        findings,
        code,
        `${path}.${String(index)}.id`,
        "ID prefix is invalid",
      );
      continue;
    }
    if (ids.has(entry.id)) {
      addFinding(findings, code, `${path}.${String(index)}.id`, "duplicate ID");
    }
    ids.add(entry.id);
  }
  return ids;
}

function validateMain(
  value: JsonObject | undefined,
  findings: X0ContractFinding[],
): void {
  if (value === undefined) return;
  expectEqual(findings, "X0_MAIN", "contract.package", value.package, "X0");
  expectEqual(findings, "X0_MAIN", "contract.contractVersion", value.contractVersion, 1);
  expectEqual(
    findings,
    "X0_MAIN",
    "contract.beadId",
    value.beadId,
    "jcpe-milestone-reliable-studio-l3a.6.1",
  );
  expectEqual(
    findings,
    "X0_MAIN",
    "contract.companions",
    value.companions,
    X0_REVIEWED_COMPANIONS,
  );
  expectEqual(
    findings,
    "X0_MAIN",
    "contract.reviewedFileSha256",
    value.reviewedFileSha256,
    X0_REVIEWED_BYTE_DIGESTS,
  );
  expectEqual(
    findings,
    "X0_MAIN",
    "contract.identities",
    value.identities,
    {
      enginePolicy: { id: "changes.audio-engine", version: 1 },
      registryPolicy: {
        id: "changes.audio-active-voice-registry",
        version: 1,
      },
      recipeSet: { id: "changes.audio.instrument-recipes", version: 1 },
      impulseAlgorithm: "changes.audio.impulse.hall-quartic-q15.v2",
      normalizationPolicy: "changes.audio.voice-normalization.v1",
    },
  );
  const publicSurface = isObject(value.publicSurface) ? value.publicSurface : {};
  expectEqual(
    findings,
    "X0_OPERATIONS",
    "contract.publicSurface.operationOrder",
    publicSurface.operationOrder,
    X0_REVIEWED_OPERATION_ORDER,
  );
  expectEqual(findings, "X0_STATES", "contract.states", value.states, X0_REVIEWED_STATES);
  expectEqual(
    findings,
    "X0_STATES",
    "contract.terminations",
    value.terminations,
    X0_REVIEWED_TERMINATIONS,
  );
  expectEqual(
    findings,
    "X0_REFUSALS",
    "contract.refusalCodes",
    value.refusalCodes,
    X0_REVIEWED_REFUSAL_CODES,
  );
  expectEqual(findings, "X0_LIMITS", "contract.limits", value.limits, X0_REVIEWED_LIMITS);
  expectEqual(
    findings,
    "X0_WORK_COUNTERS",
    "contract.workCounterOrder",
    value.workCounterOrder,
    X0_REVIEWED_WORK_COUNTER_ORDER,
  );
  expectEqual(
    findings,
    "X0_ORDERING",
    "contract.ordering",
    value.ordering,
    {
      sameTimestamp: "old-note-release-before-new-note-start",
      polyphony: [
        "retrigger-retirement",
        "owner-kind-limit",
        "instrument-recipe-limit",
        "global-limit",
        "retained-tail-capacity",
        "new-voice-creation",
      ],
      stealing: [
        "same-incoming-owner-before-other-owner",
        "lower-estimated-envelope-before-higher",
        "earlier-attack-before-later-attack",
        "voice-id-ascending-utf16",
      ],
      snapshots: "voice-id-ascending-utf16-then-instance-token-ascending",
      debugEvents: "increasing-sequence-oldest-retained-first",
    },
  );
  expectEqual(
    findings,
    "X0_RELEASE_POLICY",
    "contract.releaseSeconds",
    value.releaseSeconds,
    X0_REVIEWED_RELEASE_SECONDS,
  );
  expectEqual(
    findings,
    "X0_POLICIES",
    "contract.policies",
    value.policies,
    {
      context: "lazy-first-trusted-play-or-preview-gesture-one-usable-context",
      initialization:
        "create-context-synchronously-before-first-await-and-coalesce-concurrent-calls",
      ordinaryLifecycle: "never-close-or-recreate-context-or-persistent-graph",
      faultRetry: "explicit-trusted-gesture-only-after-no-usable-context",
      graph: "all-progression-section-and-preview-voices-use-identical-persistent-routes",
      instrumentChange: "future-voice-factory-only-never-graph-mutation",
      attackAtomicity:
        "validate-and-plan-complete-batch-before-node-or-registry-mutation",
      retrigger:
        "exact-owner-event-midi-old-instance-retires-before-new-source-start",
      parameterScheduling:
        "reviewed-analytic-amplitude-filter-fm-transient-tremolo-and-release-automation",
      stealEnvelope:
        "changes.audio.estimated-envelope.v1-at-selection-current-time",
      stealEligibility:
        "nonreleasing-only-because-victim-must-reduce-admission-deficit",
      cleanup: "instance-token-checked-idempotent-and-disconnect-exactly-once",
      scheduledRetirement:
        "stop-at-or-before-attack-produces-no-future-audible-attack",
      mix: "cancel-and-hold-when-supported-then-15ms-linear-ramp",
      compressorClaim: "conservative-dynamics-stage-never-limiter",
      wallTime: "performance-evidence-only-never-musical-cutoff",
      platformObjects:
        "remain-inside-audio-adapter-and-never-enter-snapshot-application-or-ui",
    },
  );
  expectEqual(
    findings,
    "X0_COUNTS",
    "contract.coverageSummary",
    value.coverageSummary,
    X0_REVIEWED_COUNTS,
  );
  const independence = isObject(value.independence) ? value.independence : {};
  if (
    independence.productionImplementationAvailableWhenAuthored !== false ||
    independence.productionImportsForbidden !== true ||
    independence.automatedListeningClaim !== false
  ) {
    addFinding(
      findings,
      "X0_INDEPENDENCE",
      "contract.independence",
      "fixture independence statement changed",
    );
  }
  if (JSON.stringify(value).includes("PENDING")) {
    addFinding(findings, "X0_MAIN", "contract", "pending review marker remains");
  }
}

function validateGraph(value: JsonObject | undefined, findings: X0ContractFinding[]): Set<string> {
  if (value === undefined) return new Set();
  if (
    value.createdNodeCount !== 12 ||
    value.existingDestinationCount !== 1 ||
    value.edgeCount !== 13
  ) {
    addFinding(findings, "X0_GRAPH_COUNTS", "graph", "graph counts changed");
  }
  expectCanonicalDigest(
    findings,
    "X0_GRAPH_NODES",
    "graph.nodes",
    value.nodes,
    REVIEWED_CANONICAL_DIGESTS.graphNodes,
  );
  expectCanonicalDigest(
    findings,
    "X0_GRAPH_EDGES",
    "graph.edges",
    value.edges,
    REVIEWED_CANONICAL_DIGESTS.graphEdges,
  );
  expectCanonicalDigest(
    findings,
    "X0_GRAPH_SETTINGS",
    "graph.settings",
    value.settings,
    REVIEWED_CANONICAL_DIGESTS.graphSettings,
  );
  expectEqual(
    findings,
    "X0_GRAPH_SETTINGS",
    "graph.settings",
    value.settings,
    X0_REVIEWED_GRAPH_SETTINGS,
  );
  expectCanonicalDigest(
    findings,
    "X0_ROUTING_CASES",
    "graph.routingCases",
    value.routingCases,
    REVIEWED_CANONICAL_DIGESTS.routingCases,
  );
  return validateUniqueIds(
    findings,
    "X0_ROUTING_CASES",
    "graph.routingCases",
    value.routingCases,
    14,
    "X0-ROUTE-",
  );
}

function validateRecipes(value: JsonObject | undefined, findings: X0ContractFinding[]): void {
  if (value === undefined) return;
  if (
    value.recipeSetId !== "changes.audio.instrument-recipes" ||
    value.recipeSetVersion !== 1 ||
    value.expectedValuesGenerated !== false
  ) {
    addFinding(findings, "X0_RECIPE_IDENTITY", "recipes", "recipe identity changed");
  }
  expectCanonicalDigest(
    findings,
    "X0_RECIPES",
    "recipes.recipes",
    value.recipes,
    REVIEWED_CANONICAL_DIGESTS.recipes,
  );
  const recipeRows = rows(value.recipes);
  expectEqual(
    findings,
    "X0_RECIPES",
    "recipes.ids",
    recipeRows.map((recipe) => recipe.id),
    X0_REVIEWED_RECIPE_IDS,
  );
  expectEqual(
    findings,
    "X0_RECIPES",
    "recipes.levels",
    recipeRows.map((recipe) => recipe.outputLevel),
    X0_REVIEWED_RECIPE_LEVELS,
  );
  expectEqual(
    findings,
    "X0_RECIPES",
    "recipes.polyphony",
    recipeRows.map((recipe) => recipe.polyphonyLimit),
    X0_REVIEWED_RECIPE_POLYPHONY,
  );
  expectEqual(
    findings,
    "X0_RECIPES",
    "recipes.sourceCounts",
    recipeRows.map((recipe) => recipe.scheduledSourceCount),
    X0_REVIEWED_RECIPE_SOURCE_COUNTS,
  );
  const renderedRows = recipeRows.filter(
    (recipe) => recipe["synthesis"] === "rendered",
  );
  if (renderedRows.length !== 1) {
    addFinding(
      findings,
      "X0_RECIPES",
      "recipes.rendered",
      "exactly one reviewed rendered recipe is required",
    );
  }
  expectEqual(
    findings,
    "X0_RECIPES",
    "recipes.rendered.concert-grand",
    renderedRows[0],
    X0_REVIEWED_RENDERED_RECIPE,
  );
  expectCanonicalDigest(
    findings,
    "X0_NORMALIZATION",
    "recipes.normalization",
    value.normalization,
    REVIEWED_CANONICAL_DIGESTS.normalization,
  );
  expectCanonicalDigest(
    findings,
    "X0_PULSE",
    "recipes.pulseWave",
    value.pulseWave,
    REVIEWED_CANONICAL_DIGESTS.pulse,
  );
}

type ImpulseReference = Readonly<{
  interleavedHash: string;
  channelHashes: readonly [string, string];
  peakQ15: number;
  finalState: number;
  checkpoints: readonly JsonObject[];
  firstEightLeft: readonly number[];
  firstEightRight: readonly number[];
}>;

function generateIndependentImpulseReference(): ImpulseReference {
  const length = X0_REVIEWED_IMPULSE.referenceFrames;
  const interleaved = Buffer.alloc(length * 4);
  const left = Buffer.alloc(length * 2);
  const right = Buffer.alloc(length * 2);
  const checkpointFrames = new Set([0, 1, 2, 47_999, 95_999, 143_999, 191_998, 191_999]);
  const checkpoints: JsonObject[] = [];
  const firstEightLeft: number[] = [];
  const firstEightRight: number[] = [];
  let state = X0_REVIEWED_IMPULSE.seedUint32 >>> 0;
  let peakQ15 = 0;
  const predelayFrames = Math.floor(
    X0_REVIEWED_IMPULSE.referenceSampleRate / X0_REVIEWED_IMPULSE.predelayDivisor,
  );
  /* remaining^4 exceeds 2^53, so the quartic envelope must be BigInt-exact. */
  const lengthFourth = BigInt(length) ** 4n;
  const lowpassFirst: [number, number] = [0, 0];
  const lowpassSecond: [number, number] = [0, 0];

  for (let frame = 0; frame < length; frame += 1) {
    const envelopeQ15 =
      frame < predelayFrames
        ? 0
        : Number(
            (BigInt(length - frame) ** 4n *
              BigInt(X0_REVIEWED_IMPULSE.envelopeQ15Maximum)) /
              lengthFourth,
          );
    const samples: [number, number] = [0, 0];
    for (let channel = 0; channel < 2; channel += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      const noise = (state >>> 16) - 32_768;
      const lp1 =
        (lowpassFirst[channel] ?? 0) +
        Math.trunc(
          (X0_REVIEWED_IMPULSE.lowpassAlphaQ15 *
            (noise - (lowpassFirst[channel] ?? 0))) /
            32_768,
        );
      const lp2 =
        (lowpassSecond[channel] ?? 0) +
        Math.trunc(
          (X0_REVIEWED_IMPULSE.lowpassAlphaQ15 *
            (lp1 - (lowpassSecond[channel] ?? 0))) /
            32_768,
        );
      lowpassFirst[channel] = lp1;
      lowpassSecond[channel] = lp2;
      const sample = Math.trunc((lp2 * envelopeQ15) / 32_768);
      samples[channel] = sample;
      peakQ15 = Math.max(peakQ15, Math.abs(sample));
      interleaved.writeInt16LE(sample, frame * 4 + channel * 2);
      (channel === 0 ? left : right).writeInt16LE(sample, frame * 2);
    }
    if (frame < 8) {
      firstEightLeft.push(samples[0]);
      firstEightRight.push(samples[1]);
    }
    if (checkpointFrames.has(frame)) {
      checkpoints.push({
        frame,
        leftQ15: samples[0],
        rightQ15: samples[1],
      });
    }
  }

  return {
    interleavedHash: sha256(interleaved),
    channelHashes: [sha256(left), sha256(right)],
    peakQ15,
    finalState: state,
    checkpoints,
    firstEightLeft,
    firstEightRight,
  };
}

function validateImpulse(value: JsonObject | undefined, findings: X0ContractFinding[]): void {
  if (value === undefined) return;
  const policyActual = {
    algorithmId: value.algorithmId,
    ownership: value.ownership,
    license: value.license,
    runtimeNetworkRequired: value.runtimeNetworkRequired,
    seedUint32: value.seedUint32,
    seedHex: value.seedHex,
    channels: value.channels,
    durationSeconds: value.durationSeconds,
    predelayDivisor: value.predelayDivisor,
    referencePredelayFrames: value.referencePredelayFrames,
    lowpassAlphaQ15: value.lowpassAlphaQ15,
    lowpassStages: value.lowpassStages,
    sampleRateRange: value.sampleRateRange,
    referenceSampleRate: value.referenceSampleRate,
    referenceFrames: value.referenceFrames,
    referenceScalarSamples: value.referenceScalarSamples,
    referenceBytes: value.referenceBytes,
    convolverNormalize: value.convolverNormalize,
  };
  expectEqual(findings, "X0_IMPULSE_POLICY", "impulse.policy", policyActual, {
    algorithmId: X0_REVIEWED_IMPULSE.algorithmId,
    ownership: "project-authored-code-no-external-asset",
    license: "same-as-project",
    runtimeNetworkRequired: false,
    seedUint32: X0_REVIEWED_IMPULSE.seedUint32,
    seedHex: "0x58403031",
    channels: 2,
    durationSeconds: 4,
    predelayDivisor: 50,
    referencePredelayFrames: 960,
    lowpassAlphaQ15: 6_000,
    lowpassStages: 2,
    sampleRateRange: [8_000, 192_000],
    referenceSampleRate: 48_000,
    referenceFrames: 192_000,
    referenceScalarSamples: 384_000,
    referenceBytes: 768_000,
    convolverNormalize: true,
  });

  const reference = generateIndependentImpulseReference();
  expectEqual(
    findings,
    "X0_IMPULSE_HASH",
    "impulse.referenceInterleavedInt16LeSha256",
    value.referenceInterleavedInt16LeSha256,
    reference.interleavedHash,
  );
  expectEqual(
    findings,
    "X0_IMPULSE_HASH",
    "impulse.referenceChannelInt16LeSha256",
    value.referenceChannelInt16LeSha256,
    reference.channelHashes,
  );
  if (
    value.referencePeakQ15 !== reference.peakQ15 ||
    value.referenceFinalStateUint32 !== reference.finalState ||
    value.referenceFinalStateHex !== "0xd2e26364"
  ) {
    addFinding(findings, "X0_IMPULSE_HASH", "impulse.summary", "impulse summary changed");
  }
  expectCanonicalDigest(
    findings,
    "X0_IMPULSE_CHECKPOINTS",
    "impulse.checkpoints",
    value.checkpoints,
    REVIEWED_CANONICAL_DIGESTS.impulseCheckpoints,
  );
  expectEqual(
    findings,
    "X0_IMPULSE_CHECKPOINTS",
    "impulse.checkpoints",
    value.checkpoints,
    reference.checkpoints,
  );
  expectEqual(
    findings,
    "X0_IMPULSE_CHECKPOINTS",
    "impulse.firstEightLeftQ15",
    value.firstEightLeftQ15,
    reference.firstEightLeft,
  );
  expectEqual(
    findings,
    "X0_IMPULSE_CHECKPOINTS",
    "impulse.firstEightRightQ15",
    value.firstEightRightQ15,
    reference.firstEightRight,
  );
}

function validateCaseCorpus(
  value: JsonObject | undefined,
  findings: X0ContractFinding[],
  options: Readonly<{
    key: string;
    count: number;
    prefix: string;
    code: string;
    digest: string;
  }>,
): Set<string> {
  if (value === undefined) return new Set();
  expectCanonicalDigest(
    findings,
    options.code,
    `${options.key}.cases`,
    value.cases,
    options.digest,
  );
  return validateUniqueIds(
    findings,
    options.code,
    `${options.key}.cases`,
    value.cases,
    options.count,
    options.prefix,
  );
}

function validateRender(value: JsonObject | undefined, findings: X0ContractFinding[]): Set<string> {
  if (value === undefined) return new Set();
  expectEqual(
    findings,
    "X0_RENDER_POLICY",
    "render.numericPolicy",
    value.numericPolicy,
    X0_REVIEWED_RENDER_POLICY,
  );
  expectCanonicalDigest(
    findings,
    "X0_RENDER_POLICY",
    "render.numericPolicy",
    value.numericPolicy,
    REVIEWED_CANONICAL_DIGESTS.renderPolicy,
  );
  expectCanonicalDigest(
    findings,
    "X0_RENDER_CASES",
    "render.cases",
    value.cases,
    REVIEWED_CANONICAL_DIGESTS.renderCases,
  );
  const ids = validateUniqueIds(
    findings,
    "X0_RENDER_CASES",
    "render.cases",
    value.cases,
    18,
    "X0-RENDER-",
  );
  const recipeCounts = new Map<string, number>();
  for (const entry of rows(value.cases)) {
    if (typeof entry.instrumentId === "string") {
      recipeCounts.set(entry.instrumentId, (recipeCounts.get(entry.instrumentId) ?? 0) + 1);
    }
  }
  for (const recipeId of X0_REVIEWED_RECIPE_IDS) {
    if (recipeCounts.get(recipeId) !== 3) {
      addFinding(
        findings,
        "X0_RENDER_CASES",
        `render.${recipeId}`,
        "each recipe requires three render rows",
      );
    }
  }
  return ids;
}

function validateListening(
  value: JsonObject | undefined,
  findings: X0ContractFinding[],
): Set<string> {
  if (value === undefined) return new Set();
  if (
    value.automatedListeningClaim !== false ||
    value.releaseStatus !== "unexecuted-until-release-checklist"
  ) {
    addFinding(
      findings,
      "X0_LISTENING_POLICY",
      "listening",
      "automation cannot claim listening completion",
    );
  }
  expectCanonicalDigest(
    findings,
    "X0_LISTENING_ROWS",
    "listening.instrumentRows",
    value.instrumentRows,
    REVIEWED_CANONICAL_DIGESTS.listeningInstruments,
  );
  expectCanonicalDigest(
    findings,
    "X0_LISTENING_ROWS",
    "listening.scenarioRows",
    value.scenarioRows,
    REVIEWED_CANONICAL_DIGESTS.listeningScenarios,
  );
  const instrumentIds = validateUniqueIds(
    findings,
    "X0_LISTENING_ROWS",
    "listening.instrumentRows",
    value.instrumentRows,
    6,
    "X0-LISTEN-INST-",
  );
  const scenarioIds = validateUniqueIds(
    findings,
    "X0_LISTENING_ROWS",
    "listening.scenarioRows",
    value.scenarioRows,
    9,
    "X0-LISTEN-SCENE-",
  );
  return new Set([...instrumentIds, ...scenarioIds]);
}

function resolvePointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let current: unknown = root;
  for (const rawSegment of pointer.slice(1).split("/")) {
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else if (isObject(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function validateMutations(
  value: JsonObject | undefined,
  allFixtures: ReadonlyMap<ExpectedFilename, ParsedFixture>,
  findings: X0ContractFinding[],
): Set<string> {
  if (value === undefined) return new Set();
  expectCanonicalDigest(
    findings,
    "X0_MUTATIONS",
    "mutations.controls",
    value.controls,
    REVIEWED_CANONICAL_DIGESTS.controls,
  );
  const ids = validateUniqueIds(
    findings,
    "X0_MUTATIONS",
    "mutations.controls",
    value.controls,
    31,
    "X0-MUT-",
  );
  const allowedFiles = new Set<string>(EXPECTED_FILES);
  for (const [index, control] of rows(value.controls).entries()) {
    if (
      typeof control.file !== "string" ||
      !allowedFiles.has(control.file) ||
      control.operation !== "replace" ||
      typeof control.pointer !== "string" ||
      typeof control.expectedFindingCode !== "string" ||
      control.expectedFindingCode.length === 0
    ) {
      addFinding(
        findings,
        "X0_MUTATIONS",
        `mutations.controls.${String(index)}`,
        "mutation shape is invalid",
      );
      continue;
    }
    const fixture = allFixtures.get(control.file as ExpectedFilename);
    const current = resolvePointer(fixture?.value, control.pointer);
    if (current === undefined || same(current, control.value)) {
      addFinding(
        findings,
        "X0_MUTATIONS",
        `mutations.controls.${String(index)}.pointer`,
        "mutation pointer must resolve and change its value",
      );
    }
  }
  return ids;
}

function validateProvenance(
  value: JsonObject | undefined,
  findings: X0ContractFinding[],
): void {
  if (value === undefined) return;
  if (
    value.expectedValuesGenerated !== false ||
    value.productionOutputUsed !== false ||
    value.reviewState !== "reviewed-for-x0-spec"
  ) {
    addFinding(findings, "X0_PROVENANCE", "provenance", "provenance state changed");
  }
  expectCanonicalDigest(
    findings,
    "X0_PROVENANCE",
    "provenance.authorities",
    value.authorities,
    REVIEWED_CANONICAL_DIGESTS.authorities,
  );
  validateUniqueIds(
    findings,
    "X0_PROVENANCE",
    "provenance.authorities",
    value.authorities,
    7,
    "AUTH-",
  );
}

function validateTraces(
  value: JsonObject | undefined,
  caseIds: ReadonlySet<string>,
  controlIds: ReadonlySet<string>,
  findings: X0ContractFinding[],
): void {
  const linkedCaseIds = new Set<string>();
  const deferredCaseIds = new Set<string>();
  if (value === undefined) return;
  expectCanonicalDigest(
    findings,
    "X0_TRACES",
    "traces.traces",
    value.traces,
    REVIEWED_CANONICAL_DIGESTS.traces,
  );
  validateUniqueIds(
    findings,
    "X0_TRACES",
    "traces.traces",
    value.traces,
    18,
    "TR-",
  );
  for (const [index, trace] of rows(value.traces).entries()) {
    for (const caseId of strings(trace.caseIds)) {
      linkedCaseIds.add(caseId);
      if (!caseIds.has(caseId)) {
        addFinding(
          findings,
          "X0_TRACE_LINK",
          `traces.traces.${String(index)}.caseIds`,
          `unknown case ${caseId}`,
        );
      }
    }
    for (const caseId of strings(trace.deferredCaseIds)) {
      deferredCaseIds.add(caseId);
      if (!caseIds.has(caseId)) {
        addFinding(
          findings,
          "X0_TRACE_LINK",
          `traces.traces.${String(index)}.deferredCaseIds`,
          `unknown deferred case ${caseId}`,
        );
      }
      if (strings(trace.caseIds).includes(caseId)) {
        addFinding(
          findings,
          "X0_TRACE_LINK",
          `traces.traces.${String(index)}.deferredCaseIds`,
          `case ${caseId} cannot be both required and deferred`,
        );
      }
    }
    if (
      strings(trace.deferredCaseIds).length > 0 &&
      (
        trace.deferredUntilPackage !== "X1" ||
        typeof trace.deferredReason !== "string" ||
        trace.deferredReason.length === 0
      )
    ) {
      addFinding(
        findings,
        "X0_TRACE_LINK",
        `traces.traces.${String(index)}.deferredCaseIds`,
        "deferred cases require the reviewed X1 package and a nonempty reason",
      );
    }
    for (const controlId of strings(trace.controlIds)) {
      if (!controlIds.has(controlId)) {
        addFinding(
          findings,
          "X0_TRACE_LINK",
          `traces.traces.${String(index)}.controlIds`,
          `unknown control ${controlId}`,
        );
      }
    }
    if (
      strings(trace.caseIds).length === 0 ||
      strings(trace.controlIds).length === 0 ||
      typeof trace.evidenceOwner !== "string" ||
      trace.evidenceOwner.length === 0
    ) {
      addFinding(
        findings,
        "X0_TRACE_LINK",
        `traces.traces.${String(index)}`,
        "trace requires cases, controls, and evidence owner",
      );
    }
  }
  for (const caseId of caseIds) {
    if (!linkedCaseIds.has(caseId) && !deferredCaseIds.has(caseId)) {
      addFinding(
        findings,
        "X0_TRACE_LINK",
        `traces.caseIds.${caseId}`,
        "reviewed case has no required or explicitly deferred trace link",
      );
    }
  }
}

export async function validateX0Contract(
  fixtureRoot = resolve("tests/fixtures/audio-engine"),
): Promise<X0ContractValidationReport> {
  const findings: X0ContractFinding[] = [];
  const parsed = await parseFixtures(fixtureRoot, findings);

  for (const filename of X0_REVIEWED_COMPANIONS) {
    const fixture = parsed.get(filename);
    if (
      fixture !== undefined &&
      sha256(fixture.source) !== X0_REVIEWED_BYTE_DIGESTS[filename]
    ) {
      addFinding(
        findings,
        "X0_BYTE_DIGEST",
        filename,
        "reviewed companion bytes changed",
      );
    }
  }
  const contractFixture = parsed.get(CONTRACT_FILENAME);
  if (
    contractFixture !== undefined &&
    sha256(contractFixture.source) !== X0_REVIEWED_CONTRACT_BYTE_DIGEST
  ) {
    addFinding(
      findings,
      "X0_CONTRACT_DIGEST",
      CONTRACT_FILENAME,
      "reviewed machine contract bytes changed",
    );
  }

  const contract = contractFixture?.value;
  const graph = parsed.get("graph-topology.json")?.value;
  const impulse = parsed.get("impulse-golden.json")?.value;
  const recipes = parsed.get("instrument-recipes.json")?.value;
  const lifecycle = parsed.get("lifecycle-cases.json")?.value;
  const listening = parsed.get("listening-rubric.json")?.value;
  const mutations = parsed.get("mutation-controls.json")?.value;
  const provenance = parsed.get("provenance-ledger.json")?.value;
  const registry = parsed.get("registry-cases.json")?.value;
  const render = parsed.get("render-matrix.json")?.value;
  const traces = parsed.get("trace-ledger.json")?.value;

  validateMain(contract, findings);
  const routingIds = validateGraph(graph, findings);
  validateRecipes(recipes, findings);
  validateImpulse(impulse, findings);
  const lifecycleIds = validateCaseCorpus(lifecycle, findings, {
    key: "lifecycle",
    count: 46,
    prefix: "X0-LIFE-",
    code: "X0_LIFECYCLE_CASES",
    digest: REVIEWED_CANONICAL_DIGESTS.lifecycleCases,
  });
  const rejectedResume = rows(lifecycle?.cases).find(
    (entry) => entry["id"] === "X0-LIFE-033",
  );
  if (
    rejectedResume?.["expectedOutcome"] !== "platform-fault" ||
    rejectedResume["expectedState"] !== "fault" ||
    rejectedResume["expectedCode"] !== "audio.context_resume_failed" ||
    typeof rejectedResume["expectedDetail"] !== "string" ||
    !rejectedResume["expectedDetail"].includes("context closes") ||
    !rejectedResume["expectedDetail"].includes("replacement")
  ) {
    addFinding(
      findings,
      "X0_LIFECYCLE_CASES",
      "lifecycle.cases.X0-LIFE-033",
      "a rejected platform resume must fault, close the unusable context, and require replacement",
    );
  }
  if (registry?.referenceCountPerVoice !== 6) {
    addFinding(
      findings,
      "X0_REGISTRY_CASES",
      "registry.referenceCountPerVoice",
      "each retained voice requires six index references",
    );
  }
  const registryIds = validateCaseCorpus(registry, findings, {
    key: "registry",
    count: 32,
    prefix: "X0-REG-",
    code: "X0_REGISTRY_CASES",
    digest: REVIEWED_CANONICAL_DIGESTS.registryCases,
  });
  const refusalEvidence = JSON.stringify([
    lifecycle?.cases,
    registry?.cases,
  ]);
  for (const refusalCode of X0_REVIEWED_REFUSAL_CODES) {
    if (!refusalEvidence.includes(refusalCode)) {
      addFinding(
        findings,
        "X0_REFUSAL_COVERAGE",
        `refusal.${refusalCode}`,
        "reviewed lifecycle or registry evidence is missing",
      );
    }
  }
  const renderIds = validateRender(render, findings);
  const listeningIds = validateListening(listening, findings);
  validateProvenance(provenance, findings);
  const controlIds = validateMutations(mutations, parsed, findings);
  const allCaseIds = new Set([
    ...routingIds,
    ...lifecycleIds,
    ...registryIds,
    ...renderIds,
    ...listeningIds,
  ]);
  validateTraces(traces, allCaseIds, controlIds, findings);

  const counts = {
    companions: X0_REVIEWED_COMPANIONS.filter((filename) => parsed.has(filename)).length,
    routingCases: rows(graph?.routingCases).length,
    recipes: rows(recipes?.recipes).length,
    impulseCheckpoints: rows(impulse?.checkpoints).length,
    lifecycleCases: rows(lifecycle?.cases).length,
    registryCases: rows(registry?.cases).length,
    renderCases: rows(render?.cases).length,
    listeningInstrumentRows: rows(listening?.instrumentRows).length,
    listeningScenarioRows: rows(listening?.scenarioRows).length,
    mutationControls: rows(mutations?.controls).length,
    traces: rows(traces?.traces).length,
    authorities: rows(provenance?.authorities).length,
  };

  return {
    schema: "changes.validation.x0-contract.v1",
    package: "X0",
    outcome: findings.length === 0 ? "pass" : "fail",
    counts,
    findings,
  };
}

if (import.meta.main) {
  const report = await validateX0Contract();
  console.log(JSON.stringify(report, null, 2));
  if (report.outcome === "fail") process.exitCode = 1;
}
