import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

import type {
  BeatDuration,
  BeatPosition,
  BeatRange,
  FrozenVoicing,
  ManualVoicing,
  MidiTick,
  ValidatedDocument,
} from "../../src/domain";
import {
  MAX_PLAYBACK_PLAN_EVENTS,
  MAX_PLAYBACK_PLAN_MEASURES_VISITED,
  MAX_PLAYBACK_PLAN_OUTPUT_PITCHES,
  MAX_PLAYBACK_PLAN_PITCHES_PER_EVENT,
  MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
  MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS,
  PLAYBACK_ARTICULATION_KINDS,
  PLAYBACK_ARTICULATION_POLICY,
  PLAYBACK_ARTICULATION_POLICY_ID,
  PLAYBACK_ARTICULATION_POLICY_VERSION,
  PLAYBACK_EVENT_OWN_KEY_ORDER,
  PLAYBACK_EVENT_SCHEMA,
  PLAYBACK_GENERATED_CANDIDATE_INVALID_REASONS,
  PLAYBACK_LOOP_POLICY,
  PLAYBACK_LOOP_POLICY_ID,
  PLAYBACK_LOOP_POLICY_VERSION,
  PLAYBACK_PLAN_COMPILER_ID,
  PLAYBACK_PLAN_COMPILER_VERSION,
  PLAYBACK_PLAN_COMPILER_VERSION_TAG,
  PLAYBACK_PLAN_CONTRACT_SCHEMA,
  PLAYBACK_PLAN_MEMORY_LIMITS,
  PLAYBACK_PLAN_OPERATION_NAMES,
  PLAYBACK_PLAN_OUTPUT_POLICY,
  PLAYBACK_PLAN_OWN_KEY_ORDER,
  PLAYBACK_PLAN_REALIZATION_SCHEMA,
  PLAYBACK_PLAN_REFUSAL_PRECEDENCE,
  PLAYBACK_PLAN_REQUEST_SCHEMA,
  PLAYBACK_PLAN_RESULT_SCHEMA,
  PLAYBACK_PLAN_SCHEMA,
  PLAYBACK_PLAN_TERMINATIONS,
  PLAYBACK_PLAN_VALIDATION_PRECEDENCE,
  PLAYBACK_PLAN_WORK_INCREMENT_POLICY,
  PLAYBACK_PLAN_WORK_LIMITS,
  PLAYBACK_REALIZATION_BINDING_POLICY,
  PLAYBACK_REALIZATION_BINDING_POLICY_ID,
  PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
  PLAYBACK_TIMELINE_POLICY,
  PLAYBACK_VELOCITY_POLICY,
  PLAYBACK_VELOCITY_POLICY_ID,
  PLAYBACK_VELOCITY_POLICY_VERSION,
  type AvailableGeneratedPlaybackRealization,
  type CompilePlaybackPlan,
  type CompilePlaybackPlanFailure,
  type CompilePlaybackPlanRequest,
  type CompilePlaybackPlanResult,
  type CompilePlaybackPlanSuccess,
  type GeneratedPlaybackRealizationBinding,
  type PlaybackEvent,
  type PlaybackPlan,
  type PlaybackPlanGateRefusal,
  type PlaybackPlanLoopRefusal,
  type PlaybackPlanOperationName,
  type PlaybackPlanOperations,
  type PlaybackPlanRealizationRefusal,
  type PlaybackPlanRefusal,
  type PlaybackPlanRequestRefusal,
  type PlaybackPlanTimelineRefusal,
  type PlaybackPlanWorkCounterName,
  type PlaybackPlanWorkEvidence,
  type PlaybackPlanWorkLimitRefusal,
  type PlaybackRealizationBinding,
  type PlaybackRealizationMap,
  type StoredPlaybackRealizationBinding,
} from "../../src/playback";
import type {
  AutoVoicingRequest,
  StoredVoicingBypass,
  VoicingFailure,
} from "../../src/theory";
import {
  P0_EXPECTED_COUNTS,
  P0_REVIEWED_AUTHORITY_IDS,
  P0_REVIEWED_BYTE_DIGESTS,
  P0_REVIEWED_COMPANIONS,
  P0_REVIEWED_TRACE_IDS,
  validateP0Contract,
  type P0ContractValidationReport,
} from "../../scripts/validate-p0-contract";

