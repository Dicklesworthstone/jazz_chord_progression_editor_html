import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  VOICE_ASSIGNMENT_CONTRACT_SCHEMA as BARREL_CONTRACT_SCHEMA,
} from "../../src/theory";
import {
  MAX_VOICE_ASSIGNMENT_ARCS,
  MAX_VOICE_ASSIGNMENT_BACKTRACE_STEPS,
  MAX_VOICE_ASSIGNMENT_IDENTITY_COMPARISONS,
  MAX_VOICE_ASSIGNMENT_LOCKS,
  MAX_VOICE_ASSIGNMENT_MATRIX_CELLS,
  MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL,
  MAX_VOICE_ASSIGNMENT_RELATIONS,
  MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH,
  MAX_VOICE_ASSIGNMENT_ROLE_DEGREES,
  MAX_VOICE_ASSIGNMENT_ROLE_MEMBERSHIP_COMPARISONS,
  MAX_VOICE_ASSIGNMENT_ROLE_ORDER_COMPARISONS,
  MAX_VOICE_ASSIGNMENT_SCORE_COMPARISONS,
  MAX_VOICE_ASSIGNMENT_TRACKED_RECORDS,
  MAX_VOICE_ASSIGNMENT_TRANSITION_CANDIDATES,
  MAX_VOICE_ASSIGNMENT_VOICE_SERIAL,
  MAX_VOICE_ASSIGNMENT_VOICES,
  MIN_VOICE_ASSIGNMENT_VOICES,
  VOICE_ASSIGNMENT_ARC_SCHEMA,
  VOICE_ASSIGNMENT_CONTRACT_SCHEMA,
  VOICE_ASSIGNMENT_COST_AXIS_ORDER,
  VOICE_ASSIGNMENT_ENGINE_ID,
  VOICE_ASSIGNMENT_ENGINE_VERSION,
  VOICE_ASSIGNMENT_ENGINE_VERSION_TAG,
  VOICE_ASSIGNMENT_FRAME_SCHEMA,
  VOICE_ASSIGNMENT_IDENTITY_ALLOCATION_POLICY,
  VOICE_ASSIGNMENT_IDENTITY_QUESTIONS,
  VOICE_ASSIGNMENT_LOCK_SCHEMA,
  VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_ID,
  VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_VERSION,
  VOICE_ASSIGNMENT_MEMORY_LIMITS,
  VOICE_ASSIGNMENT_MOTION_KINDS,
  VOICE_ASSIGNMENT_NO_ASSIGNMENT_REASONS,
  VOICE_ASSIGNMENT_OPERATION_NAMES,
  VOICE_ASSIGNMENT_OPERATION_ORDER,
  VOICE_ASSIGNMENT_POLICY_ID,
  VOICE_ASSIGNMENT_POLICY_VERSION,
  VOICE_ASSIGNMENT_REFUSAL_CODES,
  VOICE_ASSIGNMENT_REPORTED_COST_AXES,
  VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
  VOICE_ASSIGNMENT_REQUEST_SCHEMA,
  VOICE_ASSIGNMENT_RESULT_SCHEMA,
  VOICE_ASSIGNMENT_ROLE_POLICY_ID,
  VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
  VOICE_ASSIGNMENT_TERMINATIONS,
  VOICE_ASSIGNMENT_TIE_BREAK_POLICY_ID,
  VOICE_ASSIGNMENT_TIE_BREAK_POLICY_VERSION,
  VOICE_ASSIGNMENT_VALUE_LIMITS,
  VOICE_ASSIGNMENT_VALIDATION_PRECEDENCE,
  VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE,
  VOICE_ASSIGNMENT_WORK_LIMITS,
  VOICE_LOCK_STATUSES,
  VOICE_IDENTITY_POLICY_ID,
  VOICE_IDENTITY_POLICY_VERSION,
  VOICE_MOTION_RELATION_KINDS,
  type VoiceAssignmentInputRefusal,
  type VoiceAssignmentRefusalCode,
} from "../../src/theory/voice-assignment-contract";
import {
  V1_REVIEWED_AUTHORITY_IDS,
  V1_REVIEWED_COMPANIONS,
  V1_REVIEWED_PUBLIC_CONTRACT,
  V1_REVIEWED_TRACE_IDS,
  validateV1Contract,
} from "../../scripts/validate-v1-contract";

