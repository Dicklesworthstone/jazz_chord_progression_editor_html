import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "typescript";

import {
  AUDIO_ATTACK_VALIDATION_ORDER,
  AUDIO_CONTEXT_CREATION_OPTIONS,
  AUDIO_DEBUG_EVENT_KINDS,
  AUDIO_ENGINE_CONTRACT_SCHEMA,
  AUDIO_ENGINE_OPERATION_NAMES,
  AUDIO_ENGINE_POLICY_ID,
  AUDIO_ENGINE_POLICY_VERSION,
  AUDIO_ENGINE_REFUSAL_CODES,
  AUDIO_ENGINE_SNAPSHOT_SCHEMA,
  AUDIO_ENGINE_STATES,
  AUDIO_ENGINE_TERMINATIONS,
  AUDIO_ENGINE_WORK_COUNTER_NAMES,
  AUDIO_ESTIMATED_ENVELOPE_POLICY,
  AUDIO_GRAPH_EDGE_ENTRIES,
  AUDIO_GRAPH_NODE_IDS,
  AUDIO_IMPULSE_POLICY,
  AUDIO_INITIALIZATION_VALIDATION_ORDER,
  AUDIO_INSTRUMENT_RECIPES,
  AUDIO_MIX_POLICY,
  AUDIO_NORMALIZATION_POLICY,
  AUDIO_PARAMETER_SCHEDULING_POLICY,
  AUDIO_PERSISTENT_GRAPH_SETTINGS,
  AUDIO_POLYPHONY_ENFORCEMENT_ORDER,
  AUDIO_PULSE_WAVE_POLICY,
  AUDIO_RECIPE_SET_ID,
  AUDIO_RECIPE_SET_VERSION,
  AUDIO_RETRIGGER_POLICY,
  AUDIO_RETIREMENT_REASONS,
  AUDIO_RETIREMENT_RELEASE_SECONDS,
  AUDIO_RETIREMENT_SELECTOR_KINDS,
  AUDIO_RETIREMENT_VALIDATION_ORDER,
  AUDIO_STEAL_ELIGIBILITY_POLICY,
  AUDIO_STEAL_ORDER,
  AUDIO_VOICE_PHASES,
  AUDIO_VOICE_REGISTRY_POLICY_ID,
  AUDIO_VOICE_REGISTRY_POLICY_VERSION,
  MAX_AUDIO_DEBUG_EVENTS,
  MAX_AUDIO_GATE_SECONDS,
  MAX_AUDIO_GENERATION,
  MAX_AUDIO_GESTURE_SEQUENCE,
  MAX_AUDIO_ID_ASCII_LENGTH,
  MAX_AUDIO_IMPULSE_BYTES,
  MAX_AUDIO_IMPULSE_SCALAR_SAMPLES,
  MAX_AUDIO_INTERNAL_SEQUENCE,
  MAX_AUDIO_NATURAL_CLEANUP_SECONDS_AFTER_RELEASE,
  MAX_AUDIO_PERSISTENT_CREATED_NODES,
  MAX_AUDIO_PERSISTENT_EDGES,
  MAX_AUDIO_PREVIEW_VOICES,
  MAX_AUDIO_PROGRESSION_VOICES,
  MAX_AUDIO_RECIPE_RELEASE_SECONDS,
  MAX_AUDIO_REGISTRY_INDEX_REFERENCES,
  MAX_AUDIO_RETAINED_VOICES,
  MAX_AUDIO_SCHEDULED_SOURCE_NODES,
  MAX_AUDIO_SCHEDULED_SOURCES_PER_VOICE,
  MAX_AUDIO_SCHEDULE_LOOKAHEAD_SECONDS,
  MAX_AUDIO_SOFT_CLIP_CURVE_LENGTH,
  MAX_AUDIO_NONRELEASING_VOICES,
  MAX_AUDIO_VOICES_PER_BATCH,
  MIN_AUDIO_GATE_SECONDS,
  type AudioActiveVoiceSnapshot,
  type AudioAttackBatchRequest,
  type AudioEngine,
  type AudioEngineOperationName,
  type AudioEngineResult,
  type AudioEngineSnapshot,
  type AudioPlatform,
  type AudioRetireRequest,
  type AudioRetirementSelector,
  type AudioVoiceOwner,
} from "../../src/audio";
import {
  X0_REVIEWED_BYTE_DIGESTS,
  X0_REVIEWED_CONTRACT_BYTE_DIGEST,
  X0_REVIEWED_COUNTS,
  X0_REVIEWED_GRAPH_EDGES,
  X0_REVIEWED_GRAPH_NODE_IDS,
  X0_REVIEWED_GRAPH_SETTINGS,
  X0_REVIEWED_IMPULSE,
  X0_REVIEWED_LIMITS,
  X0_REVIEWED_OPERATION_ORDER,
  X0_REVIEWED_RECIPE_IDS,
  X0_REVIEWED_RECIPE_LEVELS,
  X0_REVIEWED_RECIPE_POLYPHONY,
  X0_REVIEWED_RECIPE_SOURCE_COUNTS,
  X0_REVIEWED_RENDER_POLICY,
  X0_REVIEWED_REFUSAL_CODES,
  X0_REVIEWED_RELEASE_SECONDS,
  X0_REVIEWED_STATES,
  X0_REVIEWED_TERMINATIONS,
  X0_REVIEWED_WORK_COUNTER_ORDER,
  validateX0Contract,
  type X0ContractValidationReport,
} from "../../scripts/validate-x0-contract";