setDefaultTimeout(60_000);

type JsonObject = Record<string, unknown>;
type Assert<Value extends true> = Value;
type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;
type Not<Value extends boolean> = Value extends true ? false : true;
type HasKey<Value, Key extends PropertyKey> = Key extends keyof Value
  ? true
  : false;

type FailureForCode<
  Code extends PlaybackPlanRefusal["code"],
  Branch = CompilePlaybackPlanFailure,
> = Branch extends {
  readonly refusal: infer Refusal extends PlaybackPlanRefusal;
}
  ? Code extends Refusal["code"]
    ? Branch
    : never
  : never;

type TerminationForCode<Code extends PlaybackPlanRefusal["code"]> =
  FailureForCode<Code>["evidence"]["termination"];

type Success = Extract<CompilePlaybackPlanResult, { ok: true }>;
type Failure = Extract<CompilePlaybackPlanResult, { ok: false }>;

const typeAssertions: readonly [
  Assert<Equal<PlaybackPlanOperationName, "compilePlaybackPlan">>,
  Assert<
    Equal<
      Parameters<CompilePlaybackPlan>,
      [request: CompilePlaybackPlanRequest]
    >
  >,
  Assert<Equal<ReturnType<CompilePlaybackPlan>, CompilePlaybackPlanResult>>,
  Assert<Equal<keyof PlaybackPlanOperations, "compilePlaybackPlan">>,
  Assert<Equal<CompilePlaybackPlanRequest["document"], ValidatedDocument>>,
  Assert<
    Equal<
      CompilePlaybackPlanRequest["realizedVoicings"],
      PlaybackRealizationMap
    >
  >,
  Assert<Equal<CompilePlaybackPlanRequest["loop"], BeatRange | null>>,
  Assert<Equal<PlaybackRealizationBinding["kind"], "generated" | "stored">>,
  Assert<
    Equal<
      GeneratedPlaybackRealizationBinding["request"],
      AutoVoicingRequest
    >
  >,
  Assert<
    Equal<
      GeneratedPlaybackRealizationBinding["outcome"],
      AvailableGeneratedPlaybackRealization | VoicingFailure
    >
  >,
  Assert<
    Equal<
      StoredPlaybackRealizationBinding["result"],
      StoredVoicingBypass<ManualVoicing | FrozenVoicing>
    >
  >,
  Assert<
    Equal<keyof PlaybackPlan, (typeof PLAYBACK_PLAN_OWN_KEY_ORDER)[number]>
  >,
  Assert<
    Equal<keyof PlaybackEvent, (typeof PLAYBACK_EVENT_OWN_KEY_ORDER)[number]>
  >,
  Assert<Equal<PlaybackPlan["totalBeats"], BeatPosition>>,
  Assert<Not<Equal<PlaybackPlan["totalBeats"], BeatDuration>>>,
  Assert<Equal<PlaybackPlan["totalTicks"], MidiTick>>,
  Assert<Equal<PlaybackEvent["sourceStartBeat"], BeatPosition>>,
  Assert<Equal<PlaybackEvent["sourceDurationBeats"], BeatDuration>>,
  Assert<Equal<PlaybackEvent["sourceOffsetBeats"], BeatDuration | null>>,
  Assert<Equal<PlaybackEvent["durationBeats"], BeatDuration>>,
  Assert<Equal<PlaybackEvent["gateDurationBeats"], BeatDuration>>,
  Assert<
    Equal<CompilePlaybackPlanSuccess["evidence"]["termination"], "complete">
  >,
  Assert<Not<HasKey<Success, "refusal">>>,
  Assert<Not<HasKey<Failure, "plan">>>,
  Assert<
    Not<"complete" extends Failure["evidence"]["termination"] ? true : false>
  >,
  Assert<
    Equal<
      TerminationForCode<PlaybackPlanRequestRefusal["code"]>,
      "request-invalid"
    >
  >,
  Assert<
    Equal<
      TerminationForCode<PlaybackPlanTimelineRefusal["code"]>,
      "timeline-invalid"
    >
  >,
  Assert<
    Equal<
      TerminationForCode<PlaybackPlanRealizationRefusal["code"]>,
      "realization-invalid"
    >
  >,
  Assert<
    Equal<
      TerminationForCode<PlaybackPlanLoopRefusal["code"]>,
      "loop-invalid"
    >
  >,
  Assert<
    Equal<
      TerminationForCode<PlaybackPlanGateRefusal["code"]>,
      "gate-invalid"
    >
  >,
  Assert<
    Equal<
      TerminationForCode<PlaybackPlanWorkLimitRefusal["code"]>,
      "work-limit-exceeded"
    >
  >,
  Assert<
    Equal<
      Exclude<keyof PlaybackPlanWorkEvidence, "termination">,
      PlaybackPlanWorkCounterName
    >
  >,
] = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
];

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/playback-plan", import.meta.url),
);
const contractFixturePath = join(
  fixtureRoot,
  "p0-playback-plan-contract.json",
);
const contractSourcePath = fileURLToPath(
  new URL("../../src/playback/playback-plan-contract.ts", import.meta.url),
);
const contractDocPath = fileURLToPath(
  new URL("../../docs/P0_PLAYBACK_PLAN_CONTRACT.md", import.meta.url),
);
const architecturePath = fileURLToPath(
  new URL("../../docs/ARCHITECTURE.md", import.meta.url),
);
const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
const verifyPath = fileURLToPath(
  new URL("../../scripts/verify.ts", import.meta.url),
);
const scratchBase = fileURLToPath(new URL("../../.tmp/", import.meta.url));

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, label: string): JsonObject {
  if (!isObject(value)) throw new TypeError(`P0_TEST_OBJECT: ${label}`);
  return value;
}