setDefaultTimeout(60_000);

type Equal<Left, Right> =
  [Left] extends [Right]
    ? [Right] extends [Left]
      ? true
      : false
    : false;

function assertType<Constraint extends true>(proof?: Constraint): Constraint {
  return proof ?? (true as Constraint);
}

const typeProofs = [
  assertType<
    Equal<VoiceAssignmentRefusalCode, (typeof VOICE_ASSIGNMENT_REFUSAL_CODES)[number]>
  >(),
  assertType<
    Equal<
      VoiceAssignmentInputRefusal["code"],
      Exclude<
        VoiceAssignmentRefusalCode,
        | "voice_assignment.no_assignment"
        | "limit.voice_assignment_work_exceeded"
      >
    >
  >(),
] as const;

const fixtureRoot = fileURLToPath(
  new URL("../fixtures/voice-assignment", import.meta.url),
);

async function withFixtureCopy(
  run: (copyRoot: string) => Promise<void>,
): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "changes-v1-contract-"));
  const copyRoot = join(temporaryRoot, "voice-assignment");
  await cp(fixtureRoot, copyRoot, { recursive: true });
  try {
    await run(copyRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

describe("V1 independent contract", () => {
  test("matches every public identity, ordering, and bounded-resource constant", () => {
    const reviewed = V1_REVIEWED_PUBLIC_CONTRACT;
    expect(BARREL_CONTRACT_SCHEMA).toBe(VOICE_ASSIGNMENT_CONTRACT_SCHEMA);
    expect(reviewed.identity).toEqual({
      package: "V1",
      module: "src/theory/voice-assignment-contract.ts",
      contractSchema: VOICE_ASSIGNMENT_CONTRACT_SCHEMA,
      requestSchema: VOICE_ASSIGNMENT_REQUEST_SCHEMA,
      frameSchema: VOICE_ASSIGNMENT_FRAME_SCHEMA,
      resultSchema: VOICE_ASSIGNMENT_RESULT_SCHEMA,
      arcSchema: VOICE_ASSIGNMENT_ARC_SCHEMA,
      lockSchema: VOICE_ASSIGNMENT_LOCK_SCHEMA,
      engineId: VOICE_ASSIGNMENT_ENGINE_ID,
      engineVersion: VOICE_ASSIGNMENT_ENGINE_VERSION,
      engineVersionTag: VOICE_ASSIGNMENT_ENGINE_VERSION_TAG,
      policyId: VOICE_ASSIGNMENT_POLICY_ID,
      policyVersion: VOICE_ASSIGNMENT_POLICY_VERSION,
      identityPolicyId: VOICE_IDENTITY_POLICY_ID,
      identityPolicyVersion: VOICE_IDENTITY_POLICY_VERSION,
      tieBreakPolicyId: VOICE_ASSIGNMENT_TIE_BREAK_POLICY_ID,
      tieBreakPolicyVersion: VOICE_ASSIGNMENT_TIE_BREAK_POLICY_VERSION,
      rolePolicyId: VOICE_ASSIGNMENT_ROLE_POLICY_ID,
      rolePolicyVersion: VOICE_ASSIGNMENT_ROLE_POLICY_VERSION,
      lowRegisterPolicyId: VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_ID,
      lowRegisterPolicyVersion: VOICE_ASSIGNMENT_LOW_REGISTER_POLICY_VERSION,
    });
    expect(reviewed.operationNames).toEqual(VOICE_ASSIGNMENT_OPERATION_NAMES);
    expect(reviewed.operationOrder).toEqual(VOICE_ASSIGNMENT_OPERATION_ORDER);
    expect(reviewed.identityQuestions).toEqual(
      VOICE_ASSIGNMENT_IDENTITY_QUESTIONS,
    );
    expect(reviewed.motionRelationKinds).toEqual(
      VOICE_MOTION_RELATION_KINDS,
    );
    expect(reviewed.selectionAxisOrder).toEqual(
      VOICE_ASSIGNMENT_COST_AXIS_ORDER,
    );
    expect(reviewed.reportedCostAxes).toEqual(
      VOICE_ASSIGNMENT_REPORTED_COST_AXES,
    );
    expect(reviewed.inputLimits).toMatchObject({
      minimumVoices: MIN_VOICE_ASSIGNMENT_VOICES,
      maximumVoices: MAX_VOICE_ASSIGNMENT_VOICES,
      maximumLocks: MAX_VOICE_ASSIGNMENT_LOCKS,
      maximumRoleDegreesPerList: MAX_VOICE_ASSIGNMENT_ROLE_DEGREES,
      requestIdMaximumAsciiLength:
        MAX_VOICE_ASSIGNMENT_REQUEST_ID_ASCII_LENGTH,
      requestIdPattern: VOICE_ASSIGNMENT_REQUEST_ID_PATTERN_SOURCE,
      voiceIdPattern: VOICE_ASSIGNMENT_VOICE_ID_PATTERN_SOURCE,
      maximumVoiceSerial: MAX_VOICE_ASSIGNMENT_VOICE_SERIAL,
      maximumNextVoiceSerial: MAX_VOICE_ASSIGNMENT_NEXT_VOICE_SERIAL,
    });
    expect(reviewed.valueLimits).toEqual(VOICE_ASSIGNMENT_VALUE_LIMITS);
    expect(reviewed.workLimits).toEqual(VOICE_ASSIGNMENT_WORK_LIMITS);
    expect(VOICE_ASSIGNMENT_MEMORY_LIMITS).toEqual(reviewed.memoryLimits);
    expect(reviewed.refusalCodeOrder).toEqual(VOICE_ASSIGNMENT_REFUSAL_CODES);
    expect(reviewed.noAssignmentReasons).toEqual(
      VOICE_ASSIGNMENT_NO_ASSIGNMENT_REASONS,
    );
    expect(reviewed.lockStatuses).toEqual(VOICE_LOCK_STATUSES);
    expect(reviewed.terminations).toEqual(VOICE_ASSIGNMENT_TERMINATIONS);
    expect(reviewed.traceIds).toEqual(V1_REVIEWED_TRACE_IDS);
    expect(reviewed.authorityIds).toEqual(V1_REVIEWED_AUTHORITY_IDS);
    expect(MAX_VOICE_ASSIGNMENT_MATRIX_CELLS).toBe(64);
    expect(MAX_VOICE_ASSIGNMENT_TRANSITION_CANDIDATES).toBe(161);
    expect(MAX_VOICE_ASSIGNMENT_SCORE_COMPARISONS).toBe(98);
    expect(MAX_VOICE_ASSIGNMENT_BACKTRACE_STEPS).toBe(14);
    expect(MAX_VOICE_ASSIGNMENT_ARCS).toBe(14);
    expect(MAX_VOICE_ASSIGNMENT_RELATIONS).toBe(21);
    expect(MAX_VOICE_ASSIGNMENT_IDENTITY_COMPARISONS).toBe(49);
    expect(MAX_VOICE_ASSIGNMENT_ROLE_MEMBERSHIP_COMPARISONS).toBe(448);
    expect(MAX_VOICE_ASSIGNMENT_ROLE_ORDER_COMPARISONS).toBe(60);
    expect(MAX_VOICE_ASSIGNMENT_TRACKED_RECORDS).toBe(399);
    expect(VOICE_ASSIGNMENT_MOTION_KINDS).toEqual([
      "descending",
      "stationary",
      "ascending",
      "entering",
      "leaving",
    ]);
    expect(VOICE_ASSIGNMENT_VALIDATION_PRECEDENCE).toEqual({
      mode: "global-code-major",
      initializeFrameOrder: ["initial"],
      transitionFrameOrder: ["source", "target"],
      withinFrameOrder: "low-to-high",
      descendingMidiComparison: "strict-greater-than",
      equalMidiClassification: "voice_assignment.duplicate_midi",
      voiceSerialDigitCorrelationPrerequisite:
        "safe-integer-in-public-range",
    });
    expect(VOICE_ASSIGNMENT_IDENTITY_ALLOCATION_POLICY).toEqual({
      pathSelectionCapacityInput: "excluded",
      feasibilityPhase: "post-selection",
      exhaustionDisposition: "all-or-nothing-no-assignment",
      maySelectLowerRankedPathToConserveSerials: false,
      matrixStateIncludesIdentityCapacity: false,
    });
    expect(V1_REVIEWED_COMPANIONS).toHaveLength(8);
    expect(typeProofs.every(Boolean)).toBe(true);
  });

  test("validates the complete independently authored package", async () => {
    const report = await validateV1Contract();
    expect(report).toMatchObject({
      schema: "changes.validation.v1-contract.v1",
      package: "V1",
      outcome: "pass",
      counts: {
        files: 9,
        voiceSets: 20,
        assignmentCases: 18,
        lawCases: 12,
        operationStateCases: 17,
        publicLimitCases: 9,
        derivedLimitProbes: 29,
        mutationControls: 37,
        traces: 15,
        authorities: 6,
      },
      findings: [],
    });
  });

  test("rejects undeclared entries and decoded duplicate keys", async () => {
    await withFixtureCopy(async (copyRoot) => {
      await writeFile(join(copyRoot, "notes.txt"), "not reviewed\n", "utf8");
      const manifestPath = join(copyRoot, "v1-voice-assignment-contract.json");
      const manifestSource = await readFile(manifestPath, "utf8");
      await writeFile(
        manifestPath,
        manifestSource.replace(
          "{\n",
          '{\n  "schema": "changes.fixtures.v1-voice-assignment-contract.v1",\n',
        ),
        "utf8",
      );
      const report = await validateV1Contract(copyRoot);
      expect(report.outcome).toBe("fail");
      const findingCodes = report.findings.map((finding) => finding.code);
      expect(findingCodes).toContain("V1_FIXTURE_INVENTORY");
      expect(findingCodes).toContain("V1_JSON_DUPLICATE_KEY");
    });
  });

  test("rejects production-authored expectations and unknown top-level keys", async () => {
    await withFixtureCopy(async (copyRoot) => {
      const policyPath = join(copyRoot, "assignment-policy.json");
      const policy = JSON.parse(await readFile(policyPath, "utf8")) as Record<
        string,
        unknown
      >;
      policy["productionOutputUsed"] = true;
      policy["undeclared"] = "not reviewed";
      await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
      const report = await validateV1Contract(copyRoot);
      expect(report.outcome).toBe("fail");
      const findingCodes = report.findings.map((finding) => finding.code);
      expect(findingCodes).toContain("V1_PRODUCTION_AUTHORITY");
      expect(findingCodes).toContain("V1_TOP_LEVEL_KEYS");
    });
  });

  test("rejects broken case links and semantic tampering", async () => {
    await withFixtureCopy(async (copyRoot) => {
      const tracePath = join(copyRoot, "trace-ledger.json");
      const ledger = JSON.parse(await readFile(tracePath, "utf8")) as {
        traces: Array<{ caseIds: string[] }>;
      };
      ledger.traces[0]?.caseIds.push("V1-ASN-999");
      ledger.traces[0]?.caseIds.sort();
      await writeFile(tracePath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
      const report = await validateV1Contract(copyRoot);
      expect(report.outcome).toBe("fail");
      const findingCodes = report.findings.map((finding) => finding.code);
      expect(findingCodes).toContain("V1_LINK_UNKNOWN");
      expect(findingCodes).toContain("V1_SEMANTIC_DIGEST");
    });
  });
});