setDefaultTimeout(120_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Extends<Left, Right> = Left extends Right ? true : false;

type Success = Extract<AudioEngineResult<"receipt">, { ok: true }>;
type Failure = Extract<AudioEngineResult<"receipt">, { ok: false }>;

const typeAssertions: readonly [
  Assert<Equal<keyof AudioEngine, AudioEngineOperationName>>,
  Assert<Equal<Success["value"], "receipt">>,
  Assert<Equal<Success["termination"], "completed">>,
  Assert<Equal<Failure["termination"], "refused" | "platform-fault">>,
  Assert<Equal<AudioAttackBatchRequest["voices"][0]["voiceId"], string>>,
  Assert<Extends<AudioAttackBatchRequest["voices"], readonly [unknown, ...unknown[]]>>,
  Assert<Equal<AudioRetireRequest["selector"], AudioRetirementSelector>>,
  Assert<Equal<AudioVoiceOwner["kind"], "preview" | "progression">>,
  Assert<Equal<keyof AudioPlatform, "createContext">>,
  Assert<
    Equal<
      keyof AudioEngineSnapshot,
      | "activeVoices"
      | "contextSampleRate"
      | "contextState"
      | "debugEvents"
      | "debugEventsDropped"
      | "graphInstanceId"
      | "mix"
      | "persistentCreatedNodeCount"
      | "persistentEdgeCount"
      | "previewNonreleasingVoiceCount"
      | "progressionNonreleasingVoiceCount"
      | "registryIndexCounts"
      | "releasingVoiceCount"
      | "retainedVoiceCount"
      | "schema"
      | "nonreleasingVoiceCount"
      | "state"
      | "work"
    >
  >,
  Assert<
    Equal<
      keyof AudioActiveVoiceSnapshot,
      | "attackTimeSeconds"
      | "cleanupDeadlineSeconds"
      | "effectiveReleaseTimeSeconds"
      | "eventId"
      | "instanceToken"
      | "instrumentId"
      | "midiPitch"
      | "naturalReleaseTimeSeconds"
      | "normalizationGain"
      | "originalBatchVoiceCount"
      | "owner"
      | "phase"
      | "releaseDurationSeconds"
      | "scheduledSourceCount"
      | "velocity"
      | "velocityGain"
      | "voiceId"
    >
  >,
] = [true, true, true, true, true, true, true, true, true, true, true];

const fixtureRoot = new URL("../fixtures/audio-engine", import.meta.url).pathname;
const audioSourceRoot = new URL("../../src/audio", import.meta.url).pathname;
const contractDocPath = new URL(
  "../../docs/X0_AUDIO_ENGINE_CONTRACT.md",
  import.meta.url,
).pathname;
const architecturePath = new URL(
  "../../docs/ARCHITECTURE.md",
  import.meta.url,
).pathname;
const packagePath = new URL("../../package.json", import.meta.url).pathname;
const verifyPath = new URL("../../scripts/verify.ts", import.meta.url).pathname;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new Error(`X0_TEST_OBJECT: ${label}`);
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`X0_TEST_ARRAY: ${label}`);
  return value;
}