async function readJsonObject(path: string): Promise<JsonObject> {
  return requireObject(JSON.parse(await readFile(path, "utf8")), path);
}

async function withFixtureCopy(
  run: (root: string) => Promise<void>,
): Promise<void> {
  await mkdir(scratchBase, { recursive: true });
  const parent = await mkdtemp(join(scratchBase, "p0-contract-Ω-"));
  const root = join(parent, "reviewed fixtures");
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function findingCodes(
  report: P0ContractValidationReport,
): readonly string[] {
  return [...new Set(report.findings.map((finding) => finding.code))].sort();
}

describe("P0 exact playback-plan contract", () => {
  test("freezes the exact public type relationships", () => {
    expect([...typeAssertions]).toEqual(
      Array.from({ length: typeAssertions.length }, () => true),
    );
  });

  test("matches every reviewed identity, policy, ordering rule, and bound", async () => {
    const contract = await readJsonObject(contractFixturePath);
    const identity = requireObject(contract["identity"], "identity");
    expect({
      contractSchema: identity["contractSchema"],
      requestSchema: identity["requestSchema"],
      realizationBindingSchema: identity["realizationBindingSchema"],
      resultSchema: identity["resultSchema"],
      planSchema: identity["planSchema"],
      eventSchema: identity["eventSchema"],
      compilerId: identity["compilerId"],
      compilerVersion: identity["compilerVersion"],
      compilerVersionTag: identity["compilerVersionTag"],
      articulationPolicy: identity["articulationPolicy"],
      loopPolicy: identity["loopPolicy"],
      velocityPolicy: identity["velocityPolicy"],
      realizationBindingPolicy: identity["realizationBindingPolicy"],
      operationNames: identity["operationNames"],
    }).toEqual({
      contractSchema: PLAYBACK_PLAN_CONTRACT_SCHEMA,
      requestSchema: PLAYBACK_PLAN_REQUEST_SCHEMA,
      realizationBindingSchema: PLAYBACK_PLAN_REALIZATION_SCHEMA,
      resultSchema: PLAYBACK_PLAN_RESULT_SCHEMA,
      planSchema: PLAYBACK_PLAN_SCHEMA,
      eventSchema: PLAYBACK_EVENT_SCHEMA,
      compilerId: PLAYBACK_PLAN_COMPILER_ID,
      compilerVersion: PLAYBACK_PLAN_COMPILER_VERSION,
      compilerVersionTag: PLAYBACK_PLAN_COMPILER_VERSION_TAG,
      articulationPolicy: {
        id: PLAYBACK_ARTICULATION_POLICY_ID,
        version: PLAYBACK_ARTICULATION_POLICY_VERSION,
      },
      loopPolicy: {
        id: PLAYBACK_LOOP_POLICY_ID,
        version: PLAYBACK_LOOP_POLICY_VERSION,
      },
      velocityPolicy: {
        id: PLAYBACK_VELOCITY_POLICY_ID,
        version: PLAYBACK_VELOCITY_POLICY_VERSION,
      },
      realizationBindingPolicy: {
        id: PLAYBACK_REALIZATION_BINDING_POLICY_ID,
        version: PLAYBACK_REALIZATION_BINDING_POLICY_VERSION,
      },
      operationNames: PLAYBACK_PLAN_OPERATION_NAMES,
    });
    expect(contract["articulationKinds"]).toEqual(
      PLAYBACK_ARTICULATION_KINDS,
    );
    expect(contract["terminations"]).toEqual(PLAYBACK_PLAN_TERMINATIONS);
    expect(contract["refusalPrecedence"]).toEqual(
      PLAYBACK_PLAN_REFUSAL_PRECEDENCE,
    );
    expect(contract["generatedCandidateInvalidReasons"]).toEqual(
      PLAYBACK_GENERATED_CANDIDATE_INVALID_REASONS,
    );
    expect(contract["articulationPolicy"]).toEqual(
      PLAYBACK_ARTICULATION_POLICY,
    );
    expect(contract["loopPolicy"]).toEqual(PLAYBACK_LOOP_POLICY);
    expect(contract["timelinePolicy"]).toEqual(PLAYBACK_TIMELINE_POLICY);
    expect(contract["velocityPolicy"]).toEqual(PLAYBACK_VELOCITY_POLICY);
    expect(contract["realizationPolicy"]).toEqual(
      PLAYBACK_REALIZATION_BINDING_POLICY,
    );
    expect(contract["outputPolicy"]).toEqual(PLAYBACK_PLAN_OUTPUT_POLICY);
    expect(contract["workIncrementPolicy"]).toEqual(
      PLAYBACK_PLAN_WORK_INCREMENT_POLICY,
    );
    const { refusalCodeOrder, ...validationOrdering } =
      PLAYBACK_PLAN_VALIDATION_PRECEDENCE;
    expect(contract["refusalPrecedence"]).toEqual(refusalCodeOrder);
    expect(contract["validationOrdering"]).toEqual(validationOrdering);

    const limits = requireObject(contract["limits"], "limits");
    expect(limits).toEqual({
      maximumQuarterNoteBeats:
        MAX_PLAYBACK_PLAN_TOTAL_QUARTER_NOTE_BEATS,
      maximumRealizationBindings: MAX_PLAYBACK_PLAN_REALIZATION_BINDINGS,
      maximumEvents: MAX_PLAYBACK_PLAN_EVENTS,
      maximumPitchesPerEvent: MAX_PLAYBACK_PLAN_PITCHES_PER_EVENT,
      maximumOutputPitches: MAX_PLAYBACK_PLAN_OUTPUT_PITCHES,
      maximumSections: PLAYBACK_PLAN_WORK_LIMITS.sectionsVisited,
      maximumMeasuresVisited: MAX_PLAYBACK_PLAN_MEASURES_VISITED,
      work: PLAYBACK_PLAN_WORK_LIMITS,
      memory: PLAYBACK_PLAN_MEMORY_LIMITS,
    });
    expect(
      requireObject(contract["outputPolicy"], "outputPolicy")[
        "planOwnKeyOrder"
      ],
    ).toEqual(
      PLAYBACK_PLAN_OWN_KEY_ORDER,
    );
    expect(
      requireObject(contract["outputPolicy"], "outputPolicy")[
        "eventOwnKeyOrder"
      ],
    ).toEqual(
      PLAYBACK_EVENT_OWN_KEY_ORDER,
    );
    expect(contract["traceIds"]).toEqual(P0_REVIEWED_TRACE_IDS);
    expect(contract["authorityIds"]).toEqual(P0_REVIEWED_AUTHORITY_IDS);
    expect(Object.keys(P0_REVIEWED_BYTE_DIGESTS).sort()).toEqual(
      [...P0_REVIEWED_COMPANIONS, "p0-playback-plan-contract.json"].sort(),
    );
    expect(Object.keys(requireObject(
      contract["reviewedFileSha256"],
      "reviewedFileSha256",
    )).sort()).toEqual([...P0_REVIEWED_COMPANIONS].sort());
    expect(Object.isFrozen(
      PLAYBACK_PLAN_VALIDATION_PRECEDENCE.loopValidationOrder,
    )).toBe(true);
  });

  test("keeps the contract source inside the pure playback boundary", async () => {
    const source = await readFile(contractSourcePath, "utf8");
    const file = ts.createSourceFile(
      contractSourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const imports: string[] = [];
    for (const statement of file.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        imports.push(statement.moduleSpecifier.text);
      }
    }
    expect(imports).toEqual(["../domain", "../theory"]);
    for (const forbidden of [
      "AudioContext",
      "fetch(",
      "Date.now",
      "Math.random",
      "../application",
      "../audio",
      "../ui",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  test("accepts the reviewed fixtures deterministically", async () => {
    const first = await validateP0Contract();
    const second = await validateP0Contract();
    expect(first).toEqual(second);
    expect(first).toEqual({
      schema: "changes.validation.p0-contract.v1",
      package: "P0",
      outcome: "pass",
      counts: P0_EXPECTED_COUNTS,
      findings: [],
    });
  });

  test("rejects byte drift, extra files, duplicate keys, and semantic drift", async () => {
    await withFixtureCopy(async (root) => {
      await appendFile(join(root, "law-cases.json"), "\n", "utf8");
      expect(findingCodes(await validateP0Contract(root))).toEqual([
        "P0_CONTRACT_BYTE_DIGEST",
      ]);
    });
    await withFixtureCopy(async (root) => {
      await writeFile(join(root, "unexpected.json"), "{}\n", "utf8");
      expect(findingCodes(await validateP0Contract(root))).toEqual([
        "P0_CONTRACT_FILE_SET",
      ]);
    });
    await withFixtureCopy(async (root) => {
      const path = join(root, "p0-playback-plan-contract.json");
      const source = await readFile(path, "utf8");
      const duplicate = source.replace(
        '{\n  "schema":',
        '{\n  "schema": "changes.fixtures.p0-playback-plan-contract.v1",\n  "schema":',
      );
      expect(duplicate).not.toBe(source);
      await writeFile(path, duplicate, "utf8");
      expect(findingCodes(await validateP0Contract(root))).toEqual([
        "P0_CONTRACT_BYTE_DIGEST",
        "P0_CONTRACT_DUPLICATE_KEY",
      ]);
    });
    await withFixtureCopy(async (root) => {
      const path = join(root, "realization-cases.json");
      const fixture = await readJsonObject(path);
      const cases = fixture["cases"];
      if (!Array.isArray(cases)) throw new TypeError("P0_TEST_CASES");
      const failure = requireObject(cases[4], "P0-REAL-005");
      const expected = requireObject(failure["expected"], "expected");
      expected["termination"] = "loop-invalid";
      await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
      expect(findingCodes(await validateP0Contract(root))).toContain(
        "P0_CONTRACT_REFUSAL_TERMINATION",
      );
    });
  });

  test("exposes the stable command and implementation handoff", async () => {
    const [architecture, contractDoc, packageJson, verifySource] =
      await Promise.all([
        readFile(architecturePath, "utf8"),
        readFile(contractDocPath, "utf8"),
        readJsonObject(packagePath),
        readFile(verifyPath, "utf8"),
      ]);
    const scripts = requireObject(packageJson["scripts"], "scripts");
    expect(scripts["validate:p0-contract"]).toBe(
      "bun scripts/validate-p0-contract.ts",
    );
    expect(architecture).toContain("docs/P0_PLAYBACK_PLAN_CONTRACT.md");
    expect(architecture).toContain("bun run validate:p0-contract");
    expect(contractDoc).toContain("compilePlaybackPlan");
    expect(contractDoc).toContain(
      "output is not authority for any expected result",
    );
    const f3 = verifySource.indexOf('id: "f3-publication-contract"');
    const p0 = verifySource.indexOf('id: "p0-playback-plan-contract"');
    const a0 = verifySource.indexOf('id: "a0-application-contract"');
    expect(f3).toBeGreaterThanOrEqual(0);
    expect(p0).toBeGreaterThan(f3);
    expect(a0).toBeGreaterThan(p0);
    expect(verifySource).toContain('"scripts/validate-p0-contract.ts"');
  });
});