async function readJsonObject(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")), path);
}

function decodePointerSegment(value: string): string {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function replacePointer(root: JsonObject, pointer: string, value: unknown): void {
  const segments = pointer.slice(1).split("/").map(decodePointerSegment);
  let current: unknown = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isObject(current)) {
      current = current[segment];
    } else {
      throw new Error(`X0_TEST_POINTER_PARENT: ${pointer}`);
    }
  }
  const finalSegment = segments.at(-1);
  if (finalSegment === undefined) throw new Error(`X0_TEST_POINTER_EMPTY: ${pointer}`);
  if (Array.isArray(current)) {
    current[Number(finalSegment)] = value;
  } else if (isObject(current)) {
    current[finalSegment] = value;
  } else {
    throw new Error(`X0_TEST_POINTER_TARGET: ${pointer}`);
  }
}

function findingCodes(report: X0ContractValidationReport): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

function sourceCount(recipe: (typeof AUDIO_INSTRUMENT_RECIPES)[number]): number {
  if (recipe.synthesis === "fm-pair") return 2;
  if (recipe.synthesis === "rendered") {
    /* One AudioBufferSourceNode per rendered voice; renderer shape is exact. */
    const RENDERER_BY_ID: Record<string, object> = {
      "concert-grand": {
        algorithmId: "changes.dsp.concert-grand@1",
        channels: 2,
        maximumRenderSeconds: 8,
        bufferCacheLimit: 96,
      },
      "upright-bass": {
        algorithmId: "changes.dsp.sampled-upright-bass@1",
        channels: 2,
        maximumRenderSeconds: 4,
        bufferCacheLimit: 64,
      },
      "concert-vibes": {
        algorithmId: "changes.dsp.sampled-vibraphone@1",
        channels: 2,
        maximumRenderSeconds: 4,
        bufferCacheLimit: 64,
      },
      flute: {
        algorithmId: "changes.dsp.waveguide-flute@1",
        channels: 2,
        maximumRenderSeconds: 5,
        bufferCacheLimit: 64,
      },
      guitar: {
        algorithmId: "changes.dsp.waveguide-guitar-clean@1",
        channels: 2,
        maximumRenderSeconds: 6,
        bufferCacheLimit: 64,
      },
      "blues-guitar": {
        algorithmId: "changes.dsp.waveguide-guitar-drive@1",
        channels: 2,
        maximumRenderSeconds: 6,
        bufferCacheLimit: 64,
      },
      clarinet: {
        algorithmId: "changes.dsp.waveguide-clarinet@1",
        channels: 2,
        maximumRenderSeconds: 5,
        bufferCacheLimit: 64,
      },
    };
    const expectedRenderer = RENDERER_BY_ID[recipe.id];
    if (expectedRenderer === undefined) {
      throw new Error(`TEST_RENDERED_RECIPE_UNREVIEWED: ${recipe.id}`);
    }
    expect(recipe.renderer as object).toEqual(expectedRenderer);
    return 1;
  }
  return (
    recipe.oscillators.length +
    (recipe.transient === null ? 0 : 1) +
    (recipe.tremolo === null ? 0 : 1)
  );
}

describe("X0 reviewed persistent audio engine contract", () => {
  test("public types and constants match the independent machine authority", () => {
    expect(typeAssertions).toHaveLength(11);
    expect(AUDIO_ENGINE_CONTRACT_SCHEMA).toBe("changes.audio.engine-contract.v1");
    expect(AUDIO_ENGINE_SNAPSHOT_SCHEMA).toBe("changes.audio.engine-snapshot.v1");
    expect([AUDIO_ENGINE_POLICY_ID, AUDIO_ENGINE_POLICY_VERSION]).toEqual([
      "changes.audio-engine",
      1,
    ]);
    expect([
      AUDIO_VOICE_REGISTRY_POLICY_ID,
      AUDIO_VOICE_REGISTRY_POLICY_VERSION,
    ]).toEqual(["changes.audio-active-voice-registry", 1]);
    expect(AUDIO_ENGINE_OPERATION_NAMES).toEqual(X0_REVIEWED_OPERATION_ORDER);
    expect(AUDIO_ENGINE_STATES).toEqual(X0_REVIEWED_STATES);
    expect(AUDIO_ENGINE_TERMINATIONS).toEqual(X0_REVIEWED_TERMINATIONS);
    expect(AUDIO_ENGINE_REFUSAL_CODES).toEqual(X0_REVIEWED_REFUSAL_CODES);
    expect(AUDIO_ENGINE_WORK_COUNTER_NAMES).toEqual(
      X0_REVIEWED_WORK_COUNTER_ORDER,
    );
    expect({
      idAsciiLength: MAX_AUDIO_ID_ASCII_LENGTH,
      maximumGeneration: MAX_AUDIO_GENERATION,
      maximumGestureSequence: MAX_AUDIO_GESTURE_SEQUENCE,
      maximumInternalSequence: MAX_AUDIO_INTERNAL_SEQUENCE,
      nonreleasingVoices: MAX_AUDIO_NONRELEASING_VOICES,
      retainedVoices: MAX_AUDIO_RETAINED_VOICES,
      progressionVoices: MAX_AUDIO_PROGRESSION_VOICES,
      previewVoices: MAX_AUDIO_PREVIEW_VOICES,
      voicesPerBatch: MAX_AUDIO_VOICES_PER_BATCH,
      scheduleLookaheadSeconds: MAX_AUDIO_SCHEDULE_LOOKAHEAD_SECONDS,
      minimumGateSeconds: MIN_AUDIO_GATE_SECONDS,
      maximumGateSeconds: MAX_AUDIO_GATE_SECONDS,
      maximumRecipeReleaseSeconds: MAX_AUDIO_RECIPE_RELEASE_SECONDS,
      sourceStopPaddingSeconds: 0.02,
      naturalCleanupSecondsAfterRelease:
        MAX_AUDIO_NATURAL_CLEANUP_SECONDS_AFTER_RELEASE,
      scheduledSourcesPerVoice: MAX_AUDIO_SCHEDULED_SOURCES_PER_VOICE,
      scheduledSourceNodes: MAX_AUDIO_SCHEDULED_SOURCE_NODES,
      registryIndexReferences: MAX_AUDIO_REGISTRY_INDEX_REFERENCES,
      persistentCreatedNodes: MAX_AUDIO_PERSISTENT_CREATED_NODES,
      persistentEdges: MAX_AUDIO_PERSISTENT_EDGES,
      impulseScalarSamples: MAX_AUDIO_IMPULSE_SCALAR_SAMPLES,
      impulseBytes: MAX_AUDIO_IMPULSE_BYTES,
      softClipCurveLength: MAX_AUDIO_SOFT_CLIP_CURVE_LENGTH,
      debugEvents: MAX_AUDIO_DEBUG_EVENTS,
    }).toEqual(X0_REVIEWED_LIMITS);
    expect(AUDIO_RETIREMENT_RELEASE_SECONDS).toEqual(
      X0_REVIEWED_RELEASE_SECONDS,
    );
    expect(AUDIO_POLYPHONY_ENFORCEMENT_ORDER).toEqual([
      "retrigger-retirement",
      "owner-kind-limit",
      "instrument-recipe-limit",
      "global-limit",
      "retained-tail-capacity",
      "new-voice-creation",
    ]);
    expect(AUDIO_STEAL_ORDER).toHaveLength(4);
    expect(AUDIO_STEAL_ELIGIBILITY_POLICY).toBe(
      "nonreleasing-only-because-victim-must-reduce-admission-deficit",
    );
    expect(AUDIO_INITIALIZATION_VALIDATION_ORDER).toHaveLength(9);
    expect(AUDIO_ATTACK_VALIDATION_ORDER).toHaveLength(11);
    expect(AUDIO_RETIREMENT_VALIDATION_ORDER).toHaveLength(4);
    expect(AUDIO_DEBUG_EVENT_KINDS).toHaveLength(14);
    expect(AUDIO_VOICE_PHASES).toEqual([
      "scheduled",
      "attacking",
      "sustaining",
      "releasing",
    ]);
    expect(AUDIO_RETIREMENT_REASONS).toHaveLength(7);
    expect(AUDIO_RETIREMENT_SELECTOR_KINDS).toHaveLength(7);
    expect(AUDIO_CONTEXT_CREATION_OPTIONS).toEqual({ latencyHint: "interactive" });
    expect(AUDIO_MIX_POLICY.automation).toBe(
      "cancel-and-hold-then-linear-ramp",
    );
    expect(AUDIO_RETRIGGER_POLICY.match).toBe(
      "exact-owner-event-midi-pitch",
    );
    expect(AUDIO_PARAMETER_SCHEDULING_POLICY.cancellation).toContain(
      "analytic-hold",
    );
    expect(AUDIO_ESTIMATED_ENVELOPE_POLICY.id).toBe(
      "changes.audio.estimated-envelope.v1",
    );
  });

  test("graph, recipes, normalization, pulse, and impulse match independent values", () => {
    expect(AUDIO_GRAPH_NODE_IDS).toEqual(X0_REVIEWED_GRAPH_NODE_IDS);
    expect(AUDIO_GRAPH_EDGE_ENTRIES.map(({ from, to }) => [from, to])).toEqual(
      X0_REVIEWED_GRAPH_EDGES.map(([from, to]) => [from, to]),
    );
    expect(AUDIO_PERSISTENT_GRAPH_SETTINGS).toEqual({
      createdNodeCount: 12,
      persistentEdgeCount: 13,
      ...X0_REVIEWED_GRAPH_SETTINGS,
    });
    expect([AUDIO_RECIPE_SET_ID, AUDIO_RECIPE_SET_VERSION]).toEqual([
      "changes.audio.instrument-recipes",
      1,
    ]);
    expect(AUDIO_INSTRUMENT_RECIPES.map((recipe) => recipe.id)).toEqual(
      [...X0_REVIEWED_RECIPE_IDS],
    );
    expect(AUDIO_INSTRUMENT_RECIPES.map((recipe) => recipe.outputLevel)).toEqual(
      [...X0_REVIEWED_RECIPE_LEVELS],
    );
    expect(AUDIO_INSTRUMENT_RECIPES.map((recipe) => recipe.polyphonyLimit)).toEqual(
      [...X0_REVIEWED_RECIPE_POLYPHONY],
    );
    expect(AUDIO_INSTRUMENT_RECIPES.map(sourceCount)).toEqual(
      [...X0_REVIEWED_RECIPE_SOURCE_COUNTS],
    );
    expect(AUDIO_NORMALIZATION_POLICY).toMatchObject({
      id: "changes.audio.voice-normalization.v1",
      maximumVoiceCount: 16,
      maximumVelocity: 127,
    });
    expect(AUDIO_PULSE_WAVE_POLICY).toMatchObject({
      dutyCycle: 0.25,
      harmonicCount: 32,
      dcCoefficient: 0,
    });
    expect(AUDIO_IMPULSE_POLICY).toEqual({
      algorithmId: X0_REVIEWED_IMPULSE.algorithmId,
      seedUint32: X0_REVIEWED_IMPULSE.seedUint32,
      channels: X0_REVIEWED_IMPULSE.channels,
      durationSeconds: X0_REVIEWED_IMPULSE.durationSeconds,
      predelayDivisor: X0_REVIEWED_IMPULSE.predelayDivisor,
      lowpassAlphaQ15: X0_REVIEWED_IMPULSE.lowpassAlphaQ15,
      lowpassStages: X0_REVIEWED_IMPULSE.lowpassStages,
      minimumSampleRate: X0_REVIEWED_IMPULSE.minimumSampleRate,
      maximumSampleRate: X0_REVIEWED_IMPULSE.maximumSampleRate,
      referenceSampleRate: X0_REVIEWED_IMPULSE.referenceSampleRate,
      referenceFrames: X0_REVIEWED_IMPULSE.referenceFrames,
      q15Divisor: X0_REVIEWED_IMPULSE.q15Divisor,
      envelopeQ15Maximum: X0_REVIEWED_IMPULSE.envelopeQ15Maximum,
      convolverNormalize: X0_REVIEWED_IMPULSE.convolverNormalize,
      referenceInterleavedInt16LeSha256:
        X0_REVIEWED_IMPULSE.referenceInterleavedInt16LeSha256,
      referenceChannelInt16LeSha256:
        X0_REVIEWED_IMPULSE.referenceChannelInt16LeSha256,
      referencePeakQ15: X0_REVIEWED_IMPULSE.referencePeakQ15,
      referenceFinalStateUint32:
        X0_REVIEWED_IMPULSE.referenceFinalStateUint32,
    });
  });

  test("independent validator accepts the byte-bound reviewed package", async () => {
    const report = await validateX0Contract(fixtureRoot);
    expect(report).toEqual({
      schema: "changes.validation.x0-contract.v1",
      package: "X0",
      outcome: "pass",
      counts: X0_REVIEWED_COUNTS,
      findings: [],
    });
    expect(X0_REVIEWED_CONTRACT_BYTE_DIGEST).toHaveLength(64);
    expect(Object.values(X0_REVIEWED_BYTE_DIGESTS)).toHaveLength(10);
    for (const digest of Object.values(X0_REVIEWED_BYTE_DIGESTS)) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("render measurement settings are explicit reviewed authority", async () => {
    const render = await readJsonObject(join(fixtureRoot, "render-matrix.json"));
    expect(render["numericPolicy"]).toEqual(X0_REVIEWED_RENDER_POLICY);
  });

  test("trace authority links every reviewed case and names the X1 listening deferral", async () => {
    const [graph, lifecycle, registry, render, listening, traceLedger] =
      await Promise.all([
        readJsonObject(join(fixtureRoot, "graph-topology.json")),
        readJsonObject(join(fixtureRoot, "lifecycle-cases.json")),
        readJsonObject(join(fixtureRoot, "registry-cases.json")),
        readJsonObject(join(fixtureRoot, "render-matrix.json")),
        readJsonObject(join(fixtureRoot, "listening-rubric.json")),
        readJsonObject(join(fixtureRoot, "trace-ledger.json")),
      ]);
    const ids = (value: unknown, label: string): string[] =>
      requireArray(value, label).map((entry, index) => {
        const row = requireObject(entry, `${label}[${String(index)}]`);
        if (typeof row["id"] !== "string") {
          throw new Error(`X0_TEST_CASE_ID: ${label}[${String(index)}]`);
        }
        return row["id"];
      });
    const allCases = [
      ...ids(graph["routingCases"], "routingCases"),
      ...ids(lifecycle["cases"], "lifecycleCases"),
      ...ids(registry["cases"], "registryCases"),
      ...ids(render["cases"], "renderCases"),
      ...ids(listening["instrumentRows"], "listeningInstrumentRows"),
      ...ids(listening["scenarioRows"], "listeningScenarioRows"),
    ].sort();
    const traces = requireArray(traceLedger["traces"], "traces").map(
      (entry, index) => requireObject(entry, `traces[${String(index)}]`),
    );
    const linked = traces.flatMap((trace) =>
      requireArray(trace["caseIds"], "trace.caseIds") as string[]
    );
    const deferred = traces.flatMap((trace) =>
      trace["deferredCaseIds"] === undefined
        ? []
        : requireArray(
            trace["deferredCaseIds"],
            "trace.deferredCaseIds",
          ) as string[]
    );
    expect([...new Set([...linked, ...deferred])].sort()).toEqual(allCases);
    expect(deferred.sort()).toEqual([
      "X0-LISTEN-SCENE-003",
      "X0-LISTEN-SCENE-004",
      "X0-LISTEN-SCENE-005",
    ]);
    const listeningTrace = traces.find(
      (trace) => trace["id"] === "TR-X0-LISTENING",
    );
    expect(listeningTrace?.["deferredUntilPackage"]).toBe("X1");
  });

  test("all thirty-one semantic mutations are independently rejected", async () => {
    const mutationFixture = await readJsonObject(
      join(fixtureRoot, "mutation-controls.json"),
    );
    const controls = requireArray(mutationFixture["controls"], "controls").map(
      (entry, index) => {
        const control = requireObject(entry, `control ${String(index)}`);
        if (
          typeof control["id"] !== "string" ||
          typeof control["file"] !== "string" ||
          typeof control["pointer"] !== "string" ||
          typeof control["expectedFindingCode"] !== "string"
        ) {
          throw new Error(`X0_TEST_CONTROL_SHAPE: ${String(index)}`);
        }
        return {
          id: control["id"],
          file: control["file"],
          pointer: control["pointer"],
          value: control["value"],
          expectedFindingCode: control["expectedFindingCode"],
        };
      },
    );
    expect(controls).toHaveLength(31);

    const parent = await mkdtemp(join(tmpdir(), "jcpe x0 contract Ω path-"));
    const root = join(parent, "reviewed audio fixtures");
    try {
      for (const control of controls) {
        await rm(root, { recursive: true, force: true });
        await cp(fixtureRoot, root, { recursive: true });
        const path = join(root, control.file);
        const fixture = await readJsonObject(path);
        replacePointer(fixture, control.pointer, control.value);
        await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
        const report = await validateX0Contract(root);
        expect(report.outcome, control.id).toBe("fail");
        expect(findingCodes(report), control.id).toContain(
          control.expectedFindingCode,
        );
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  test("audio contracts preserve layer, offline, ownership, and API boundaries", async () => {
    const filenames = [
      "audio-engine-contract.ts",
      "audio-platform-contract.ts",
      "index.ts",
      "instrument-recipes-contract.ts",
    ];
    const forbiddenText = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bsetTimeout\s*\(/,
      /\bsetInterval\s*\(/,
      /\brequestAnimationFrame\s*\(/,
      /Math\.random\s*\(/,
      /\bDate\.now\s*\(/,
      /https?:\/\//,
      /\btelemetry\b/i,
      /\bprompt\b/i,
      /\bmodel client\b/i,
    ];

    for (const filename of filenames) {
      const path = join(audioSourceRoot, filename);
      const source = await readFile(path, "utf8");
      for (const pattern of forbiddenText) expect(source, filename).not.toMatch(pattern);
      expect(source, filename).not.toContain("../application");
      expect(source, filename).not.toContain("../ui");
      expect(source, filename).not.toContain("../compatibility");
      expect(source, filename).not.toContain(" as any");
      expect(source, filename).not.toContain("@ts-ignore");

      const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (!ts.isStringLiteral(specifier)) continue;
        expect(
          specifier.text === "../domain" || specifier.text.startsWith("./"),
          `${filename}: ${specifier.text}`,
        ).toBe(true);
      }
    }
  });

  test("handoff documentation and release-facing commands name X0", async () => {
    const [doc, architecture, packageSource, verifySource] = await Promise.all([
      readFile(contractDocPath, "utf8"),
      readFile(architecturePath, "utf8"),
      readFile(packagePath, "utf8"),
      readFile(verifyPath, "utf8"),
    ]);
    expect(doc).toContain("changes.audio.engine-contract.v1");
    expect(doc).toContain("L-AUDIO-02");
    expect(doc).toContain("OfflineAudioContext");
    expect(doc).toContain("Automation never claims to hear");
    expect(architecture).toContain("docs/X0_AUDIO_ENGINE_CONTRACT.md");
    expect(architecture).toContain("bun run validate:x0-contract");
    expect(architecture).toContain("bun run verify:x0-evidence");
    const packageJson = requireObject(JSON.parse(packageSource), "package");
    const scripts = requireObject(packageJson["scripts"], "package scripts");
    expect(scripts["validate:x0-contract"]).toBe(
      "bun scripts/validate-x0-contract.ts",
    );
    expect(scripts["verify:x0-evidence"]).toBe(
      "bun scripts/verify-x0-evidence.ts",
    );
    expect(verifySource).toContain('id: "x0-audio-engine-contract"');
    expect(verifySource).toContain('"scripts/validate-x0-contract.ts"');
    expect(verifySource).toContain('id: "x0-evidence"');
    expect(verifySource).toContain('"scripts/verify-x0-evidence.ts"');
  });
});
